import 'server-only'
import type { Types } from 'mongoose'
import { ACTIVE_VISIT_STATUSES, type VisitStatus } from '@/domain/constants'
import { normalizePhone } from '@/lib/phone'
import { formatPktDateTime } from '@/lib/dates-pkt'
import { connectDb } from '@/server/db/connection'
import { Contact, Lead, User, Visit } from '@/server/db/models'
import type { SessionUser } from '@/server/auth/session'
import { logActivity, notify, oid } from '@/server/services/common'
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

export async function assignVisit(visitId: string, byUserId: string | null): Promise<string | null> {
  await connectDb()
  const visit = await Visit.findById(visitId)
  if (!visit) throw new Error('Visit not found')
  const agents = (await User.find({ role: 'field_agent', isActive: true, deletedAt: null }).select('_id name').lean()).map((u) => ({ id: String(u._id), name: u.name }))
  const agentId = pickFieldAgent(agents, await fieldAgentLoad(), new Set(visit.triedAgentIds.map(String)))
  if (!agentId) {
    visit.set({ agentId: null, status: 'unassigned' })
    await visit.save()
    await notify({ userIds: await managersOf(null), type: 'visit_assigned', title: 'Visit needs a field agent — everyone has tried', body: visit.customerName, link: '/visits', dedupeKey: `visit_unassigned:${visit._id}:${visit.triedAgentIds.length}` })
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
  if (!phone) throw new Error('Enter a valid phone number')
  const contact = await Contact.findOne({ phones: phone }).lean()
  const visit = await Visit.create({
    leadId: input.leadId ? oid(input.leadId) : null,
    contactId: contact?._id ?? null,
    customerName: input.customerName,
    phone,
    address: input.address,
    requirement: input.requirement ?? '',
    locationUrl: input.locationUrl ?? '',
    kw: input.kw,
    scheduledAt: input.scheduledAt ?? null,
    createdBy: oid(user.id),
  })
  if (input.leadId) {
    await Lead.updateOne({ _id: oid(input.leadId), stage: { $in: ['new', 'contacted', 'interested', 'requirement_collected'] } }, { stage: 'site_survey', stageChangedAt: new Date() })
    await logActivity(input.leadId, 'stage_changed', user.id, { stage: 'site_survey' })
  }
  await assignVisit(String(visit._id), user.id)
  return String(visit._id)
}

/** Field agent / manager updates a visit. "Not interested" → reassigned to another agent who has not tried yet. */
export async function updateVisit(visitId: string, status: VisitStatus, feedback: string, user: SessionUser, scheduledAt?: Date): Promise<void> {
  await connectDb()
  const visit = await Visit.findById(visitId)
  if (!visit) throw new Error('Visit not found')
  if (user.role === 'field_agent' && String(visit.agentId) !== user.id) throw new Error('This visit is not yours')
  const previousAgent = visit.agentId ? String(visit.agentId) : null
  visit.set({ status, feedback, updatedBy: oid(user.id), ...(scheduledAt ? { scheduledAt } : {}) })
  if (status === 'completed' || status === 'interested') visit.completedAt = new Date()
  if (status === 'not_interested' && previousAgent && !visit.triedAgentIds.map(String).includes(previousAgent)) visit.triedAgentIds.push(oid(previousAgent))
  await visit.save()
  if (visit.leadId) await logActivity(visit.leadId, 'visit_updated', user.id, { visitId, status, feedback })
  if (status === 'interested' && visit.leadId) {
    await Lead.updateOne({ _id: visit.leadId, stage: { $in: ['site_survey', 'interested', 'contacted', 'new'] } }, { stage: 'quotation_pending', stageChangedAt: new Date() })
  }
  if (status === 'not_interested') await assignVisit(visitId, user.id)
}
