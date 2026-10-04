import 'server-only'
import { randomUUID } from 'node:crypto'
import { pktDateKey } from '@/lib/dates-pkt'
import { connectDb } from '@/server/db/connection'
import { Attendance, Job, Lead, Lock, Team, User } from '@/server/db/models'
import { autoAssign, drainQueue, managersOf } from '@/server/services/assignment'
import { isDuplicateKey, notify } from '@/server/services/common'
import { getSetting, isOpen } from '@/server/services/settings'

/** Lease lock so overlapping cron calls (cron-job.org + app polling) never double-process. */
export async function withLock<T>(name: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
  await connectDb()
  const now = new Date()
  const holder = randomUUID()
  try {
    const got = await Lock.findOneAndUpdate({ _id: name, until: { $lt: now } }, { $set: { until: new Date(now.getTime() + ttlMs), holder } }, { upsert: true, returnDocument: 'after' })
    if (got?.holder !== holder) return null
  } catch (error) {
    if (isDuplicateKey(error)) return null
    throw error
  }
  try {
    return await fn()
  } finally {
    await Lock.updateOne({ _id: name, holder }, { until: new Date(0) })
  }
}

let lastTick = 0
/** Backup clock: called from the app's polling endpoint; runs the tick at most once a minute per instance. */
export async function maybeTick(): Promise<void> {
  if (Date.now() - lastTick < 60_000) return
  lastTick = Date.now()
  await runTick()
}

export async function runTick(): Promise<{ processed: number; drained: number } | null> {
  return withLock('tick', 50_000, async () => {
    const now = new Date()
    const due = await Job.find({ status: 'pending', dueAt: { $lte: now } }).sort({ dueAt: 1 }).limit(50).lean()
    let processed = 0
    for (const job of due) {
      const claimed = await Job.findOneAndUpdate({ _id: job._id, status: 'pending' }, { status: 'running', $inc: { tries: 1 } })
      if (!claimed) continue
      try {
        await handle(job)
        await Job.updateOne({ _id: job._id }, { status: 'done' })
        processed++
      } catch (error) {
        await Job.updateOne({ _id: job._id }, { status: job.tries >= 2 ? 'failed' : 'pending', lastError: error instanceof Error ? error.message : String(error) })
      }
    }
    await autoCheckout(now)
    const drained = await drainQueue()
    return { processed, drained }
  })
}

type JobDoc = Awaited<ReturnType<typeof Job.findOne>> & object

async function handle(job: NonNullable<JobDoc>): Promise<void> {
  const lead = job.leadId ? await Lead.findById(job.leadId).lean() : null
  if (job.leadId && (!lead || lead.status !== 'open')) return
  switch (job.kind) {
    case 'manager_window_end': {
      if (lead && ['manager_window', 'unassigned'].includes(lead.assignment?.state ?? '')) await autoAssign(lead._id)
      return
    }
    case 'accept_due': {
      if (!lead || lead.assignment?.state !== 'assigned' || String(job.assignmentId) === 'null') return
      const team = lead.teamId ? await Team.findById(lead.teamId).lean() : null
      const agent = lead.assignment.agentId ? await User.findById(lead.assignment.agentId).lean() : null
      await notify({ userIds: await managersOf(lead.departmentId), type: 'not_accepted', title: `${agent?.name ?? 'Agent'} has not accepted a lead`, body: lead.leadNo, link: `/leads/${lead._id}`, dedupeKey: `not_accepted:${job.assignmentId}` })
      if (team?.autoMoveOnAcceptTimeout && agent) {
        const misses = (lead.assignment.bounces ?? 0) + 1
        if (misses >= 2) {
          await Lead.updateOne({ _id: lead._id }, { 'assignment.state': 'waiting', 'assignment.agentId': null })
          return
        }
        await autoAssign(lead._id, [String(agent._id)])
      }
      return
    }
    case 'contact_due': {
      if (!lead || lead.firstContactAt) return
      const agent = lead.assignment?.agentId ? await User.findById(lead.assignment.agentId).lean() : null
      await notify({ userIds: await managersOf(lead.departmentId), type: 'not_contacted', title: `Not contacted yet: ${lead.leadNo}`, body: `${agent?.name ?? 'Unassigned'} has not called or messaged in time`, link: `/leads/${lead._id}`, dedupeKey: `not_contacted:${job.assignmentId}` })
      return
    }
    case 'follow_up_due': {
      if (!lead || !job.userId) return
      await notify({ userIds: [job.userId], type: 'follow_up_due', title: `Follow-up due: ${lead.leadNo}`, link: `/leads/${lead._id}`, dedupeKey: `fu_due:${job._id}` })
      return
    }
    case 'follow_up_overdue': {
      if (!lead || !lead.nextFollowUpAt || lead.nextFollowUpAt > new Date()) return
      await notify({ userIds: [...(job.userId ? [job.userId] : []), ...(await managersOf(lead.departmentId))], type: 'follow_up_overdue', title: `OVERDUE follow-up: ${lead.leadNo}`, link: `/leads/${lead._id}`, dedupeKey: `fu_overdue:${job._id}` })
      return
    }
    case 'auto_checkout':
      return
  }
}

/** After closing time, everyone still checked in is checked out (so no lead goes to an empty desk). */
async function autoCheckout(now: Date): Promise<void> {
  const hours = await getSetting('working_hours')
  if (isOpen(now, hours)) return
  await Attendance.updateMany({ date: pktDateKey(now), status: { $in: ['checked_in', 'on_break'] }, checkInAt: { $lt: new Date(now.getTime() - 30 * 60_000) } }, { status: 'checked_out', checkOutAt: now })
}
