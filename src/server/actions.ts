'use server'

import { redirect } from 'next/navigation'
import { refresh, revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { ATTEMPT_CHANNELS, DEPARTMENTS, LOST_REASONS, REVIEW_STATUSES, ROLES, STAGES, VISIT_STATUSES, type AttemptChannel, type Stage } from '@/domain/constants'
import { attemptOutcomeInput, leadQuickAddInput, siteBasicsInput, teamSettingsInput } from '@/domain/schemas'
import { spreadsheetIdFrom } from '@/server/services/sheet'
import { getServerEnv } from '@/lib/env'
import { connectDb } from '@/server/db/connection'
import { AuditLog, DocumentFile, Department, Lead, Notification, Team, User } from '@/server/db/models'
import { hashPassword, verifyPassword } from '@/server/auth/password'
import { endSession, requireRole, requireUser, revokeSessions, startSession } from '@/server/auth/session'
import { isManagerOrAdmin } from '@/server/auth/scope'
import { acceptLead, checkIn, checkOut, drainQueue, manualAssign, toggleBreak } from '@/server/services/assignment'
import { logOutcome, reviewAttempt, tapAttempt } from '@/server/services/attempts'
import { errorState, logActivity, oid, type ActionState } from '@/server/services/common'
import { ingestLead } from '@/server/services/ingest'
import { pullSheet } from '@/server/services/sheet'
import { getSetting, setSetting } from '@/server/services/settings'
import { createVisit, updateVisit } from '@/server/services/visits'
import { sendWhatsAppText } from '@/server/services/whatsapp'

const str = (fd: FormData, key: string) => {
  const v = fd.get(key)
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}
const num = (fd: FormData, key: string) => {
  const v = str(fd, key)
  return v === undefined ? undefined : Number(v)
}

// ── Auth ──

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await connectDb()
  const login = (str(fd, 'login') ?? '').toLowerCase()
  const password = str(fd, 'password') ?? ''
  const user = await User.findOne({ $or: [{ email: login }, { username: login }], deletedAt: null }).select('+passwordHash').lean()
  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) return { ok: false, message: 'Wrong username or password' }
  await startSession(String(user._id), (await headers()).get('user-agent') ?? undefined)
  const next = str(fd, 'next')
  redirect(next?.startsWith('/') ? next : '/dashboard')
}

export async function logoutAction(): Promise<void> {
  await endSession()
  redirect('/login')
}

/** First admin, protected by MASTER_KEY. Disabled once any admin exists. */
export async function setupAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await connectDb()
  if (await User.exists({ role: 'admin', passwordHash: { $exists: true } })) return { ok: false, message: 'Setup is already done — sign in instead.' }
  const masterKey = getServerEnv().MASTER_KEY
  if (!masterKey || str(fd, 'masterKey') !== masterKey) return { ok: false, message: 'Wrong master key' }
  const parsed = z.object({ name: z.string().min(2), email: z.email(), username: z.string().regex(/^[a-z0-9._-]{3,30}$/), password: z.string().min(8) }).safeParse(Object.fromEntries(fd))
  if (!parsed.success) return errorState(parsed.error)
  const existing = await User.findOne({ email: parsed.data.email.toLowerCase() })
  const passwordHash = await hashPassword(parsed.data.password)
  const user = existing
    ? await User.findByIdAndUpdate(existing._id, { role: 'admin', passwordHash, username: parsed.data.username, isActive: true }, { returnDocument: 'after' })
    : await User.create({ name: parsed.data.name, email: parsed.data.email, username: parsed.data.username, role: 'admin', passwordHash })
  await startSession(String(user!._id))
  redirect('/dashboard')
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
  await toggleBreak(user.id)
  refresh()
}

// ── Leads ──

export async function acceptLeadAction(fd: FormData): Promise<void> {
  const user = await requireUser()
  await acceptLead(String(fd.get('leadId')), user.id)
  refresh()
}

export async function tapAttemptAction(leadId: string, channel: AttemptChannel): Promise<{ attemptId: string; href: string } | { error: string }> {
  const user = await requireUser()
  if (!ATTEMPT_CHANNELS.includes(channel)) return { error: 'Bad channel' }
  try {
    return await tapAttempt(leadId, channel, user)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed' }
  }
}

export async function logOutcomeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser()
  try {
    const input = attemptOutcomeInput.parse({
      attemptId: str(fd, 'attemptId'),
      result: str(fd, 'result'),
      response: str(fd, 'response'),
      remarks: str(fd, 'remarks'),
      nextFollowUpAt: str(fd, 'nextFollowUpAt') ? new Date(`${str(fd, 'nextFollowUpAt')}:00+05:00`) : undefined,
      durationSec: num(fd, 'durationMin') !== undefined ? Math.round(num(fd, 'durationMin')! * 60) : undefined,
      closeLead: fd.get('closeLead') === 'on',
      leftAt: str(fd, 'leftAt') ? new Date(Number(str(fd, 'leftAt'))) : undefined,
      returnedAt: str(fd, 'returnedAt') ? new Date(Number(str(fd, 'returnedAt'))) : undefined,
    })
    const screenshotIds: string[] = []
    const publicId = str(fd, 'screenshotPublicId')
    if (publicId) {
      const doc = await DocumentFile.create({ ownerType: 'attempt', ownerId: oid(input.attemptId), category: 'attempt_screenshot', fileName: str(fd, 'screenshotName') ?? 'screenshot', mime: str(fd, 'screenshotMime') ?? 'image/jpeg', size: num(fd, 'screenshotSize') ?? 0, storageKey: publicId, uploadedBy: oid(user.id) })
      screenshotIds.push(String(doc._id))
    }
    await logOutcome({ ...input, screenshotDocIds: screenshotIds }, user)
    refresh()
    return { ok: true, message: 'Saved' }
  } catch (error) {
    return errorState(error)
  }
}

export async function quickAddLeadAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser()
  try {
    const input = leadQuickAddInput.parse({ name: str(fd, 'name'), phone: str(fd, 'phone'), city: str(fd, 'city'), department: str(fd, 'department') ?? user.departmentCode ?? 'INSTALLATION', channel: str(fd, 'channel') ?? 'manual', sourceDetail: str(fd, 'sourceDetail'), notes: str(fd, 'notes') })
    const result = await ingestLead({
      name: input.name,
      phone: input.phone,
      city: input.city,
      department: input.department,
      channel: input.channel,
      source: { campaignName: input.sourceDetail },
      notes: input.notes,
      actorId: user.id,
      agentId: user.role === 'agent' ? user.id : null,
    })
    if (result.status === 'invalid_phone') return { ok: false, message: 'Invalid phone number' }
    if (result.status === 'reinquiry') return { ok: true, message: `Already an open lead (${result.leadNo}) — added "asked again" to it.` }
    if (result.status === 'duplicate_row') return { ok: false, message: 'Duplicate' }
    revalidatePath('/leads')
    redirect(`/leads/${result.leadId}`)
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error
    return errorState(error)
  }
}

export async function assignLeadAction(fd: FormData): Promise<void> {
  const user = await requireRole('admin', 'manager')
  const leadId = String(fd.get('leadId'))
  const agentId = str(fd, 'agentId')
  if (agentId === 'auto') {
    const { autoAssign } = await import('@/server/services/assignment')
    await Lead.updateOne({ _id: oid(leadId) }, { 'assignment.state': 'waiting' })
    await autoAssign(leadId)
  } else if (agentId) await manualAssign(leadId, agentId, user.id)
  refresh()
}

export async function bulkReassignAction(fd: FormData): Promise<void> {
  const user = await requireRole('admin', 'manager')
  const fromId = String(fd.get('fromAgentId'))
  const leads = await Lead.find({ 'assignment.agentId': oid(fromId), status: 'open', ...(user.role === 'manager' ? { departmentId: oid(user.departmentId!) } : {}) }).select('_id teamId').lean()
  for (const lead of leads) await Lead.updateOne({ _id: lead._id }, { 'assignment.state': 'waiting', 'assignment.agentId': null })
  for (const teamId of new Set(leads.map((l) => String(l.teamId)))) await drainQueue(teamId)
  refresh()
}

export async function changeStageAction(fd: FormData): Promise<void> {
  const user = await requireUser()
  const parsed = z.object({ leadId: z.string(), stage: z.enum(STAGES), lostReason: z.enum(LOST_REASONS).optional() }).parse({ leadId: fd.get('leadId'), stage: fd.get('stage'), lostReason: str(fd, 'lostReason') })
  const lead = await Lead.findById(parsed.leadId)
  if (!lead) throw new Error('Lead not found')
  if (user.role === 'agent' && String(lead.assignment?.agentId) !== user.id) throw new Error('Not your lead')
  const stage: Stage = parsed.stage
  lead.set({ stage, stageChangedAt: new Date(), updatedBy: oid(user.id) })
  if (stage === 'won') lead.set({ status: 'won', closedAt: new Date(), wonValuePkr: num(fd, 'wonValuePkr') ?? lead.wonValuePkr })
  if (stage === 'lost') lead.set({ status: 'lost', closedAt: new Date(), lostReason: parsed.lostReason ?? 'other' })
  await lead.save()
  await logActivity(lead._id, 'stage_changed', user.id, { stage, lostReason: parsed.lostReason })
  refresh()
}

export async function reopenLeadAction(fd: FormData): Promise<void> {
  const user = await requireRole('admin', 'manager')
  const lead = await Lead.findByIdAndUpdate(String(fd.get('leadId')), { status: 'open', closedAt: null, lostReason: null, noAnswerStreak: 0, stage: 'contacted' })
  if (lead) await logActivity(lead._id, 'status_changed', user.id, { status: 'open' })
  refresh()
}

export async function transferDepartmentAction(fd: FormData): Promise<void> {
  const user = await requireRole('admin', 'manager')
  const code = z.enum(DEPARTMENTS).parse(fd.get('department'))
  const dept = await Department.findOne({ code }).lean()
  const team = dept ? await Team.findOne({ departmentId: dept._id }).lean() : null
  const lead = await Lead.findByIdAndUpdate(String(fd.get('leadId')), { departmentId: dept?._id, teamId: team?._id ?? null, 'assignment.state': 'waiting', 'assignment.agentId': null })
  if (lead) {
    await logActivity(lead._id, 'status_changed', user.id, { transferredTo: code })
    if (team) await drainQueue(team._id)
  }
  refresh()
}

export async function addNoteAction(fd: FormData): Promise<void> {
  const user = await requireUser()
  const text = str(fd, 'text')
  if (text) await logActivity(String(fd.get('leadId')), 'note_added', user.id, { text: text.slice(0, 2000) })
  refresh()
}

export async function saveSiteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser()
  try {
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
    const leadId = String(fd.get('leadId'))
    const lead = await Lead.findById(leadId)
    if (!lead) return { ok: false, message: 'Lead not found' }
    lead.set('site', { ...(lead.site ? (lead.site as unknown as { toObject: () => object }).toObject() : {}), ...site })
    if (lead.stage === 'interested' || lead.stage === 'contacted') lead.set({ stage: 'requirement_collected', stageChangedAt: new Date() })
    await lead.save()
    await logActivity(leadId, 'note_added', user.id, { text: 'Site details updated' })
    refresh()
    return { ok: true, message: 'Saved' }
  } catch (error) {
    return errorState(error)
  }
}

export async function sendWhatsAppAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser()
  try {
    const text = str(fd, 'text')
    if (!text) return { ok: false, message: 'Type a message' }
    await sendWhatsAppText(String(fd.get('leadId')), text, user)
    refresh()
    return { ok: true }
  } catch (error) {
    return errorState(error)
  }
}

// ── Visits ──

export async function createVisitAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole('admin', 'manager', 'agent')
  try {
    const kw = num(fd, 'kw')
    if (!kw || kw <= 0) return { ok: false, message: 'Enter the system size in kW', fieldErrors: { kw: 'Required' } }
    await createVisit(
      {
        leadId: str(fd, 'leadId'),
        customerName: str(fd, 'customerName') ?? '',
        phone: str(fd, 'phone') ?? '',
        address: str(fd, 'address') ?? '',
        requirement: str(fd, 'requirement'),
        locationUrl: str(fd, 'locationUrl'),
        kw,
        scheduledAt: str(fd, 'scheduledAt') ? new Date(`${str(fd, 'scheduledAt')}:00+05:00`) : undefined,
      },
      user,
    )
    refresh()
    return { ok: true, message: 'Visit created and assigned' }
  } catch (error) {
    return errorState(error)
  }
}

export async function updateVisitAction(fd: FormData): Promise<void> {
  const user = await requireUser()
  const status = z.enum(VISIT_STATUSES).parse(fd.get('status'))
  await updateVisit(String(fd.get('visitId')), status, str(fd, 'feedback') ?? '', user, str(fd, 'scheduledAt') ? new Date(`${str(fd, 'scheduledAt')}:00+05:00`) : undefined)
  refresh()
}

// ── Review ──

export async function reviewAttemptAction(fd: FormData): Promise<void> {
  const user = await requireRole('admin', 'manager')
  const decision = z.enum(REVIEW_STATUSES).exclude(['pending']).parse(fd.get('decision'))
  await reviewAttempt(String(fd.get('attemptId')), decision, str(fd, 'note') ?? '', user)
  refresh()
}

// ── Users & teams ──

export async function createUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole('admin', 'manager')
  try {
    const data = z
      .object({
        name: z.string().trim().min(2),
        username: z.string().regex(/^[a-z0-9._-]{3,30}$/, 'Use 3–30 lowercase letters, numbers, . _ -'),
        email: z.email().optional(),
        phone: z.string().optional(),
        password: z.string().min(8, 'At least 8 characters'),
        role: z.enum(ROLES),
        departmentId: z.string().optional(),
      })
      .parse({ name: str(fd, 'name'), username: str(fd, 'username')?.toLowerCase(), email: str(fd, 'email'), phone: str(fd, 'phone'), password: str(fd, 'password'), role: str(fd, 'role'), departmentId: str(fd, 'departmentId') })
    if (actor.role === 'manager' && (data.role === 'admin' || data.role === 'manager')) return { ok: false, message: 'Managers can only add agents' }
    const departmentId = actor.role === 'manager' ? actor.departmentId : data.departmentId
    const { normalizePhone } = await import('@/lib/phone')
    const team = departmentId ? await Team.findOne({ departmentId: oid(departmentId) }) : null
    const user = await User.create({
      name: data.name,
      username: data.username,
      email: data.email ?? `${data.username}@volton.local`,
      phone: data.phone ? (normalizePhone(data.phone) ?? undefined) : undefined,
      role: data.role,
      departmentId: data.role === 'admin' || data.role === 'field_agent' ? (departmentId ? oid(departmentId) : null) : departmentId ? oid(departmentId) : null,
      managerId: data.role === 'agent' && team ? team.managerId : null,
      passwordHash: await hashPassword(data.password),
      createdBy: oid(actor.id),
    })
    if (data.role === 'agent' && team) {
      team.memberOrder.push(user._id)
      await team.save()
    }
    if (data.role === 'manager' && departmentId) {
      const existingTeam = await Team.findOne({ departmentId: oid(departmentId) })
      if (!existingTeam) await Team.create({ departmentId: oid(departmentId), managerId: user._id, name: `${data.name}'s team` })
      else if (!existingTeam.managerId) {
        existingTeam.managerId = user._id
        await existingTeam.save()
      }
    }
    await AuditLog.create({ entity: 'user', entityId: user._id, action: 'create', after: { name: data.name, role: data.role }, actorId: oid(actor.id) })
    refresh()
    return { ok: true, message: `${data.name} added` }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: number }).code === 11000) return { ok: false, message: 'That username or email is already used' }
    return errorState(error)
  }
}

export async function setUserActiveAction(fd: FormData): Promise<void> {
  const actor = await requireRole('admin', 'manager')
  const userId = String(fd.get('userId'))
  const active = fd.get('active') === 'true'
  const before = await User.findById(userId).lean()
  if (!before || (actor.role === 'manager' && String(before.departmentId) !== actor.departmentId)) throw new Error('Not allowed')
  await User.updateOne({ _id: oid(userId) }, { isActive: active })
  if (!active) {
    await revokeSessions(userId)
    // Their open leads go back to the queue (logged), then are re-assigned in order.
    const leads = await Lead.find({ 'assignment.agentId': oid(userId), status: 'open' }).select('_id teamId').lean()
    for (const lead of leads) {
      await Lead.updateOne({ _id: lead._id }, { 'assignment.state': 'waiting', 'assignment.agentId': null })
      await logActivity(lead._id, 'reassigned', actor.id, { reason: 'agent deactivated' })
    }
    for (const teamId of new Set(leads.map((l) => String(l.teamId)))) await drainQueue(teamId)
  }
  await AuditLog.create({ entity: 'user', entityId: oid(userId), action: 'update', before: { isActive: before.isActive }, after: { isActive: active }, actorId: oid(actor.id) })
  refresh()
}

export async function resetPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole('admin')
  const password = str(fd, 'password') ?? ''
  if (password.length < 8) return { ok: false, message: 'At least 8 characters' }
  const userId = String(fd.get('userId'))
  await User.updateOne({ _id: oid(userId) }, { passwordHash: await hashPassword(password) })
  await revokeSessions(userId)
  await AuditLog.create({ entity: 'user', entityId: oid(userId), action: 'update', after: { password: 'reset' }, actorId: oid(actor.id) })
  return { ok: true, message: 'Password reset' }
}

export async function moveTeamMemberAction(fd: FormData): Promise<void> {
  const actor = await requireRole('admin', 'manager')
  const team = await Team.findById(String(fd.get('teamId')))
  if (!team || (actor.role === 'manager' && String(team.departmentId) !== actor.departmentId)) throw new Error('Not allowed')
  const order = team.memberOrder.map(String)
  const i = order.indexOf(String(fd.get('userId')))
  const j = fd.get('direction') === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= order.length) return
  ;[order[i], order[j]] = [order[j], order[i]]
  team.set('memberOrder', order.map(oid))
  await team.save()
  await AuditLog.create({ entity: 'team', entityId: team._id, action: 'update', after: { memberOrder: order }, actorId: oid(actor.id) })
  refresh()
}

export async function setTeamMemberAction(fd: FormData): Promise<void> {
  const actor = await requireRole('admin', 'manager')
  const team = await Team.findById(String(fd.get('teamId')))
  if (!team || (actor.role === 'manager' && String(team.departmentId) !== actor.departmentId)) throw new Error('Not allowed')
  const userId = String(fd.get('userId'))
  const order = team.memberOrder.map(String).filter((id: string) => id !== userId)
  if (fd.get('member') === 'true') order.push(userId)
  team.set('memberOrder', order.map(oid))
  await team.save()
  refresh()
}

export async function updateTeamSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole('admin', 'manager')
  try {
    const settings = teamSettingsInput.parse({
      managerWindowMin: num(fd, 'managerWindowMin'),
      acceptWithinMin: num(fd, 'acceptWithinMin'),
      contactWithinMin: num(fd, 'contactWithinMin'),
      maxPendingAccept: num(fd, 'maxPendingAccept'),
      autoMoveOnAcceptTimeout: fd.get('autoMoveOnAcceptTimeout') === 'on',
      paused: fd.get('paused') === 'on',
    })
    const team = await Team.findById(String(fd.get('teamId')))
    if (!team || (actor.role === 'manager' && String(team.departmentId) !== actor.departmentId)) return { ok: false, message: 'Not allowed' }
    const before = { ...settings, ...Object.fromEntries(Object.keys(settings).map((k) => [k, team.get(k)])) }
    team.set(settings)
    await team.save()
    await AuditLog.create({ entity: 'team', entityId: team._id, action: 'update', before, after: settings, actorId: oid(actor.id) })
    if (!settings.paused) await drainQueue(team._id)
    refresh()
    return { ok: true, message: 'Saved' }
  } catch (error) {
    return errorState(error)
  }
}

// ── Google Sheet ──

export async function saveSheetConfigAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole('admin')
  const config = await getSetting('sheet_config')
  const tabs = (str(fd, 'tabs') ?? 'Leads')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const [name, dept] = t.split(':').map((s) => s.trim())
      const department = DEPARTMENTS.find((d) => d.toLowerCase() === (dept ?? '').toLowerCase())
      return department ? { name, department } : { name }
    })
  let headerOverrides = config.headerOverrides
  const rawOverrides = str(fd, 'headerOverrides')
  if (rawOverrides) {
    try {
      headerOverrides = JSON.parse(rawOverrides)
    } catch {
      return { ok: false, message: 'Column overrides must be valid JSON, e.g. {"Client Name": "name"}' }
    }
  }
  await setSetting('sheet_config', { ...config, spreadsheetId: spreadsheetIdFrom(str(fd, 'spreadsheet') ?? ''), tabs, headerOverrides }, actor.id)
  refresh()
  return { ok: true, message: 'Saved' }
}

export async function pullSheetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireRole('admin', 'manager')
  try {
    const mode = (str(fd, 'mode') ?? 'live') as 'live' | 'history' | 'skip'
    const results = await pullSheet(mode)
    if (results === null) return { ok: false, message: 'A pull is already running — try again in a minute.' }
    refresh()
    const text = results.map((r) => (r.missingRequired.length ? `${r.tab}: no phone column found` : `${r.tab}: ${r.created} new, ${r.reinquiry} asked again, ${r.skipped} skipped, ${r.invalid} bad phone`)).join(' · ')
    return { ok: true, message: text || 'No Sheet configured' }
  } catch (error) {
    return errorState(error)
  }
}

export async function saveWorkingHoursAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireRole('admin')
  const days = fd.getAll('days').map(Number)
  await setSetting('working_hours', { start: str(fd, 'start') ?? '10:00', end: str(fd, 'end') ?? '19:00', days }, actor.id)
  refresh()
  return { ok: true, message: 'Saved' }
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
