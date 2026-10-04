import 'server-only'
import { Types } from 'mongoose'
import type { Department, KpiKey, LeadStatus, Role, Stage } from '@/domain/constants'
import type { AttemptView, FollowUpView, KpiItem, LeadDetail, LeadSummary, MessageView, TeamMemberView } from '@/domain/view-models'
import { pktDateKey } from '@/lib/dates-pkt'
import { formatPkrCompact } from '@/lib/money'
import { connectDb } from '@/server/db/connection'
import { Activity, Attendance, Contact, ContactAttempt, Department as DepartmentModel, FollowUp, Lead, Message, Notification, Team, User, Visit } from '@/server/db/models'
import type { SessionUser } from '@/server/auth/session'
import { leadScope, visitScope } from '@/server/auth/scope'
import { oid } from '@/server/services/common'

const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : undefined)

interface LeadLike {
  _id: unknown
  leadNo: string
  contactId: unknown
  departmentId?: unknown
  stage: string
  status: string
  source?: { channel?: string | null; campaignName?: string | null; formName?: string | null; ctwa?: { headline?: string | null } | null } | null
  assignment?: { agentId?: unknown; state?: string | null; assignedAt?: Date | null } | null
  attemptCount?: number | null
  nextFollowUpAt?: Date | null
  receivedAt: Date
}

async function lookups(leads: { contactId: unknown; departmentId?: unknown; assignment?: { agentId?: unknown } | null }[]) {
  const contactIds = [...new Set(leads.map((l) => String(l.contactId)))]
  const agentIds = [...new Set(leads.map((l) => l.assignment?.agentId).filter(Boolean).map(String))]
  const [contacts, agents, departments] = await Promise.all([
    Contact.find({ _id: { $in: contactIds } }).lean(),
    User.find({ _id: { $in: agentIds } }).select('name').lean(),
    DepartmentModel.find().lean(),
  ])
  return {
    contact: new Map(contacts.map((c) => [String(c._id), c])),
    agent: new Map(agents.map((a) => [String(a._id), a.name])),
    dept: new Map(departments.map((d) => [String(d._id), d.code as Department])),
  }
}

function toSummary(lead: unknown, maps: Awaited<ReturnType<typeof lookups>>, user: SessionUser): LeadSummary {
  const l = lead as LeadLike
  const contact = maps.contact.get(String(l.contactId))
  const agentId = l.assignment?.agentId ? String(l.assignment.agentId) : undefined
  const state = l.assignment?.state ?? 'unassigned'
  const sla = state === 'assigned' && l.assignment?.assignedAt
    ? { startedAt: iso(l.assignment.assignedAt)!, deadline: new Date(new Date(l.assignment.assignedAt).getTime() + 5 * 60_000).toISOString() }
    : undefined
  return {
    id: String(l._id),
    leadNo: l.leadNo,
    name: contact?.name ?? '—',
    phone: contact?.phones?.[0] ?? '',
    maskPhone: false,
    department: (maps.dept.get(String(l.departmentId)) ?? 'INSTALLATION') as Department,
    stage: l.stage as Stage,
    status: l.status as LeadStatus,
    channel: (l.source?.channel ?? 'manual') as LeadSummary['channel'],
    sourceDetail: l.source?.ctwa?.headline ?? l.source?.campaignName ?? l.source?.formName ?? undefined,
    agent: agentId ? { id: agentId, name: maps.agent.get(agentId) ?? '—' } : undefined,
    assignmentState: state as LeadSummary['assignmentState'],
    attemptCount: l.attemptCount ?? 0,
    nextFollowUpAt: iso(l.nextFollowUpAt),
    sla: user.role === 'agent' || user.role === 'manager' || user.role === 'admin' ? sla : undefined,
    receivedAt: iso(l.receivedAt)!,
  }
}

export const LEAD_VIEWS = ['all', 'new', 'unassigned', 'mine', 'followups', 'interested', 'lost', 'unreachable'] as const
export type LeadView = (typeof LEAD_VIEWS)[number]
export const PAGE_SIZE = 25

export interface LeadListParams {
  view?: LeadView
  q?: string
  department?: Department
  stage?: Stage
  agentId?: string
  page?: number
  sort?: string
  dir?: 'asc' | 'desc'
}

export async function listLeads(user: SessionUser, params: LeadListParams): Promise<{ rows: LeadSummary[]; total: number; counts: Record<LeadView, number> }> {
  await connectDb()
  const scope = leadScope(user)
  const views: Record<LeadView, Record<string, unknown>> = {
    all: { status: 'open' },
    new: { status: 'open', stage: 'new' },
    unassigned: { status: 'open', 'assignment.state': { $in: ['unassigned', 'waiting', 'manager_window'] } },
    mine: { status: 'open', 'assignment.agentId': oid(user.id) },
    followups: { status: 'open', nextFollowUpAt: { $ne: null } },
    interested: { status: 'open', stage: { $in: ['interested', 'requirement_collected', 'site_survey', 'quotation_pending', 'quotation_sent', 'negotiation'] } },
    lost: { status: 'lost' },
    unreachable: { status: { $in: ['unreachable', 'junk'] } },
  }
  const filter: Record<string, unknown> = { ...scope, ...views[params.view ?? 'all'] }
  if (params.stage) filter.stage = params.stage
  if (params.agentId) filter['assignment.agentId'] = oid(params.agentId)
  if (params.department) {
    const dept = await DepartmentModel.findOne({ code: params.department }).lean()
    if (dept && user.role === 'admin') filter.departmentId = dept._id
  }
  if (params.q?.trim()) {
    const q = params.q.trim()
    const digits = q.replace(/\D/g, '')
    const or: Record<string, unknown>[] = [{ leadNo: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }]
    const contactFilter: Record<string, unknown>[] = [{ name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }]
    if (digits.length >= 4) contactFilter.push({ phones: new RegExp(digits.replace(/^0/, '').slice(-10)) })
    const contacts = await Contact.find({ $or: contactFilter }).select('_id').limit(200).lean()
    or.push({ contactId: { $in: contacts.map((c) => c._id) } })
    filter.$or = or
  }
  const sortField = params.sort === 'followup' ? 'nextFollowUpAt' : params.sort === 'attempts' ? 'attemptCount' : 'receivedAt'
  const page = Math.max(1, params.page ?? 1)
  const [docs, total, countEntries] = await Promise.all([
    Lead.find(filter).sort({ [sortField]: params.dir === 'asc' ? 1 : -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    Lead.countDocuments(filter),
    Promise.all(LEAD_VIEWS.map(async (v) => [v, await Lead.countDocuments({ ...scope, ...views[v] })] as const)),
  ])
  const maps = await lookups(docs)
  return { rows: docs.map((d) => toSummary(d, maps, user)), total, counts: Object.fromEntries(countEntries) as Record<LeadView, number> }
}

export async function getLeadDetail(id: string, user: SessionUser) {
  await connectDb()
  if (!Types.ObjectId.isValid(id)) return null
  const lead = await Lead.findOne({ _id: oid(id), ...leadScope(user) }).lean()
  if (!lead) return null
  const maps = await lookups([lead])
  const contact = maps.contact.get(String(lead.contactId))
  const [attempts, followUps, activities, messages, visits, otherLeads] = await Promise.all([
    ContactAttempt.find({ leadId: lead._id }).sort({ serverTapAt: -1 }).lean(),
    FollowUp.find({ leadId: lead._id }).sort({ dueAt: -1 }).lean(),
    Activity.find({ leadId: lead._id }).sort({ at: -1 }).limit(100).lean(),
    Message.find({ contactId: lead.contactId }).sort({ at: 1 }).limit(200).lean(),
    Visit.find({ leadId: lead._id, deletedAt: null }).sort({ createdAt: -1 }).lean(),
    Lead.find({ contactId: lead.contactId, _id: { $ne: lead._id } }).select('leadNo departmentId status').lean(),
  ])
  const people = new Map((await User.find({ _id: { $in: [...attempts.map((a) => a.agentId), ...activities.map((a) => a.actorId).filter(Boolean), ...messages.map((m) => m.sentByUserId).filter(Boolean)] } }).select('name').lean()).map((u) => [String(u._id), u.name]))
  const summary = toSummary(lead, maps, user)
  const detail: LeadDetail = {
    ...summary,
    altPhones: contact?.phones?.slice(1) ?? [],
    city: contact?.city ?? undefined,
    area: contact?.area ?? undefined,
    campaignName: lead.source?.campaignName ?? undefined,
    adName: lead.source?.adName ?? undefined,
    formName: lead.source?.formName ?? undefined,
    ctwaHeadline: lead.source?.ctwa?.headline ?? undefined,
  }
  const attemptViews: AttemptView[] = attempts.map((a) => ({
    id: String(a._id),
    channel: a.channel as AttemptView['channel'],
    followUpNo: a.followUpNo,
    agent: { id: String(a.agentId), name: people.get(String(a.agentId)) ?? '—' },
    tappedAt: iso(a.serverTapAt)!,
    leftAt: iso(a.leftAt),
    returnedAt: iso(a.returnedAt),
    loggedAt: iso(a.outcomeAt),
    result: (a.result ?? undefined) as AttemptView['result'],
    response: (a.response ?? undefined) as AttemptView['response'],
    remarks: a.remarks ?? undefined,
    screenshotUrl: a.proof?.docIds?.length ? `/api/documents/${a.proof.docIds[0]}` : undefined,
    proofStatus: a.proofStatus as AttemptView['proofStatus'],
    flags: (a.flags ?? []) as AttemptView['flags'],
    reviewStatus: (a.review?.status ?? 'pending') as AttemptView['reviewStatus'],
  }))
  const messageViews: MessageView[] = messages.map((m) => ({
    id: String(m._id),
    direction: m.direction as MessageView['direction'],
    sentFrom: m.sentFrom as MessageView['sentFrom'],
    text: m.text,
    at: iso(m.at)!,
    status: m.status as MessageView['status'],
    senderName: m.sentByUserId ? people.get(String(m.sentByUserId)) : undefined,
  }))
  return {
    lead: detail,
    raw: { departmentId: lead.departmentId ? String(lead.departmentId) : null, site: lead.site ?? {}, trading: lead.trading ?? {}, extra: (lead.extra ?? {}) as Record<string, string>, lostReason: lead.lostReason, pendingAttempt: attemptViews.find((a) => !a.loggedAt && a.agent.id === user.id)?.id ?? null },
    attempts: attemptViews,
    followUps: followUps.map((f) => ({ id: String(f._id), leadId: String(f.leadId), leadName: detail.name, number: f.number, dueAt: iso(f.dueAt)!, status: f.status, isOverdue: f.status === 'pending' && f.dueAt < new Date() }) as FollowUpView),
    activities: activities.map((a) => ({ id: String(a._id), type: a.type, at: iso(a.at)!, actor: a.actorId ? people.get(String(a.actorId)) : undefined, data: (a.data ?? {}) as Record<string, unknown> })),
    messages: messageViews,
    visits: visits.map((v) => ({ id: String(v._id), status: v.status, kw: v.kw, scheduledAt: iso(v.scheduledAt), agentId: v.agentId ? String(v.agentId) : null })),
    otherLeads: otherLeads.map((o) => ({ id: String(o._id), leadNo: o.leadNo, status: o.status })),
  }
}

export async function listFollowUps(user: SessionUser): Promise<FollowUpView[]> {
  await connectDb()
  const scopeLeads = await Lead.find({ ...leadScope(user), status: 'open', nextFollowUpAt: { $ne: null } }).select('_id').lean()
  const fus = await FollowUp.find({ leadId: { $in: scopeLeads.map((l) => l._id) }, status: 'pending' }).sort({ dueAt: 1 }).limit(200).lean()
  const leads = await Lead.find({ _id: { $in: fus.map((f) => f.leadId) } }).select('contactId').lean()
  const contacts = await Contact.find({ _id: { $in: leads.map((l) => l.contactId) } }).select('name').lean()
  const leadName = new Map(leads.map((l) => [String(l._id), contacts.find((c) => String(c._id) === String(l.contactId))?.name ?? '—']))
  return fus.map((f) => ({ id: String(f._id), leadId: String(f.leadId), leadName: leadName.get(String(f.leadId)) ?? '—', number: f.number, dueAt: f.dueAt.toISOString(), status: f.status, isOverdue: f.dueAt < new Date() }) as FollowUpView)
}

/** PDF §4/§8 KPI tiles for the user's scope. */
export async function getKpis(user: SessionUser): Promise<KpiItem[]> {
  await connectDb()
  const scope = leadScope(user)
  const count = (extra: Record<string, unknown>) => Lead.countDocuments({ ...scope, ...extra })
  const [total, isNew, unassigned, assigned, accepted, called, notCalled, interested, followUp, quotationSent, inProcess, won, lost, value] = await Promise.all([
    count({}),
    count({ stage: 'new', status: 'open' }),
    count({ status: 'open', 'assignment.state': { $in: ['unassigned', 'waiting', 'manager_window'] } }),
    count({ 'assignment.agentId': { $ne: null } }),
    count({ 'assignment.state': 'accepted' }),
    count({ attemptCount: { $gt: 0 } }),
    count({ attemptCount: 0, status: 'open' }),
    count({ stage: { $in: ['interested', 'requirement_collected', 'site_survey'] }, status: 'open' }),
    count({ status: 'open', nextFollowUpAt: { $ne: null } }),
    count({ stage: 'quotation_sent' }),
    count({ stage: { $in: ['quotation_pending', 'negotiation'] }, status: 'open' }),
    count({ status: 'won' }),
    count({ status: 'lost' }),
    Lead.aggregate<{ v: number }>([{ $match: { ...scope, status: 'won' } }, { $group: { _id: null, v: { $sum: { $ifNull: ['$wonValuePkr', 0] } } } }]),
  ])
  const item = (key: KpiKey, v: string | number, hint?: string, comingIn?: number): KpiItem => ({ key, value: v, hint, comingIn })
  return [
    item('totalLeads', total),
    item('newUnassigned', `${isNew} / ${unassigned}`),
    item('assignedSigned', `${assigned} / ${accepted}`),
    item('calledNotCalled', `${called} / ${notCalled}`),
    item('interestedFollowUp', `${interested} / ${followUp}`),
    item('quotationSent', quotationSent),
    item('inProcess', inProcess),
    item('wonSales', won),
    item('lost', lost),
    item('salesValue', formatPkrCompact(value[0]?.v ?? 0)),
    item('commission', 0, undefined, 4),
  ]
}

/** Manager live board: who is checked in, what they hold, last action. */
export async function getTeamBoard(user: SessionUser): Promise<TeamMemberView[]> {
  await connectDb()
  const filter: Record<string, unknown> = { role: { $in: ['agent', 'field_agent'] }, isActive: true, deletedAt: null }
  if (user.role === 'manager') filter.departmentId = user.departmentId ? oid(user.departmentId) : null
  const members = await User.find(filter).sort({ name: 1 }).lean()
  const ids = members.map((m) => m._id)
  const [attendance, open, pending, last] = await Promise.all([
    Attendance.find({ userId: { $in: ids }, date: pktDateKey(new Date()) }).lean(),
    Lead.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { 'assignment.agentId': { $in: ids }, status: 'open' } }, { $group: { _id: '$assignment.agentId', n: { $sum: 1 } } }]),
    Lead.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { 'assignment.agentId': { $in: ids }, status: 'open', 'assignment.state': 'assigned' } }, { $group: { _id: '$assignment.agentId', n: { $sum: 1 } } }]),
    ContactAttempt.aggregate<{ _id: Types.ObjectId; at: Date }>([{ $match: { agentId: { $in: ids } } }, { $group: { _id: '$agentId', at: { $max: '$serverTapAt' } } }]),
  ])
  const by = <T extends { _id: unknown }>(rows: T[]) => new Map(rows.map((r) => [String(r._id), r]))
  const att = new Map(attendance.map((a) => [String(a.userId), a]))
  const [o, p, l] = [by(open), by(pending), by(last)]
  return members.map((m) => ({
    id: String(m._id),
    name: m.name,
    role: m.role as Role,
    attendance: (att.get(String(m._id))?.status ?? 'checked_out') as TeamMemberView['attendance'],
    since: iso(att.get(String(m._id))?.checkInAt),
    openLeads: o.get(String(m._id))?.n ?? 0,
    pendingAccept: p.get(String(m._id))?.n ?? 0,
    lastActionAt: iso(l.get(String(m._id))?.at),
  }))
}

export async function getTeams(user: SessionUser) {
  await connectDb()
  const filter = user.role === 'manager' ? { departmentId: user.departmentId ? oid(user.departmentId) : null } : {}
  const teams = await Team.find(filter).lean()
  const users = await User.find({ _id: { $in: teams.flatMap((t) => [...t.memberOrder, t.managerId]) } }).select('name isActive').lean()
  const name = new Map(users.map((u) => [String(u._id), u.name]))
  const departments = await DepartmentModel.find().lean()
  return teams.map((t) => ({
    id: String(t._id),
    name: t.name,
    department: departments.find((d) => String(d._id) === String(t.departmentId))?.code as Department,
    departmentId: String(t.departmentId),
    manager: name.get(String(t.managerId)) ?? '—',
    members: t.memberOrder.map((id: Types.ObjectId) => ({ id: String(id), name: name.get(String(id)) ?? '—' })),
    lastUid: t.rr?.lastUid ? String(t.rr.lastUid) : null,
    settings: { managerWindowMin: t.managerWindowMin, acceptWithinMin: t.acceptWithinMin, contactWithinMin: t.contactWithinMin, maxPendingAccept: t.maxPendingAccept, autoMoveOnAcceptTimeout: t.autoMoveOnAcceptTimeout, paused: t.paused },
  }))
}

export async function getReviewQueue(user: SessionUser) {
  await connectDb()
  const leadIds = (await Lead.find(leadScope(user)).select('_id').lean()).map((l) => l._id)
  const attempts = await ContactAttempt.find({ leadId: { $in: leadIds }, outcomeAt: { $ne: null }, 'review.status': 'pending', $or: [{ proofStatus: 'flagged' }, { proofStatus: 'evidenced' }] })
    .sort({ proofStatus: 1, serverTapAt: -1 })
    .limit(100)
    .lean()
  const people = new Map((await User.find({ _id: { $in: attempts.map((a) => a.agentId) } }).select('name').lean()).map((u) => [String(u._id), u.name]))
  const leads = new Map((await Lead.find({ _id: { $in: attempts.map((a) => a.leadId) } }).select('leadNo').lean()).map((l) => [String(l._id), l.leadNo]))
  return attempts.map((a) => ({
    leadId: String(a.leadId),
    leadNo: leads.get(String(a.leadId)) ?? '—',
    attempt: {
      id: String(a._id),
      channel: a.channel,
      followUpNo: a.followUpNo,
      agent: { id: String(a.agentId), name: people.get(String(a.agentId)) ?? '—' },
      tappedAt: iso(a.serverTapAt)!,
      leftAt: iso(a.leftAt),
      returnedAt: iso(a.returnedAt),
      loggedAt: iso(a.outcomeAt),
      result: a.result ?? undefined,
      response: a.response ?? undefined,
      remarks: a.remarks ?? undefined,
      screenshotUrl: a.proof?.docIds?.length ? `/api/documents/${a.proof.docIds[0]}` : undefined,
      proofStatus: a.proofStatus,
      flags: a.flags ?? [],
      reviewStatus: a.review?.status ?? 'pending',
    } as AttemptView,
  }))
}

export async function listVisits(user: SessionUser) {
  await connectDb()
  const visits = await Visit.find(visitScope(user)).sort({ status: 1, scheduledAt: 1, createdAt: -1 }).limit(200).lean()
  const people = new Map((await User.find({ _id: { $in: [...visits.map((v) => v.agentId), ...visits.flatMap((v) => v.triedAgentIds)].filter(Boolean) } }).select('name').lean()).map((u) => [String(u._id), u.name]))
  return visits.map((v) => ({
    id: String(v._id),
    leadId: v.leadId ? String(v.leadId) : null,
    customerName: v.customerName,
    phone: v.phone,
    address: v.address,
    requirement: v.requirement,
    locationUrl: v.locationUrl,
    kw: v.kw,
    scheduledAt: iso(v.scheduledAt),
    agent: v.agentId ? { id: String(v.agentId), name: people.get(String(v.agentId)) ?? '—' } : null,
    status: v.status as import('@/domain/constants').VisitStatus,
    feedback: v.feedback,
    tried: v.triedAgentIds.map((t: Types.ObjectId) => people.get(String(t)) ?? '—'),
  }))
}

export async function listNotifications(userId: string) {
  await connectDb()
  const rows = await Notification.find({ userId: oid(userId) }).sort({ createdAt: -1 }).limit(30).lean()
  return {
    unread: await Notification.countDocuments({ userId: oid(userId), readAt: null }),
    items: rows.map((n) => ({ id: String(n._id), type: n.type, title: n.title, body: n.body, link: n.link, at: iso(n.createdAt)!, read: !!n.readAt })),
  }
}

export async function listUsers(user: SessionUser) {
  await connectDb()
  const filter: Record<string, unknown> = { deletedAt: null }
  if (user.role === 'manager') filter.departmentId = user.departmentId ? oid(user.departmentId) : null
  const users = await User.find(filter).sort({ role: 1, name: 1 }).lean()
  const departments = await DepartmentModel.find().lean()
  const name = new Map(users.map((u) => [String(u._id), u.name]))
  return users.map((u) => ({
    id: String(u._id),
    name: u.name,
    email: u.email,
    username: u.username ?? '',
    phone: u.phone ?? '',
    role: u.role as Role,
    department: (departments.find((d) => String(d._id) === String(u.departmentId))?.code ?? null) as Department | null,
    departmentId: u.departmentId ? String(u.departmentId) : null,
    manager: u.managerId ? name.get(String(u.managerId)) ?? '—' : null,
    isActive: u.isActive,
  }))
}

export async function listDepartments() {
  await connectDb()
  return (await DepartmentModel.find().lean()).map((d) => ({ id: String(d._id), code: d.code as Department, name: d.name }))
}

export async function pipelineColumns(user: SessionUser, department: Department) {
  await connectDb()
  const dept = await DepartmentModel.findOne({ code: department }).lean()
  if (!dept) return { stages: [] as Stage[], leads: [] as LeadSummary[] }
  const scope = leadScope(user)
  const docs = await Lead.find({ ...scope, departmentId: dept._id, status: { $in: ['open', 'won', 'lost'] } }).sort({ stageChangedAt: -1 }).limit(400).lean()
  const maps = await lookups(docs)
  return { stages: dept.stages as Stage[], leads: docs.map((d) => toSummary(d, maps, user)) }
}
