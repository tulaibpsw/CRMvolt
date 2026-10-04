'use server'

import { redirect } from 'next/navigation'
import { refresh, revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { ATTEMPT_CHANNELS, DEPARTMENTS, LOST_REASONS, REVIEW_STATUSES, ROLES, STAGES, VISIT_STATUSES, type AttemptChannel, type Role } from '@/domain/constants'
import { attemptOutcomeInput, leadQuickAddInput, siteBasicsInput, teamSettingsInput } from '@/domain/schemas'
import { spreadsheetIdFrom } from '@/server/services/sheet'
import { getServerEnv } from '@/lib/env'
import { normalizePhone } from '@/lib/phone'
import { connectDb } from '@/server/db/connection'
import { AuditLog, Lead, Notification, Team, User, Visit } from '@/server/db/models'
import { hashPassword, passwordProblem, safeEqual, verifyPassword, verifyPasswordOrDummy } from '@/server/auth/password'
import { endSession, requireRole, requireUser, revokeSessions, startSession, type SessionUser } from '@/server/auth/session'
import { isObjectId, loadLeadFor, loadManagedUser, safeNext } from '@/server/auth/guards'
import { isAdminRole, isManagerOrAdmin } from '@/server/auth/scope'
import { acceptLead, autoAssign, checkIn, checkOut, drainQueue, manualAssign, managersOf, resetAssignment, toggleBreak } from '@/server/services/assignment'
import { logOutcome, reviewAttempt, tapAttempt } from '@/server/services/attempts'
import { errorState, logActivity, notify, oid, UserError, type ActionState } from '@/server/services/common'
import { ingestLead } from '@/server/services/ingest'
import { changeStage, reopenLead, transferLead } from '@/server/services/leads'
import { clear, hit, isBlocked } from '@/server/services/rate-limit'
import { pullSheet } from '@/server/services/sheet'
import { getSetting, setSetting } from '@/server/services/settings'
import { assignVisit, createVisit, updateVisit } from '@/server/services/visits'
import { sendWhatsAppText } from '@/server/services/whatsapp'
import { isHexColor, THEME_PRESETS } from '@/styles/runtime-theme'

const str = (fd: FormData, key: string) => {
  const v = fd.get(key)
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}
const num = (fd: FormData, key: string) => {
  const v = str(fd, key)
  if (v === undefined) return undefined
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : undefined
}
const pktLocal = (v: string | undefined) => (v ? new Date(`${v}:00+05:00`) : undefined)
const isRedirect = (error: unknown) => !!error && typeof error === 'object' && 'digest' in error && String((error as { digest: unknown }).digest).startsWith('NEXT_REDIRECT')
/** Run an action body; user-facing errors become a message, redirects pass through. */
async function attempt(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true }
  } catch (error) {
    if (isRedirect(error)) throw error
    return errorState(error)
  }
}
const clientIp = async () => (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || (await headers()).get('x-real-ip') || 'local'

const LOGIN_WINDOW_MS = 15 * 60_000
const LOGIN_USER_LIMIT = 5
const LOGIN_IP_LIMIT = 30

// ── Auth ──

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await connectDb()
  const login = (str(fd, 'login') ?? '').toLowerCase().slice(0, 120)
  const password = String(fd.get('password') ?? '').slice(0, 200)
  const ip = await clientIp()
  const userKey = `login:user:${login}`
  const ipKey = `login:ip:${ip}`
  const [byUser, byIp] = await Promise.all([isBlocked(userKey, LOGIN_USER_LIMIT), isBlocked(ipKey, LOGIN_IP_LIMIT)])
  if (byUser.blocked || byIp.blocked) return { ok: false, message: `Too many wrong tries. Wait ${Math.max(byUser.retryAfterMin, byIp.retryAfterMin)} minutes or ask your admin to reset your password.` }
  const user = login ? await User.findOne({ $or: [{ email: login }, { username: login }], deletedAt: null }).select('+passwordHash').lean() : null
  const ok = (await verifyPasswordOrDummy(password, user?.passwordHash)) && !!user?.isActive
  if (!ok || !user) {
    await Promise.all([hit(userKey, LOGIN_USER_LIMIT, LOGIN_WINDOW_MS), hit(ipKey, LOGIN_IP_LIMIT, LOGIN_WINDOW_MS)])
    return { ok: false, message: 'Wrong username or password' }
  }
  await clear(userKey)
  await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() })
  await startSession(String(user._id), (await headers()).get('user-agent') ?? undefined)
  redirect(user.mustChangePassword ? '/change-password' : safeNext(str(fd, 'next')))
}

export async function logoutAction(): Promise<void> {
  await endSession()
  redirect('/login')
}

/** First super admin, protected by MASTER_KEY. Disabled once any admin exists. */
export async function setupAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await connectDb()
  if (await User.exists({ role: { $in: ['admin', 'super_admin'] }, passwordHash: { $exists: true }, deletedAt: null })) return { ok: false, message: 'Setup is already done — sign in instead.' }
  const ipKey = `setup:ip:${await clientIp()}`
  if ((await isBlocked(ipKey, 5)).blocked) return { ok: false, message: 'Too many tries — wait an hour.' }
  const masterKey = getServerEnv().MASTER_KEY
  if (!masterKey || !safeEqual(str(fd, 'masterKey') ?? '', masterKey)) {
    await hit(ipKey, 5, 60 * 60_000)
    return { ok: false, message: 'Wrong master key' }
  }
  const parsed = z.object({ name: z.string().min(2), email: z.email(), username: z.string().regex(/^[a-z0-9._-]{3,30}$/), password: z.string().min(8) }).safeParse(Object.fromEntries(fd))
  if (!parsed.success) return errorState(parsed.error)
  const problem = passwordProblem(parsed.data.password, parsed.data.username)
  if (problem) return { ok: false, message: problem, fieldErrors: { password: problem } }
  const existing = await User.findOne({ email: parsed.data.email.toLowerCase() })
  const passwordHash = await hashPassword(parsed.data.password)
  const user = existing
    ? await User.findByIdAndUpdate(existing._id, { role: 'super_admin', passwordHash, username: parsed.data.username, isActive: true, deletedAt: null, mustChangePassword: false }, { returnDocument: 'after' })
    : await User.create({ name: parsed.data.name, email: parsed.data.email, username: parsed.data.username, role: 'super_admin', passwordHash })
  await AuditLog.create({ entity: 'user', entityId: user!._id, action: 'create', after: { role: 'super_admin', via: 'setup' }, actorId: user!._id })
  await startSession(String(user!._id))
  redirect('/dashboard')
}

/** Everyone can change their own password; required at first sign-in when someone else set it. */
export async function changePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser()
  return attempt(async (): Promise<ActionState> => {
    const current = String(fd.get('current') ?? '')
    const next = String(fd.get('password') ?? '')
    if (next !== String(fd.get('confirm') ?? '')) return { ok: false, message: 'The two new passwords are not the same', fieldErrors: { confirm: 'Not the same' } }
    const doc = await User.findById(user.id).select('+passwordHash username')
    if (!doc || !(await verifyPassword(current, doc.passwordHash))) return { ok: false, message: 'Your current password is wrong', fieldErrors: { current: 'Wrong password' } }
    if (current === next) return { ok: false, message: 'Choose a new password (not the same as now)' }
    const problem = passwordProblem(next, doc.username ?? undefined)
    if (problem) return { ok: false, message: problem, fieldErrors: { password: problem } }
    doc.set({ passwordHash: await hashPassword(next), mustChangePassword: false })
    await doc.save()
    await revokeSessions(user.id)
    await startSession(user.id, (await headers()).get('user-agent') ?? undefined)
    await AuditLog.create({ entity: 'user', entityId: oid(user.id), action: 'update', after: { password: 'changed by self' }, actorId: oid(user.id) })
    redirect('/dashboard?notice=password-changed')
  })
}

// ── Attendance ──

export async function checkInAction(): Promise<void> {
  const user = await requireUser()
  await checkIn(user.id)
  refresh()
}
export async function checkOutAction(): Promise<void> {
  const user = await requireUser()
  await checkOut(user.id)
  refresh()
}
export async function toggleBreakAction(): Promise<void> {
  const user = await requireUser()
  await toggleBreak(user.id).catch(() => undefined)
  refresh()
}

// ── Leads ──

export async function acceptLeadAction(fd: FormData): Promise<void> {
  const user = await requireUser()
  const leadId = fd.get('leadId')
  if (isObjectId(leadId)) await acceptLead(leadId, user.id).catch(() => undefined) // already accepted / moved on: just refresh
  refresh()
}

export async function tapAttemptAction(leadId: string, channel: AttemptChannel): Promise<{ attemptId: string; href: string } | { error: string }> {
  const user = await requireUser()
  if (!ATTEMPT_CHANNELS.includes(channel)) return { error: 'Bad channel' }
  try {
    return await tapAttempt(leadId, channel, user)
  } catch (error) {
    return { error: errorState(error)?.message ?? 'Failed' }
  }
}

export async function logOutcomeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser()
  return attempt(async () => {
    const ms = (key: string) => {
      const v = num(fd, key)
      return v !== undefined && v > 0 ? new Date(v) : undefined
    }
    const input = attemptOutcomeInput.parse({
      attemptId: str(fd, 'attemptId'),
      result: str(fd, 'result'),
      response: str(fd, 'response'),
      remarks: str(fd, 'remarks'),
      nextFollowUpAt: pktLocal(str(fd, 'nextFollowUpAt')),
      durationSec: num(fd, 'durationMin') !== undefined ? Math.round(num(fd, 'durationMin')! * 60) : undefined,
      closeLead: fd.get('closeLead') === 'on',
      wonValuePkr: num(fd, 'wonValuePkr'),
      leftAt: ms('leftAt'),
      returnedAt: ms('returnedAt'),
    })
    const publicId = str(fd, 'screenshotPublicId')
    await logOutcome({ ...input, screenshot: publicId ? { publicId, name: str(fd, 'screenshotName') ?? 'screenshot', mime: str(fd, 'screenshotMime') ?? 'image/jpeg', size: num(fd, 'screenshotSize') ?? 0 } : undefined }, user)
    refresh()
    return { ok: true, message: 'Saved' }
  })
}

const AGENT_CHANNELS = ['manual'] as const

export async function quickAddLeadAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole('admin', 'manager', 'agent')
  return attempt(async () => {
    const own = user.role !== 'admin' && user.role !== 'super_admin'
    const input = leadQuickAddInput.parse({
      name: str(fd, 'name'),
      phone: str(fd, 'phone'),
      city: str(fd, 'city'),
      // Managers and agents add leads only to their own department.
      department: own ? (user.departmentCode ?? 'INSTALLATION') : (str(fd, 'department') ?? 'INSTALLATION'),
      channel: user.role === 'agent' ? AGENT_CHANNELS[0] : (str(fd, 'channel') ?? 'manual'),
      sourceDetail: str(fd, 'sourceDetail'),
      notes: str(fd, 'notes'),
    })
    if ((await hit(`quick_add:${user.id}`, 30, 24 * 3_600_000)).blocked) return { ok: false, message: 'Daily limit for adding leads reached — ask your manager' }
    const result = await ingestLead({
      name: input.name,
      phone: input.phone,
      city: input.city,
      department: input.department,
      channel: input.channel,
      source: { campaignName: input.sourceDetail },
      notes: input.notes,
      actorId: user.id,
      // An agent's own walk-in / referral stays with them, and the manager is told.
      agentId: user.role === 'agent' ? user.id : null,
    })
    if (result.status === 'invalid_phone') return { ok: false, message: 'Invalid phone number' }
    if (result.status === 'reinquiry') return { ok: true, message: `This customer already has an open lead (${result.leadNo}) — "asked again" was added to it.` }
    if (result.status === 'duplicate_row') return { ok: false, message: 'Duplicate' }
    if (user.role === 'agent') {
      await notify({ userIds: await managersOf(user.departmentId), type: 'new_lead', title: `${user.name} added a lead for themselves`, body: result.leadNo, link: `/leads/${result.leadId}`, dedupeKey: `self_add:${result.leadId}` })
    }
    revalidatePath('/leads')
    redirect(`/leads/${result.leadId}`)
  })
}

export async function assignLeadAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole('admin', 'manager')
  return attempt(async () => {
    const lead = await loadLeadFor(user, fd.get('leadId'), 'manage')
    if (lead.status !== 'open') return { ok: false, message: 'Re-open the lead first' }
    const agentId = str(fd, 'agentId')
    if (!agentId) return { ok: false, message: 'Pick an agent' }
    if (agentId === 'auto') {
      await resetAssignment(lead._id, user.id, 'sent to round-robin by manager')
      const got = await autoAssign(lead._id)
      refresh()
      return { ok: true, message: got ? 'Given to the next agent in turn' : 'Nobody is checked in — it will go out when someone checks in' }
    }
    const target = await loadManagedUser(user, agentId, ['agent'])
    if (!target.isActive) return { ok: false, message: 'That agent is inactive' }
    await manualAssign(lead._id, agentId, user.id)
    refresh()
    return { ok: true, message: `Assigned to ${target.name}` }
  })
}

export async function bulkReassignAction(fd: FormData): Promise<void> {
  const user = await requireRole('admin', 'manager')
  const from = await loadManagedUser(user, fd.get('fromAgentId'), ['agent'])
  const leads = await Lead.find({ 'assignment.agentId': from._id, status: 'open', ...(user.role === 'manager' ? { departmentId: oid(user.departmentId!) } : {}) }).select('_id teamId').lean()
  for (const lead of leads) await resetAssignment(lead._id, user.id, `moved off ${from.name} by manager`)
  for (const teamId of new Set(leads.map((l) => l.teamId).filter(Boolean).map(String))) await drainQueue(teamId)
  await AuditLog.create({ entity: 'user', entityId: from._id, action: 'update', after: { bulkReassigned: leads.length }, actorId: oid(user.id) })
  refresh()
}

export async function changeStageAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole('admin', 'manager', 'agent')
  return attempt(async () => {
    const parsed = z.object({ stage: z.enum(STAGES), lostReason: z.enum(LOST_REASONS).optional() }).parse({ stage: fd.get('stage'), lostReason: str(fd, 'lostReason') })
    await changeStage(user, String(fd.get('leadId')), parsed.stage, { lostReason: parsed.lostReason, wonValuePkr: num(fd, 'wonValuePkr') })
    refresh()
    return { ok: true, message: 'Stage updated' }
  })
}

export async function reopenLeadAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole('admin', 'manager')
  return attempt(async () => {
    await reopenLead(user, String(fd.get('leadId')))
    refresh()
    return { ok: true, message: 'Re-opened and sent to the queue' }
  })
}

export async function transferDepartmentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole('admin', 'manager')
  return attempt(async () => {
    await transferLead(user, String(fd.get('leadId')), z.enum(DEPARTMENTS).parse(fd.get('department')), str(fd, 'reason') ?? '')
    refresh()
    return { ok: true, message: 'Moved' }
  })
}

export async function addNoteAction(fd: FormData): Promise<void> {
  const user = await requireRole('admin', 'manager', 'agent')
  const text = str(fd, 'text')
  if (text) {
    const lead = await loadLeadFor(user, fd.get('leadId'), 'view').catch(() => null)
    if (lead) await logActivity(lead._id, 'note_added', user.id, { text: text.slice(0, 2000) })
  }
  refresh()
}

export async function saveSiteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole('admin', 'manager', 'agent')
  return attempt(async () => {
    const site = siteBasicsInput.parse({
      propertyType: str(fd, 'propertyType'),
      monthlyBillPkr: num(fd, 'monthlyBillPkr'),
      monthlyUnits: num(fd, 'monthlyUnits'),
      roofType: str(fd, 'roofType'),
      shading: str(fd, 'shading'),
      targetKw: num(fd, 'targetKw'),
      batteryRequired: fd.get('batteryRequired') === 'on',
      netMeteringRequired: fd.get('netMeteringRequired') === 'on',
    })
    const lead = await loadLeadFor(user, fd.get('leadId'), user.role === 'agent' ? 'work' : 'view')
    lead.set('site', { ...(lead.site ? (lead.site as unknown as { toObject: () => object }).toObject() : {}), ...site })
    if (lead.stage === 'interested' || lead.stage === 'contacted') lead.set({ stage: 'requirement_collected', stageChangedAt: new Date() })
    await lead.save()
    await logActivity(lead._id, 'note_added', user.id, { text: 'Site details updated' })
    refresh()
    return { ok: true, message: 'Saved' }
  })
}

export async function sendWhatsAppAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole('admin', 'manager', 'agent')
  return attempt(async () => {
    const text = str(fd, 'text')
    if (!text) return { ok: false, message: 'Type a message' }
    await sendWhatsAppText(String(fd.get('leadId')), text, user)
    refresh()
    return { ok: true }
  })
}

// ── Visits ──

export async function createVisitAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole('admin', 'manager', 'agent')
  return attempt(async () => {
    const kw = num(fd, 'kw')
    if (!kw || kw <= 0 || kw > 5000) return { ok: false, message: 'Enter the system size in kW', fieldErrors: { kw: 'Required' } }
    await createVisit(
      {
        leadId: str(fd, 'leadId'),
        customerName: (str(fd, 'customerName') ?? '').slice(0, 120),
        phone: str(fd, 'phone') ?? '',
        address: (str(fd, 'address') ?? '').slice(0, 300),
        requirement: str(fd, 'requirement')?.slice(0, 1000),
        locationUrl: str(fd, 'locationUrl'),
        kw,
        scheduledAt: pktLocal(str(fd, 'scheduledAt')),
      },
      user,
    )
    refresh()
    return { ok: true, message: 'Visit created and assigned' }
  })
}

export async function updateVisitAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole('admin', 'manager', 'field_agent')
  return attempt(async () => {
    const status = z.enum(VISIT_STATUSES).parse(fd.get('status'))
    await updateVisit(String(fd.get('visitId')), status, str(fd, 'feedback') ?? '', user, pktLocal(str(fd, 'scheduledAt')))
    refresh()
    return { ok: true, message: 'Visit updated' }
  })
}

export async function reassignVisitAction(fd: FormData): Promise<void> {
  const user = await requireRole('admin', 'manager')
  const visitId = fd.get('visitId')
  if (isObjectId(visitId) && (await Visit.exists({ _id: visitId, ...(user.role === 'manager' ? { departmentId: { $in: [oid(user.departmentId!), null] } } : {}) }))) await assignVisit(visitId, user.id)
  refresh()
}

// ── Review ──

export async function reviewAttemptAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole('admin', 'manager')
  return attempt(async () => {
    const decision = z.enum(REVIEW_STATUSES).exclude(['pending']).parse(fd.get('decision'))
    await reviewAttempt(String(fd.get('attemptId')), decision, str(fd, 'note') ?? '', user)
    refresh()
    return { ok: true, message: decision === 'reviewed' ? 'Marked OK' : 'Disputed — the lead is re-opened if it was closed' }
  })
}

// ── Users & teams ──

/** Who may create / remove which roles. Managers and admins are managed by the super admin only. */
function creatableRoles(actor: SessionUser): Role[] {
  if (actor.role === 'super_admin') return ['admin', 'manager', 'agent', 'field_agent']
  if (actor.role === 'admin') return ['agent', 'field_agent']
  if (actor.role === 'manager') return ['agent', 'field_agent']
  return []
}

export async function createUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole('admin', 'manager')
  return attempt(async (): Promise<ActionState> => {
    const data = z
      .object({
        name: z.string().trim().min(2, 'Enter the full name').max(80),
        username: z.string().regex(/^[a-z0-9._-]{3,30}$/, 'Use 3–30 lowercase letters, numbers, . _ -'),
        email: z.email().optional(),
        phone: z.string().optional(),
        password: z.string().min(8, 'At least 8 characters').max(128),
        role: z.enum(ROLES),
        departmentId: z.string().optional(),
      })
      .parse({ name: str(fd, 'name'), username: str(fd, 'username')?.toLowerCase(), email: str(fd, 'email')?.toLowerCase(), phone: str(fd, 'phone'), password: String(fd.get('password') ?? ''), role: str(fd, 'role'), departmentId: str(fd, 'departmentId') })
    if (!creatableRoles(actor).includes(data.role)) return { ok: false, message: 'You cannot add this kind of user' }
    const problem = passwordProblem(data.password, data.username)
    if (problem) return { ok: false, message: problem, fieldErrors: { password: problem } }
    const departmentId = actor.role === 'manager' ? actor.departmentId : data.departmentId
    if (data.role !== 'admin' && !departmentId) return { ok: false, message: 'Pick a department', fieldErrors: { departmentId: 'Required' } }
    if (departmentId && !isObjectId(departmentId)) return { ok: false, message: 'Pick a department' }
    if (data.phone && !normalizePhone(data.phone)) return { ok: false, message: 'Phone number is not valid', fieldErrors: { phone: 'Invalid' } }
    const team = departmentId ? await Team.findOne({ departmentId: oid(departmentId) }) : null
    if (await User.exists({ $or: [{ username: data.username }, ...(data.email ? [{ email: data.email }] : [])] })) return { ok: false, message: 'That username or email is already used' }
    const user = await User.create({
      name: data.name,
      username: data.username,
      email: data.email ?? `${data.username}@volton.local`,
      phone: data.phone ? (normalizePhone(data.phone) ?? undefined) : undefined,
      role: data.role,
      departmentId: data.role === 'admin' ? null : departmentId ? oid(departmentId) : null,
      managerId: (data.role === 'agent' || data.role === 'field_agent') && team ? team.managerId : null,
      passwordHash: await hashPassword(data.password),
      // The person must choose their own password at first sign-in.
      mustChangePassword: true,
      createdBy: oid(actor.id),
    })
    if (data.role === 'agent' && team) {
      team.memberOrder.push(user._id)
      await team.save()
    }
    if (data.role === 'manager' && departmentId) {
      const existingTeam = await Team.findOne({ departmentId: oid(departmentId) })
      if (!existingTeam) await Team.create({ departmentId: oid(departmentId), managerId: user._id, name: `${data.name}'s team` })
      else {
        existingTeam.managerId = user._id
        await existingTeam.save()
      }
    }
    await AuditLog.create({ entity: 'user', entityId: user._id, action: 'create', after: { name: data.name, role: data.role, departmentId }, actorId: oid(actor.id) })
    refresh()
    return { ok: true, message: `${data.name} added. Username: ${data.username}. They must set their own password at first sign-in.` }
  })
}

/** Which users an actor may deactivate / delete / reset. */
async function loadUserForAdmin(actor: SessionUser, userId: unknown) {
  if (String(userId) === actor.id) throw new UserError('You cannot do this to your own account')
  const roles: string[] = actor.role === 'super_admin' ? ['admin', 'manager', 'agent', 'field_agent'] : ['agent', 'field_agent']
  return loadManagedUser(actor, userId, roles)
}

/** Take an inactive/removed user's work back: open leads to the queue, visits to other field agents, timers off. */
async function releaseWork(userId: string, actor: SessionUser, reason: string) {
  await revokeSessions(userId)
  const leads = await Lead.find({ 'assignment.agentId': oid(userId), status: 'open' }).select('_id teamId').lean()
  for (const lead of leads) await resetAssignment(lead._id, actor.id, reason)
  for (const teamId of new Set(leads.map((l) => l.teamId).filter(Boolean).map(String))) await drainQueue(teamId)
  const visits = await Visit.find({ agentId: oid(userId), status: { $in: ['assigned', 'rescheduled'] }, deletedAt: null }).select('_id').lean()
  for (const v of visits) await assignVisit(String(v._id), actor.id)
  await Team.updateMany({ memberOrder: oid(userId) }, { $pull: { memberOrder: oid(userId) } })
}

export async function setUserActiveAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole('admin', 'manager')
  return attempt(async () => {
    const target = await loadUserForAdmin(actor, fd.get('userId'))
    const active = fd.get('active') === 'true'
    await User.updateOne({ _id: target._id }, { isActive: active })
    if (!active) await releaseWork(String(target._id), actor, 'user deactivated')
    else if (target.role === 'agent') await Team.updateOne({ departmentId: target.departmentId, memberOrder: { $ne: target._id } }, { $push: { memberOrder: target._id } })
    await AuditLog.create({ entity: 'user', entityId: target._id, action: 'update', before: { isActive: target.isActive }, after: { isActive: active }, actorId: oid(actor.id) })
    refresh()
    return { ok: true, message: active ? `${target.name} is active again` : `${target.name} deactivated — their leads went back to the queue` }
  })
}

/** Remove a user (soft delete — history stays). Super admin: anyone; admin/manager: agents and field agents. */
export async function deleteUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole('admin', 'manager')
  return attempt(async () => {
    const target = await loadUserForAdmin(actor, fd.get('userId'))
    if (str(fd, 'confirm')?.toLowerCase() !== target.username?.toLowerCase()) return { ok: false, message: `Type the username "${target.username}" to confirm` }
    if (target.role === 'manager' && (await Team.exists({ managerId: target._id }))) {
      const other = await User.findOne({ role: 'manager', departmentId: target.departmentId, _id: { $ne: target._id }, isActive: true, deletedAt: null }).lean()
      await Team.updateMany({ managerId: target._id }, { managerId: other?._id ?? null })
    }
    await User.updateOne({ _id: target._id }, { isActive: false, deletedAt: new Date(), username: `${target.username}.deleted.${Date.now()}`, email: `deleted.${Date.now()}.${target.email}` })
    await releaseWork(String(target._id), actor, 'user removed')
    await AuditLog.create({ entity: 'user', entityId: target._id, action: 'soft_delete', before: { name: target.name, role: target.role }, actorId: oid(actor.id) })
    refresh()
    return { ok: true, message: `${target.name} removed` }
  })
}

export async function resetPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole('admin', 'manager')
  return attempt(async () => {
    const target = await loadUserForAdmin(actor, fd.get('userId'))
    const password = String(fd.get('password') ?? '')
    const problem = passwordProblem(password, target.username ?? undefined)
    if (problem) return { ok: false, message: problem }
    await User.updateOne({ _id: target._id }, { passwordHash: await hashPassword(password), mustChangePassword: true })
    await revokeSessions(String(target._id))
    await clear(`login:user:${target.username}`)
    await AuditLog.create({ entity: 'user', entityId: target._id, action: 'update', after: { password: 'reset' }, actorId: oid(actor.id) })
    return { ok: true, message: `Temporary password set for ${target.name}. They must change it at sign-in.` }
  })
}

export async function moveTeamMemberAction(fd: FormData): Promise<void> {
  const actor = await requireRole('admin', 'manager')
  const team = isObjectId(fd.get('teamId')) ? await Team.findById(String(fd.get('teamId'))) : null
  if (!team || (actor.role === 'manager' && String(team.departmentId) !== actor.departmentId)) return refresh()
  const order = team.memberOrder.map(String)
  const i = order.indexOf(String(fd.get('userId')))
  const j = fd.get('direction') === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= order.length) return refresh()
  ;[order[i], order[j]] = [order[j], order[i]]
  const before = team.memberOrder.map(String)
  team.set('memberOrder', order.map(oid))
  await team.save()
  await AuditLog.create({ entity: 'team', entityId: team._id, action: 'update', before: { memberOrder: before }, after: { memberOrder: order }, actorId: oid(actor.id) })
  refresh()
}

export async function setTeamMemberAction(fd: FormData): Promise<void> {
  const actor = await requireRole('admin', 'manager')
  const team = isObjectId(fd.get('teamId')) ? await Team.findById(String(fd.get('teamId'))) : null
  if (!team || (actor.role === 'manager' && String(team.departmentId) !== actor.departmentId)) return refresh()
  const userId = String(fd.get('userId'))
  const adding = fd.get('member') === 'true'
  if (adding) {
    // Only active call agents of this team's department can be in the order.
    const target = await User.findOne({ _id: isObjectId(userId) ? oid(userId) : null, role: 'agent', isActive: true, deletedAt: null, departmentId: team.departmentId }).lean()
    if (!target) return refresh()
  }
  const before = team.memberOrder.map(String)
  const order = before.filter((id: string) => id !== userId)
  if (adding) order.push(userId)
  team.set('memberOrder', order.map(oid))
  await team.save()
  await AuditLog.create({ entity: 'team', entityId: team._id, action: 'update', before: { memberOrder: before }, after: { memberOrder: order }, actorId: oid(actor.id) })
  refresh()
}

export async function updateTeamSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole('admin', 'manager')
  return attempt(async () => {
    const settings = teamSettingsInput.parse({
      managerWindowMin: num(fd, 'managerWindowMin'),
      acceptWithinMin: num(fd, 'acceptWithinMin'),
      contactWithinMin: num(fd, 'contactWithinMin'),
      maxPendingAccept: num(fd, 'maxPendingAccept'),
      autoMoveOnAcceptTimeout: fd.get('autoMoveOnAcceptTimeout') === 'on',
      paused: fd.get('paused') === 'on',
    })
    const team = isObjectId(fd.get('teamId')) ? await Team.findById(String(fd.get('teamId'))) : null
    if (!team || (actor.role === 'manager' && String(team.departmentId) !== actor.departmentId)) return { ok: false, message: 'Not allowed' }
    const before = Object.fromEntries(Object.keys(settings).map((k) => [k, team.get(k)]))
    team.set(settings)
    await team.save()
    await AuditLog.create({ entity: 'team', entityId: team._id, action: 'update', before, after: settings, actorId: oid(actor.id) })
    if (!settings.paused) await drainQueue(team._id)
    refresh()
    return { ok: true, message: 'Saved' }
  })
}

// ── Company settings (admin / super admin) ──

export async function saveSheetConfigAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole('admin')
  return attempt(async () => {
    const config = await getSetting('sheet_config')
    const tabs = (str(fd, 'tabs') ?? 'Leads')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((t) => {
        const [name, dept] = t.split(':').map((s) => s.trim())
        const department = DEPARTMENTS.find((d) => d.toLowerCase() === (dept ?? '').toLowerCase())
        return department ? { name: name.slice(0, 100), department } : { name: name.slice(0, 100) }
      })
    let headerOverrides = config.headerOverrides
    const rawOverrides = str(fd, 'headerOverrides')
    if (rawOverrides) {
      try {
        const parsed = JSON.parse(rawOverrides)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape')
        headerOverrides = parsed
      } catch {
        return { ok: false, message: 'Column overrides must be valid JSON, e.g. {"Client Name": "name"}' }
      }
    }
    const spreadsheetId = spreadsheetIdFrom(str(fd, 'spreadsheet') ?? '')
    if (spreadsheetId && !/^[a-zA-Z0-9-_]{20,}$/.test(spreadsheetId)) return { ok: false, message: 'That does not look like a Google Sheet link' }
    await setSetting('sheet_config', { ...config, spreadsheetId, tabs, headerOverrides }, actor.id)
    await AuditLog.create({ entity: 'setting', entityId: null, action: 'update', after: { key: 'sheet_config', tabs: tabs.map((t) => t.name) }, actorId: oid(actor.id) })
    refresh()
    return { ok: true, message: 'Saved' }
  })
}

export async function pullSheetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole('admin', 'manager')
  return attempt(async () => {
    const mode = (str(fd, 'mode') ?? 'live') as 'live' | 'history' | 'skip'
    if (mode !== 'live' && !isAdminRole(actor.role)) return { ok: false, message: 'Only an admin can import history or restart the Sheet' }
    if (!['live', 'history', 'skip'].includes(mode)) return { ok: false, message: 'Unknown mode' }
    const results = await pullSheet(mode)
    if (results === null) return { ok: false, message: 'A pull is already running — try again in a minute.' }
    refresh()
    const text = results
      .map((r) =>
        r.missingRequired.length
          ? `${r.tab}: no phone column found`
          : r.needsStart
            ? `${r.tab}: first choose "Import ALL rows as history" or "Start from now"`
            : `${r.tab}: ${r.created} new, ${r.reinquiry} asked again, ${r.skipped} skipped, ${r.invalid} bad phone${r.failed ? `, ${r.failed} failed (${r.errors[0] ?? ''})` : ''}`,
      )
      .join(' · ')
    return { ok: true, message: text || 'No Sheet configured' }
  })
}

export async function saveWorkingHoursAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole('admin')
  return attempt(async () => {
    const days = fd.getAll('days').map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    const start = time.parse(str(fd, 'start') ?? '10:00')
    const end = time.parse(str(fd, 'end') ?? '19:00')
    if (start >= end) return { ok: false, message: 'Closing time must be after opening time' }
    if (!days.length) return { ok: false, message: 'Pick at least one working day' }
    await setSetting('working_hours', { start, end, days }, actor.id)
    await AuditLog.create({ entity: 'setting', entityId: null, action: 'update', after: { key: 'working_hours', start, end, days }, actorId: oid(actor.id) })
    refresh()
    return { ok: true, message: 'Saved' }
  })
}

/** Brand colours (Settings → Appearance). Admin and super admin. Text colours are computed for contrast. */
export async function saveThemeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole('admin')
  return attempt(async () => {
    const preset = THEME_PRESETS.find((p) => p.id === str(fd, 'preset'))
    const brand = preset?.colors.brand ?? str(fd, 'brand')
    const ink = preset?.colors.ink ?? str(fd, 'ink')
    if (!isHexColor(brand) || !isHexColor(ink)) return { ok: false, message: 'Pick two colours' }
    await setSetting('theme', { brand: brand.toLowerCase(), ink: ink.toLowerCase() }, actor.id)
    await AuditLog.create({ entity: 'setting', entityId: null, action: 'update', after: { key: 'theme', brand, ink }, actorId: oid(actor.id) })
    revalidatePath('/', 'layout')
    return { ok: true, message: 'Colours saved for everyone' }
  })
}

// ── Notifications ──

export async function markNotificationsReadAction(): Promise<void> {
  const user = await requireUser()
  await Notification.updateMany({ userId: oid(user.id), readAt: null }, { readAt: new Date() })
  refresh()
}

export async function guardManager() {
  const user = await requireUser()
  return isManagerOrAdmin(user)
}
