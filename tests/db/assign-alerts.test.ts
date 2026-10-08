/**
 * Auto-assign (the queue must empty itself, and say why when it cannot), manager alerts, "tapped by mistake".
 * Synthetic data only.
 */
import mongoose, { type Types } from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { PIPELINES } from '@/domain/constants'
import type { SessionUser } from '@/server/auth/session'
import { ALL_MODELS, ContactAttempt, Department, Job, Lead, Notification, Team, User } from '@/server/db/models'
import { acceptLead, assignQueuedNow, checkIn, drainQueue, queueReport } from '@/server/services/assignment'
import { cancelAttempt, tapAttempt } from '@/server/services/attempts'
import { ingestLead } from '@/server/services/ingest'
import { setSetting } from '@/server/services/settings'

beforeAll(async () => {
  await mongoose.connect(inject('mongoUri'), { dbName: 'volton_assign_alerts' })
  globalThis.__voltonMongoose = Promise.resolve(mongoose)
  await Promise.all(ALL_MODELS.map((m) => m.syncIndexes()))
})
afterAll(async () => {
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
  globalThis.__voltonMongoose = undefined
})

let n = 0
const phone = () => `+9230066${String(++n).padStart(5, '0')}`
const asSession = (u: { _id: Types.ObjectId; name: string; email: string; role: string; departmentId?: Types.ObjectId | null }): SessionUser =>
  ({ id: String(u._id), name: u.name, email: u.email, role: u.role, departmentId: u.departmentId ? String(u.departmentId) : null, departmentCode: 'INSTALLATION', managerId: null, mustChangePassword: false }) as SessionUser

let teamId: Types.ObjectId
let manager: SessionUser
let agentA: SessionUser
let agentB: SessionUser
let admin: SessionUser

beforeEach(async () => {
  await Promise.all(ALL_MODELS.map((m) => m.collection.deleteMany({})))
  const dept = await Department.create({ code: 'INSTALLATION', name: 'Installation', stages: PIPELINES.INSTALLATION, routingKeywords: [] })
  const [m, a, b, ad] = await User.create([
    { name: 'Mona Manager', email: `m${++n}@q.test`, role: 'manager', departmentId: dept._id },
    { name: 'Asim Agent', email: `a${++n}@q.test`, role: 'agent', departmentId: dept._id },
    { name: 'Bina Agent', email: `b${++n}@q.test`, role: 'agent', departmentId: dept._id },
    { name: 'Adeel Admin', email: `ad${++n}@q.test`, role: 'admin' },
  ])
  manager = asSession(m)
  agentA = asSession(a)
  agentB = asSession(b)
  admin = asSession(ad)
  teamId = (await Team.create({ departmentId: dept._id, managerId: m._id, name: 'Inst', memberOrder: [a._id, b._id], managerWindowMin: 0, maxPendingAccept: 3 }))._id
  // Office closed right now (night): opens 00:00–00:01 only on a day that is not today.
  const today = new Date(Date.now() + 5 * 3_600_000).getUTCDay()
  await setSetting('working_hours', { start: '00:00', end: '00:01', days: [(today + 3) % 7] })
})

const newLead = async () => {
  const r = await ingestLead({ name: 'Night Customer', phone: phone(), department: 'INSTALLATION', channel: 'manual' })
  if (r.status !== 'created') throw new Error(r.status)
  return r.leadId
}

describe('auto-assign at night and when nobody is checked in', () => {
  it('a night lead is held, and the manager is told exactly why', async () => {
    const id = await newLead()
    expect((await Lead.findById(id).lean())?.assignment?.agentId ?? null).toBeNull()
    const report = await queueReport(teamId)
    expect(report).toMatchObject({ held: 1, checkedIn: 0 })
    expect(report?.reasons.join(' ')).toMatch(/Nobody is checked in/)
    expect(report?.reasons.join(' ')).toMatch(/held until/)
  })

  it('"Assign now" releases held leads as soon as someone is checked in', async () => {
    const id = await newLead()
    await checkIn(agentA.id)
    const { assigned } = await assignQueuedNow(teamId, manager.id)
    expect(assigned).toBe(1)
    expect(String((await Lead.findById(id).lean())?.assignment?.agentId)).toBe(agentA.id)
  })

  it('self-healing: when the hold has ended, a check-in gives the lead out even if the timer never ran', async () => {
    const id = await newLead()
    await Lead.updateOne({ _id: id }, { assignableAt: new Date(Date.now() - 60_000) }) // office opened a minute ago
    await Job.deleteMany({}) // cron never ran
    await checkIn(agentB.id)
    expect(String((await Lead.findById(id).lean())?.assignment?.agentId)).toBe(agentB.id)
  })

  it('with "only checked-in agents" off, leads go out without check-in (and at night with "assign outside hours")', async () => {
    await Team.updateOne({ _id: teamId }, { requireCheckIn: false, assignOutsideHours: true })
    const id = await newLead()
    const lead = await Lead.findById(id).lean()
    expect(lead?.assignment?.state).toBe('assigned')
    expect([agentA.id, agentB.id]).toContain(String(lead?.assignment?.agentId))
  })

  it('unassigned leads (e.g. history import without a matching agent) are given out too', async () => {
    const id = await newLead()
    await Lead.updateOne({ _id: id }, { 'assignment.state': 'unassigned', assignableAt: new Date(Date.now() - 1000) })
    await checkIn(agentA.id)
    expect(await drainQueue(teamId)).toBe(0) // already given out by the check-in
    expect(String((await Lead.findById(id).lean())?.assignment?.agentId)).toBe(agentA.id)
  })

  it('accepting a lead frees a slot under the limit and the next waiting lead goes out', async () => {
    await Team.updateOne({ _id: teamId }, { maxPendingAccept: 1, memberOrder: [new mongoose.Types.ObjectId(agentA.id)], assignOutsideHours: true })
    await checkIn(agentA.id)
    const first = await newLead()
    const second = await newLead()
    expect((await Lead.findById(second).lean())?.assignment?.state).toBe('waiting')
    await acceptLead(first, agentA.id)
    expect(String((await Lead.findById(second).lean())?.assignment?.agentId)).toBe(agentA.id)
  })
})

describe('manager alerts', () => {
  async function acceptedLead() {
    await Team.updateOne({ _id: teamId }, { assignOutsideHours: true, memberOrder: [new mongoose.Types.ObjectId(agentA.id)] })
    await checkIn(agentA.id)
    const id = await newLead()
    await acceptLead(id, agentA.id)
    return id
  }
  it('by default the manager hears every employee action (who, what, which lead); admins only if they opt in', async () => {
    const id = await acceptedLead()
    await tapAttempt(id, 'whatsapp_chat', agentA)
    const mine = await Notification.find({ userId: new mongoose.Types.ObjectId(manager.id), type: 'agent_activity' }).lean()
    const titles = mine.map((x) => x.title).join(' | ')
    expect(titles).toMatch(/Asim Agent checked in/)
    expect(titles).toMatch(/Asim Agent accepted VL-/)
    expect(titles).toMatch(/Asim Agent tapped WhatsApp .* for Night Customer \(VL-/)
    expect(await Notification.countDocuments({ userId: new mongoose.Types.ObjectId(admin.id), type: 'agent_activity' })).toBe(0)
  })

  it('a manager can follow only some actions and only some people', async () => {
    await User.updateOne({ _id: manager.id }, { alertPrefs: { events: ['contact_tap'], scope: 'selected', agentIds: [new mongoose.Types.ObjectId(agentB.id)] } })
    const id = await acceptedLead()
    await tapAttempt(id, 'phone_call', agentA)
    expect(await Notification.countDocuments({ userId: new mongoose.Types.ObjectId(manager.id), type: 'agent_activity' })).toBe(0)
    await User.updateOne({ _id: manager.id }, { 'alertPrefs.agentIds': [new mongoose.Types.ObjectId(agentA.id)] })
    await ContactAttempt.deleteMany({})
    await tapAttempt(id, 'phone_call', agentA)
    const got = await Notification.find({ userId: new mongoose.Types.ObjectId(manager.id), type: 'agent_activity' }).lean()
    expect(got).toHaveLength(1)
    expect(got[0].title).toMatch(/tapped Phone call/)
  })
})

describe('"I tapped by mistake"', () => {
  it('cancels the tap without counting a try; refused after a long time away', async () => {
    await Team.updateOne({ _id: teamId }, { assignOutsideHours: true, memberOrder: [new mongoose.Types.ObjectId(agentA.id)] })
    await checkIn(agentA.id)
    const id = await newLead()
    await acceptLead(id, agentA.id)
    const first = await tapAttempt(id, 'whatsapp_chat', agentA)
    await cancelAttempt(first.attemptId, agentA)
    const saved = await ContactAttempt.findById(first.attemptId).lean()
    expect(saved).toMatchObject({ cancelled: true, result: null })
    expect((await Lead.findById(id).lean())?.attemptCount).toBe(0)
    const second = await tapAttempt(id, 'phone_call', agentA) // a new tap is allowed again
    const t = Date.now()
    await expect(cancelAttempt(second.attemptId, agentA, { leftAt: new Date(t - 10 * 60_000), returnedAt: new Date(t) })).rejects.toThrow(/away from the app/)
  })
})
