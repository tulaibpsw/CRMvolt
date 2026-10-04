import 'server-only'
import type { Types } from 'mongoose'
import { ACTIVE_VISIT_STATUSES, type VisitStatus } from '@/domain/constants'
import { normalizePhone } from '@/lib/phone'
import { formatPktDateTime, pktDateKey } from '@/lib/dates-pkt'
import { connectDb } from '@/server/db/connection'
import { Attendance, Contact, Lead, User, Visit } from '@/server/db/models'
import type { SessionUser } from '@/server/auth/session'
import { loadLeadFor, loadVisitFor } from '@/server/auth/guards'
import { logActivity, notify, oid, UserError } from '@/server/services/common'
import { managersOf } from '@/server/services/assignment'

/**
 * Pure: the client's rule (Excel "Visits"): give the visit to the field agent with the LEAST active kW,
 * never to someone who already tried this customer. Ties → fewer active visits → name.
 */
export function pickFieldAgent(
  agents: { id: string; name: string }[],
  load: Map<string, { kw: number; visits: number }>,
  tried: Set<string>,
): string | null {
  const candidates = agents.filter((a) => !tried.has(a.id))
  candidates.sort((a, b) => {
    const la = load.get(a.id) ?? { kw: 0, visits: 0 }
    const lb = load.get(b.id) ?? { kw: 0, visits: 0 }
    return la.kw - lb.kw || la.visits - lb.visits || a.name.localeCompare(b.name)
  })
  return candidates[0]?.id ?? null
}

export async function fieldAgentLoad(): Promise<Map<string, { kw: number; visits: number }>> {
  const rows = await Visit.aggregate<{ _id: Types.ObjectId; kw: number; visits: number }>([
    { $match: { status: { $in: ACTIVE_VISIT_STATUSES }, agentId: { $ne: null }, deletedAt: null } },
    { $group: { _id: '$agentId', kw: { $sum: '$kw' }, visits: { $sum: 1 } } },
  ])
  return new Map(rows.map((r) => [String(r._id), { kw: r.kw, visits: r.visits }]))
}

/** Field agents of the visit's department; those checked in today come first (fallback: everyone active). */
async function fieldAgentPool(departmentId: Types.ObjectId | null) {
  const all = await User.find({ role: 'field_agent', isActive: true, deletedAt: null, ...(departmentId ? { departmentId: { $in: [departmentId, null] } } : {}) }).select('_id name').lean()
  const present = new Set((await Attendance.find({ userId: { $in: all.map((u) => u._id) }, date: pktDateKey(new Date()), status: 'checked_in' }).select('userId').lean()).map((a) => String(a.userId)))
  const agents = all.map((u) => ({ id: String(u._id), name: u.name }))
  const working = agents.filter((a) => present.has(a.id))
  return working.length ? working : agents
}

export async function assignVisit(visitId: string, byUserId: string | null): Promise<string | null> {
  await connectDb()
  const visit = await Visit.findById(visitId)
  if (!visit) throw new UserError('Visit not found')
  const agents = await fieldAgentPool(visit.departmentId ?? null)
  const agentId = pickFieldAgent(agents, await fieldAgentLoad(), new Set(visit.triedAgentIds.map(String)))
  if (!agentId) {
    visit.set({ agentId: null, status: 'unassigned' })
    await visit.save()
    await notify({ userIds: await managersOf(visit.departmentId ?? null), type: 'visit_assigned', title: 'Visit needs a field agent — everyone has tried', body: visit.customerName, link: '/visits', dedupeKey: `visit_unassigned:${visit._id}:${visit.triedAgentIds.length}` })
    return null
  }
  visit.set({ agentId: oid(agentId), status: 'assigned', assignedAt: new Date(), updatedBy: byUserId ? oid(byUserId) : null })
  await visit.save()
  if (visit.leadId) await logActivity(visit.leadId, 'visit_assigned', byUserId, { visitId: String(visit._id), agentId, kw: visit.kw })
  const when = visit.scheduledAt ? ` · ${formatPktDateTime(visit.scheduledAt)}` : ''
  await notify({ userIds: [agentId], type: 'visit_assigned', title: `Site visit: ${visit.customerName} (${visit.kw} kW)`, body: `${visit.address}${when}`, link: '/visits', dedupeKey: `visit_assigned:${visit._id}:${agentId}` })
  return agentId
}

export interface CreateVisitInput {
  leadId?: string
  customerName: string
  phone: string
  address: string
  requirement?: string
  locationUrl?: string
  kw: number
  scheduledAt?: Date
}

export async function createVisit(input: CreateVisitInput, user: SessionUser): Promise<string> {
  await connectDb()
  const phone = normalizePhone(input.phone)
  if (!phone) throw new UserError('Enter a valid phone number')
  if (input.locationUrl && !/^https:\/\//i.test(input.locationUrl)) throw new UserError('The location link must start with https://')
  const lead = input.leadId ? await loadLeadFor(user, input.leadId, user.role === 'agent' ? 'work' : 'view') : null
  const contact = await Contact.findOne({ phones: phone }).lean()
  const visit = await Visit.create({
    leadId: lead?._id ?? null,
    contactId: contact?._id ?? null,
    departmentId: lead?.departmentId ?? (user.departmentId ? oid(user.departmentId) : null),
    customerName: input.customerName,
    phone,
    address: input.address,
    requirement: input.requirement ?? '',
    locationUrl: input.locationUrl ?? '',
    kw: input.kw,
    scheduledAt: input.scheduledAt ?? null,
    createdBy: oid(user.id),
  })
  if (lead) {
    await Lead.updateOne({ _id: lead._id, stage: { $in: ['new', 'contacted', 'interested', 'requirement_collected'] } }, { stage: 'site_survey', stageChangedAt: new Date() })
    await logActivity(lead._id, 'stage_changed', user.id, { stage: 'site_survey' })
  }
  await assignVisit(String(visit._id), user.id)
  return String(visit._id)
}

/** What a field agent may report about their own visit. Cancel / un-assign / re-assign are manager decisions. */
export const FIELD_AGENT_VISIT_STATUSES: readonly VisitStatus[] = ['completed', 'interested', 'not_interested', 'rescheduled']

/** Field agent / manager updates a visit. "Not interested" → reassigned to another agent who has not tried yet. */
export async function updateVisit(visitId: string, status: VisitStatus, feedback: string, user: SessionUser, scheduledAt?: Date): Promise<void> {
  const visit = await loadVisitFor(user, visitId)
  const isField = user.role === 'field_agent'
  if (isField && !FIELD_AGENT_VISIT_STATUSES.includes(status)) throw new UserError('Only a manager can do this — choose Visited, Interested, Not interested or Rescheduled')
  if (isField && !['assigned', 'rescheduled'].includes(visit.status)) throw new UserError('This visit is already closed')
  if (feedback.trim().length < 5 && status !== 'assigned' && status !== 'unassigned') throw new UserError('Write what happened at the visit (a few words)')
  if (status === 'rescheduled' && !scheduledAt) throw new UserError('Pick the new visit time')
  const previousAgent = visit.agentId ? String(visit.agentId) : null
  visit.set({ status, feedback: feedback.trim().slice(0, 2000), updatedBy: oid(user.id), ...(scheduledAt ? { scheduledAt } : {}) })
  if (status === 'completed' || status === 'interested') visit.completedAt = new Date()
  if (status === 'not_interested' && previousAgent && !visit.triedAgentIds.map(String).includes(previousAgent)) visit.triedAgentIds.push(oid(previousAgent))
  await visit.save()
  if (visit.leadId) await logActivity(visit.leadId, 'visit_updated', user.id, { visitId, status, feedback })
  if (status === 'interested' && visit.leadId) {
    await Lead.updateOne({ _id: visit.leadId, stage: { $in: ['site_survey', 'interested', 'contacted', 'new'] } }, { stage: 'quotation_pending', stageChangedAt: new Date() })
  }
  if (status === 'not_interested' || status === 'cancelled') {
    await notify({ userIds: await managersOf(visit.departmentId ?? null), type: 'visit_assigned', title: `Visit ${status === 'cancelled' ? 'cancelled' : 'not interested'}: ${visit.customerName}`, body: `${user.name}: ${feedback.slice(0, 80)}`, link: '/visits', dedupeKey: `visit_${status}:${visit._id}:${visit.triedAgentIds.length}` })
  }
  if (status === 'not_interested' || status === 'unassigned') await assignVisit(visitId, user.id)
}
