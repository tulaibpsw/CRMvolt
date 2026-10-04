import 'server-only'
import type { Types } from 'mongoose'
import type { AssignmentMethod } from '@/domain/constants'
import { pktDateKey } from '@/lib/dates-pkt'
import { connectDb } from '@/server/db/connection'
import { Attendance, Lead, LeadAssignment, Team, User } from '@/server/db/models'
import { withTransaction } from '@/server/db/transaction'
import { cancelJobs, logActivity, notify, oid, scheduleJob } from '@/server/services/common'

type Id = Types.ObjectId | string

/** Pure: next agent after the pointer, walking the fixed order (wraps). Skipped agents lose their turn. */
export function pickNext(order: string[], rr: { lastUid: string | null; lastPos: number }, eligible: Set<string>, exclude: Set<string> = new Set()): { uid: string; pos: number } | null {
  const n = order.length
  if (n === 0) return null
  const found = rr.lastUid ? order.indexOf(rr.lastUid) : -1
  const start = found >= 0 ? found : Math.min(rr.lastPos, n - 1)
  for (let step = 1; step <= n; step++) {
    const pos = (((start + step) % n) + n) % n
    const uid = order[pos]
    if (eligible.has(uid) && !exclude.has(uid)) return { uid, pos }
  }
  return null
}

/** Agents of a team who can receive a lead right now: active, checked in (not on break), under the pending-accept cap. */
export async function eligibleAgents(team: { memberOrder: Types.ObjectId[]; maxPendingAccept: number }): Promise<Set<string>> {
  const ids = team.memberOrder.map(String)
  if (ids.length === 0) return new Set()
  const today = pktDateKey(new Date())
  const [active, present, pending] = await Promise.all([
    User.find({ _id: { $in: ids }, isActive: true, deletedAt: null, autoPausedAt: null }).select('_id').lean(),
    Attendance.find({ userId: { $in: ids }, date: today, status: 'checked_in' }).select('userId').lean(),
    Lead.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { 'assignment.agentId': { $in: team.memberOrder }, 'assignment.state': 'assigned', status: 'open' } },
      { $group: { _id: '$assignment.agentId', n: { $sum: 1 } } },
    ]),
  ])
  const activeSet = new Set(active.map((u) => String(u._id)))
  const presentSet = new Set(present.map((a) => String(a.userId)))
  const busy = new Set(pending.filter((p) => p.n >= team.maxPendingAccept).map((p) => String(p._id)))
  return new Set(ids.filter((id) => activeSet.has(id) && presentSet.has(id) && !busy.has(id)))
}

async function managersOf(departmentId: Id | null): Promise<string[]> {
  const users = await User.find({ isActive: true, deletedAt: null, $or: [{ role: 'admin' }, { role: 'manager', departmentId }] }).select('_id').lean()
  return users.map((u) => String(u._id))
}

/** After a lead is created/routed: manager window (if the manager is checked in) or straight to auto-assign. */
export async function startAssignment(leadId: Id): Promise<void> {
  await connectDb()
  const lead = await Lead.findById(leadId).lean()
  if (!lead || lead.status !== 'open' || !lead.teamId) return
  const team = await Team.findById(lead.teamId).lean()
  if (!team) return
  const managerIn = await Attendance.exists({ userId: team.managerId, date: pktDateKey(new Date()), status: 'checked_in' })
  const assignableAt = lead.assignableAt > new Date() ? lead.assignableAt : new Date()

  if (team.paused || (managerIn && team.managerWindowMin > 0) || assignableAt > new Date()) {
    const windowEnd = new Date(assignableAt.getTime() + (managerIn && !team.paused ? team.managerWindowMin : 0) * 60_000)
    await Lead.updateOne({ _id: lead._id }, { 'assignment.state': team.paused ? 'waiting' : 'manager_window' })
    if (!team.paused) await scheduleJob('manager_window_end', windowEnd, `manager_window_end:${lead._id}`, { leadId: lead._id })
    await notify({ userIds: [team.managerId], type: 'new_lead', title: 'New lead to assign', body: lead.leadNo, link: `/leads/${lead._id}`, dedupeKey: `new_lead:${lead._id}` })
    return
  }
  await autoAssign(lead._id)
}

/** Round-robin assignment in one transaction. Returns the agent id, or null if nobody is eligible (lead waits). */
export async function autoAssign(leadId: Id, exclude: string[] = []): Promise<string | null> {
  await connectDb()
  const lead0 = await Lead.findById(leadId).lean()
  if (!lead0?.teamId || lead0.status !== 'open' || lead0.assignment?.state === 'accepted') return null
  const team0 = await Team.findById(lead0.teamId).lean()
  if (!team0) return null
  const eligible = await eligibleAgents(team0)

  const result = await withTransaction(async (session) => {
    const lead = await Lead.findOneAndUpdate(
      { _id: lead0._id, status: 'open', 'assignment.state': { $nin: ['accepted', 'assigning'] } },
      { $set: { 'assignment.state': 'assigning' } },
      { session, returnDocument: 'after' },
    )
    if (!lead) return null
    const team = await Team.findOneAndUpdate({ _id: team0._id }, { $inc: { version: 1 } }, { session, returnDocument: 'after' })
    if (!team) return null
    const next = pickNext(team.memberOrder.map(String), { lastUid: team.rr?.lastUid ? String(team.rr.lastUid) : null, lastPos: team.rr?.lastPos ?? -1 }, eligible, new Set(exclude))
    if (!next) {
      await Lead.updateOne({ _id: lead._id }, { 'assignment.state': 'waiting' }, { session })
      return null
    }
    const now = new Date()
    await Team.updateOne({ _id: team._id }, { rr: { lastUid: oid(next.uid), lastPos: next.pos } }, { session })
    await LeadAssignment.updateMany({ leadId: lead._id, endedAt: null }, { endedAt: now, reason: 'reassigned' }, { session })
    const [assignment] = await LeadAssignment.create([{ leadId: lead._id, agentId: oid(next.uid), by: null, method: exclude.length ? 'timeout' : 'auto', assignedAt: now }], { session })
    await Lead.updateOne(
      { _id: lead._id },
      { $set: { assignment: { agentId: oid(next.uid), state: 'assigned', assignedAt: now, assignedBy: null, method: exclude.length ? 'timeout' : 'auto', acceptedAt: null, bounces: (lead.assignment?.bounces ?? 0) + (exclude.length ? 1 : 0) } } },
      { session },
    )
    await logActivity(lead._id, exclude.length ? 'reassigned' : 'assigned', null, { agentId: next.uid, method: 'auto' }, session)
    return { agentId: next.uid, assignmentId: String(assignment._id), acceptMin: team.acceptWithinMin, contactMin: team.contactWithinMin, leadNo: lead.leadNo, managerId: String(team.managerId) }
  })

  if (!result) {
    const managers = await managersOf(lead0.departmentId)
    await notify({ userIds: managers, type: 'lead_unassigned', title: 'Lead waiting — nobody checked in', body: lead0.leadNo, link: `/leads/${lead0._id}`, dedupeKey: `waiting:${lead0._id}` })
    return null
  }
  await afterAssigned(lead0._id, result)
  return result.agentId
}

async function afterAssigned(leadId: Id, r: { agentId: string; assignmentId: string; acceptMin: number; contactMin: number; leadNo: string }) {
  const now = Date.now()
  await scheduleJob('accept_due', new Date(now + r.acceptMin * 60_000), `accept_due:${r.assignmentId}`, { leadId, assignmentId: r.assignmentId })
  await scheduleJob('contact_due', new Date(now + r.contactMin * 60_000), `contact_due:${r.assignmentId}`, { leadId, assignmentId: r.assignmentId })
  await notify({ userIds: [r.agentId], type: 'lead_assigned', title: 'New lead for you — accept now', body: r.leadNo, link: `/leads/${leadId}`, dedupeKey: `assigned:${r.assignmentId}` })
}

/** Manager/admin picks the agent. Does not move the round-robin pointer. */
export async function manualAssign(leadId: Id, agentId: string, byUserId: string, method: AssignmentMethod = 'manual'): Promise<void> {
  await connectDb()
  const team = await Lead.findById(leadId).select('teamId').lean().then((l) => (l?.teamId ? Team.findById(l.teamId).lean() : null))
  const r = await withTransaction(async (session) => {
    const lead = await Lead.findById(leadId).session(session)
    if (!lead || lead.status !== 'open') throw new Error('Lead is not open')
    const now = new Date()
    const previous = lead.assignment?.agentId ? String(lead.assignment.agentId) : null
    await LeadAssignment.updateMany({ leadId: lead._id, endedAt: null }, { endedAt: now, reason: 'reassigned' }, { session })
    const [assignment] = await LeadAssignment.create([{ leadId: lead._id, agentId: oid(agentId), by: oid(byUserId), method, assignedAt: now }], { session })
    lead.set('assignment', { agentId: oid(agentId), state: 'assigned', assignedAt: now, assignedBy: oid(byUserId), method, acceptedAt: null, bounces: lead.assignment?.bounces ?? 0 })
    await lead.save({ session })
    await logActivity(lead._id, previous ? 'reassigned' : 'assigned', byUserId, { agentId, method, from: previous }, session)
    return { assignmentId: String(assignment._id), leadNo: lead.leadNo }
  })
  await cancelJobs({ leadId: oid(leadId), kind: { $in: ['manager_window_end', 'accept_due', 'contact_due'] } })
  await afterAssigned(leadId, { agentId, assignmentId: r.assignmentId, acceptMin: team?.acceptWithinMin ?? 5, contactMin: team?.contactWithinMin ?? 15, leadNo: r.leadNo })
}

/** Agent accepts (PDF "Sign/Claim"). */
export async function acceptLead(leadId: Id, userId: string): Promise<void> {
  await connectDb()
  const now = new Date()
  const updated = await Lead.findOneAndUpdate(
    { _id: leadId, 'assignment.agentId': oid(userId), 'assignment.state': 'assigned' },
    { $set: { 'assignment.state': 'accepted', 'assignment.acceptedAt': now } },
  )
  if (!updated) throw new Error('This lead is not waiting for you to accept')
  await LeadAssignment.updateOne({ leadId: oid(leadId), agentId: oid(userId), endedAt: null }, { acceptedAt: now })
  await cancelJobs({ leadId: oid(leadId), kind: 'accept_due' })
  await logActivity(leadId, 'accepted', userId)
}

/** Assign waiting leads oldest-first while agents are eligible (on check-in, accept, close and every tick). */
export async function drainQueue(teamId?: Id): Promise<number> {
  await connectDb()
  const filter: Record<string, unknown> = { status: 'open', 'assignment.state': 'waiting', assignableAt: { $lte: new Date() }, deletedAt: null }
  if (teamId) filter.teamId = oid(teamId)
  const waiting = await Lead.find(filter).sort({ receivedAt: 1 }).limit(50).select('_id teamId').lean()
  let assigned = 0
  const blocked = new Set<string>()
  for (const lead of waiting) {
    if (blocked.has(String(lead.teamId))) continue
    const agent = await autoAssign(lead._id)
    if (agent) assigned++
    else blocked.add(String(lead.teamId))
  }
  return assigned
}

// ── Attendance ──

export async function getAttendance(userId: string) {
  await connectDb()
  return Attendance.findOne({ userId: oid(userId), date: pktDateKey(new Date()) }).lean()
}

export async function checkIn(userId: string): Promise<void> {
  await connectDb()
  const now = new Date()
  await Attendance.updateOne(
    { userId: oid(userId), date: pktDateKey(now) },
    { $set: { status: 'checked_in', checkOutAt: null }, $setOnInsert: { checkInAt: now, breaks: [] } },
    { upsert: true },
  )
  await User.updateOne({ _id: oid(userId) }, { autoPausedAt: null })
  const user = await User.findById(userId).lean()
  if (user?.departmentId) {
    const teams = await Team.find({ departmentId: user.departmentId }).select('_id').lean()
    for (const team of teams) await drainQueue(team._id)
  }
}

export async function toggleBreak(userId: string): Promise<void> {
  await connectDb()
  const now = new Date()
  const row = await Attendance.findOne({ userId: oid(userId), date: pktDateKey(now) })
  if (!row || row.status === 'checked_out') throw new Error('Check in first')
  if (row.status === 'on_break') {
    const open = row.breaks.find((b: { endAt?: Date | null }) => !b.endAt)
    if (open) open.endAt = now
    row.status = 'checked_in'
  } else {
    row.breaks.push({ startAt: now, endAt: null })
    row.status = 'on_break'
  }
  await row.save()
  if (row.status === 'checked_in') await checkIn(userId)
}

export async function checkOut(userId: string): Promise<void> {
  await connectDb()
  await Attendance.updateOne({ userId: oid(userId), date: pktDateKey(new Date()) }, { status: 'checked_out', checkOutAt: new Date() })
}

export { managersOf }
