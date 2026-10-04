/**
 * End-to-end business flows on a real (in-memory) MongoDB replica set.
 * Synthetic data only — no real customer phones.
 */
import mongoose, { type Types } from 'mongoose'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest'
import { PIPELINES } from '@/domain/constants'
import { pktDateKey } from '@/lib/dates-pkt'
import type { SessionUser } from '@/server/auth/session'
import { ALL_MODELS, Attendance, ContactAttempt, Department, FollowUp, Job, Lead, Message, Notification, Team, User, Visit } from '@/server/db/models'
import { acceptLead, checkIn, manualAssign } from '@/server/services/assignment'
import { logOutcome, tapAttempt } from '@/server/services/attempts'
import { ingestLead } from '@/server/services/ingest'
import { runTick } from '@/server/services/jobs'
import { setSetting } from '@/server/services/settings'
import { pullSheet } from '@/server/services/sheet'
import { createVisit, updateVisit } from '@/server/services/visits'
import { processWebhook } from '@/server/services/whatsapp'

beforeAll(async () => {
  await mongoose.connect(inject('mongoUri'), { dbName: 'volton_flows_test' })
  globalThis.__voltonMongoose = Promise.resolve(mongoose)
  await Promise.all(ALL_MODELS.map((model) => model.syncIndexes()))
})
afterAll(async () => {
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
  globalThis.__voltonMongoose = undefined
})
afterEach(() => {
  vi.unstubAllGlobals()
})

let n = 0
const phone = () => `+9230099${String(++n).padStart(5, '0')}`

interface World {
  deptId: Types.ObjectId
  teamId: Types.ObjectId
  manager: SessionUser
  agents: SessionUser[]
}

const asSession = (u: { _id: Types.ObjectId; name: string; email: string; role: string; departmentId?: Types.ObjectId | null }, code = 'INSTALLATION'): SessionUser =>
  ({ id: String(u._id), name: u.name, email: u.email, role: u.role, departmentId: u.departmentId ? String(u.departmentId) : null, departmentCode: code, managerId: null }) as SessionUser

async function world(): Promise<World> {
  await Promise.all(ALL_MODELS.map((model) => model.collection.deleteMany({})))
  // Office always open, so tests do not depend on the clock.
  await setSetting('working_hours', { start: '00:00', end: '23:59', days: [0, 1, 2, 3, 4, 5, 6] })
  const dept = await Department.create({ code: 'INSTALLATION', name: 'Installation', stages: PIPELINES.INSTALLATION, routingKeywords: [] })
  const manager = await User.create({ name: 'Manager Test', email: `m${++n}@t.test`, role: 'manager', departmentId: dept._id })
  const agents = await User.create(
    ['Talha Test', 'Waji Test', 'Musbah Test'].map((name) => ({ name, email: `${name.replace(' ', '').toLowerCase()}${++n}@t.test`, role: 'agent', departmentId: dept._id })),
  )
  const team = await Team.create({ departmentId: dept._id, managerId: manager._id, name: 'Team', memberOrder: agents.map((a: { _id: Types.ObjectId }) => a._id), managerWindowMin: 0, maxPendingAccept: 10 })
  return { deptId: dept._id, teamId: team._id, manager: asSession(manager), agents: agents.map((a: Parameters<typeof asSession>[0]) => asSession(a)) }
}

const newLead = (name = 'Customer') => ingestLead({ name, phone: phone(), department: 'INSTALLATION', channel: 'manual' })
const agentOf = async (leadId: string) => String((await Lead.findById(leadId).lean())?.assignment?.agentId ?? '')

describe('lead assignment (round-robin with check-in)', () => {
  let w: World
  beforeEach(async () => {
    w = await world()
  })

  it('gives leads 1 → 2 → 3 → 1 to checked-in agents', async () => {
    for (const a of w.agents) await checkIn(a.id)
    const got: string[] = []
    for (let i = 0; i < 4; i++) {
      const r = await newLead()
      if (r.status !== 'created') throw new Error(r.status)
      got.push(await agentOf(r.leadId))
    }
    const [a1, a2, a3] = w.agents.map((a) => a.id)
    expect(got).toEqual([a1, a2, a3, a1])
  })

  it('skips agents who are not checked in, and parks the lead when nobody is in', async () => {
    const parked = await newLead()
    if (parked.status !== 'created') throw new Error()
    expect((await Lead.findById(parked.leadId).lean())?.assignment?.state).toBe('waiting')

    await checkIn(w.agents[1].id) // check-in drains the queue
    expect(await agentOf(parked.leadId)).toBe(w.agents[1].id)

    const next = await newLead()
    if (next.status !== 'created') throw new Error()
    expect(await agentOf(next.leadId)).toBe(w.agents[1].id) // the only one in
  })

  it('manual assign does not move the round-robin pointer', async () => {
    for (const a of w.agents) await checkIn(a.id)
    const first = await newLead()
    if (first.status !== 'created') throw new Error()
    expect(await agentOf(first.leadId)).toBe(w.agents[0].id)
    await manualAssign(first.leadId, w.agents[2].id, w.manager.id)
    expect(await agentOf(first.leadId)).toBe(w.agents[2].id)
    const second = await newLead()
    if (second.status !== 'created') throw new Error()
    expect(await agentOf(second.leadId)).toBe(w.agents[1].id)
  })

  it('same phone again → re-inquiry on the open lead, not a duplicate', async () => {
    const p = phone()
    const a = await ingestLead({ name: 'X', phone: p, department: 'INSTALLATION', channel: 'manual' })
    const b = await ingestLead({ name: 'X', phone: p, department: 'INSTALLATION', channel: 'manual' })
    expect(a.status).toBe('created')
    expect(b.status).toBe('reinquiry')
    expect(await Lead.countDocuments()).toBe(1)
  })
})

describe('proof of work and the 1-1-3 follow-up plan', () => {
  it('3 no-answers over 2+ days → Dead (unreachable)', async () => {
    const w = await world()
    const agent = w.agents[0]
    await checkIn(agent.id)
    const r = await newLead()
    if (r.status !== 'created') throw new Error()
    await acceptLead(r.leadId, agent.id)

    const away = (ms: number) => ({ leftAt: new Date(Date.now() - ms), returnedAt: new Date() })
    for (let i = 1; i <= 3; i++) {
      const { attemptId, href } = await tapAttempt(r.leadId, 'phone_call', agent)
      expect(href).toMatch(/^tel:\+92/)
      await logOutcome({ attemptId, result: 'no_answer', closeLead: false, ...away(30_000) }, agent)
      const lead = await Lead.findById(r.leadId).lean()
      if (i < 3) {
        expect(lead?.status).toBe('open')
        expect(await FollowUp.countDocuments({ leadId: lead?._id, status: 'pending' })).toBe(1)
        // the next call happens on a later day
        await ContactAttempt.collection.updateMany({ leadId: lead!._id }, { $set: { serverTapAt: new Date(Date.now() - (4 - i) * 86_400_000) } })
      } else {
        expect(lead?.status).toBe('unreachable')
        expect(lead?.attemptCount).toBe(3)
      }
    }
    const attempts = await ContactAttempt.find({ leadId: r.leadId }).lean()
    expect(attempts.every((a) => a.proofStatus === 'logged')).toBe(true)
    expect(await Notification.exists({ type: 'lead_unreachable' })).toBeTruthy()
  })

  it('flags an outcome logged without leaving the app', async () => {
    const w = await world()
    const agent = w.agents[0]
    await checkIn(agent.id)
    const r = await newLead()
    if (r.status !== 'created') throw new Error()
    const { attemptId } = await tapAttempt(r.leadId, 'whatsapp_chat', agent)
    await logOutcome({ attemptId, result: 'connected', response: 'interested', closeLead: false }, agent)
    const attempt = await ContactAttempt.findById(attemptId).lean()
    expect(attempt?.flags).toContain('never_left_app')
    expect(attempt?.proofStatus).toBe('flagged')
    expect((await Lead.findById(r.leadId).lean())?.stage).toBe('interested')
  })

  it('agents cannot work leads that are not theirs', async () => {
    const w = await world()
    await checkIn(w.agents[0].id)
    const r = await newLead()
    if (r.status !== 'created') throw new Error()
    await expect(tapAttempt(r.leadId, 'phone_call', w.agents[2])).rejects.toThrow(/cannot work/)
  })
})

describe('site visits (least kW, never the same agent twice)', () => {
  it('assigns by least active kW and reassigns on "not interested"', async () => {
    const w = await world()
    const [hassan, faisal] = await User.create([
      { name: 'Hassan', email: `h${++n}@t.test`, role: 'field_agent', departmentId: w.deptId },
      { name: 'Faisal', email: `f${++n}@t.test`, role: 'field_agent', departmentId: w.deptId },
    ])
    const big = await createVisit({ customerName: 'Big', phone: phone(), address: 'DHA', kw: 48 }, w.manager)
    const small = await createVisit({ customerName: 'Small', phone: phone(), address: 'Gulberg', kw: 10 }, w.manager)
    const bigAgent = String((await Visit.findById(big).lean())?.agentId)
    const smallAgent = String((await Visit.findById(small).lean())?.agentId)
    expect(bigAgent).toBe(String(faisal._id)) // tie at 0 kW → name order
    expect(smallAgent).toBe(String(hassan._id)) // Faisal now carries 48 kW

    await updateVisit(small, 'not_interested', 'Price too high', asSession(hassan))
    const after = await Visit.findById(small).lean()
    expect(String(after?.agentId)).toBe(String(faisal._id))
    expect(after?.triedAgentIds.map(String)).toEqual([String(hassan._id)])

    await updateVisit(small, 'not_interested', 'Still no', asSession(faisal))
    const last = await Visit.findById(small).lean()
    expect(last?.status).toBe('unassigned') // everyone has tried
  })
})

describe('Google Sheet pull', () => {
  const csv = (rows: string[][]) => rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
  const header = ['', 'campaign name', 'what_size_solar_system_are_you_planning_to_install?', 'full_name', 'whatsapp_number', 'Remark', 'Call Agent', 'Lead Status']
  const stubSheet = (rows: string[][]) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(csv([header, ...rows]), { status: 200 })))

  it('history import pre-assigns by Call Agent; live pull only takes new rows', async () => {
    const w = await world()
    await setSetting('sheet_config', { spreadsheetId: 'test-sheet', tabs: [{ name: 'Leads', department: 'INSTALLATION' }], headerOverrides: {}, cursor: {} })
    const rows = [
      ['10/3/26', 'Solar Home Oct', '5_to_15_kw', 'Test One', 'p:+923009900001', 'RNR', 'Talha', 'Follow up'],
      ['10/3/26', 'Solar Home Oct', '15_to_25_kw', 'Test Two', '+923009900002', '', 'waji ', ''],
      ['', '', '', '', '', '', '', ''],
    ]
    stubSheet(rows)
    const [history] = (await pullSheet('history'))!
    expect(history).toMatchObject({ created: 2, invalid: 0, missingRequired: [] })
    const two = await Lead.findOne({ 'source.sheetRow': 3 }).lean()
    expect(String(two?.assignment?.agentId)).toBe(w.agents[1].id)
    expect(two?.site?.systemSizeRange).toBe('15_to_25_kw')
    expect(two?.source?.submittedAt?.toISOString()).toBe('2026-10-03T07:00:00.000Z')

    await checkIn(w.agents[0].id)
    stubSheet([...rows, ['10/4/26', 'Solar Home Oct', '20kw please', 'Test Three', '+923009900003', '', '', '']])
    const [live] = (await pullSheet('live'))!
    expect(live).toMatchObject({ read: 1, created: 1 })
    const three = await Lead.findOne({ 'source.sheetRow': 5 }).lean()
    expect(String(three?.assignment?.agentId)).toBe(w.agents[0].id)
    expect(three?.extra).toMatchObject({ 'systemSizeRange (Sheet)': '20kw please' })

    const [again] = (await pullSheet('live'))!
    expect(again.read).toBe(0)
    expect(await Lead.countDocuments()).toBe(3)
  })
})

describe('WhatsApp webhook', () => {
  const value = (extra: object) => ({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'PNID1', display_phone_number: '923000000099' }, ...extra } }] }] })

  it('new chat creates a lead; an echo after a WhatsApp tap verifies the attempt', async () => {
    const w = await world()
    const agent = w.agents[0]
    await checkIn(agent.id)
    const ts = String(Math.floor(Date.now() / 1000))
    await processWebhook(value({ contacts: [{ wa_id: '923009911111', profile: { name: 'WA Customer' } }], messages: [{ id: 'wamid.in1', from: '923009911111', timestamp: ts, type: 'text', text: { body: 'Price for 10kW?' } }] }))
    const lead = await Lead.findOne({ 'source.channel': 'whatsapp' }).lean()
    expect(lead).toBeTruthy()
    expect(String(lead?.assignment?.agentId)).toBe(agent.id)

    // replay of the same webhook is ignored
    await processWebhook(value({ messages: [{ id: 'wamid.in1', from: '923009911111', timestamp: ts, type: 'text', text: { body: 'Price for 10kW?' } }] }))
    expect(await Message.countDocuments({ direction: 'in' })).toBe(1)

    const { attemptId } = await tapAttempt(String(lead!._id), 'whatsapp_chat', agent)
    await processWebhook(value({ message_echoes: [{ id: 'wamid.out1', to: '923009911111', timestamp: ts, type: 'text', text: { body: 'Assalam o Alaikum' } }] }))
    expect((await ContactAttempt.findById(attemptId).lean())?.proofStatus).toBe('verified')
    expect(await Message.countDocuments({ direction: 'out', sentFrom: 'app' })).toBe(1)
  })
})

describe('timers (cron tick)', () => {
  it('a lead not accepted in time moves to the next checked-in agent', async () => {
    const w = await world()
    await Team.updateOne({ _id: w.teamId }, { autoMoveOnAcceptTimeout: true })
    for (const a of w.agents.slice(0, 2)) await checkIn(a.id)
    const r = await newLead()
    if (r.status !== 'created') throw new Error()
    expect(await agentOf(r.leadId)).toBe(w.agents[0].id)

    await Job.updateMany({ kind: 'accept_due' }, { dueAt: new Date(Date.now() - 1000) })
    const tick = await runTick()
    expect(tick?.processed).toBeGreaterThan(0)
    expect(await agentOf(r.leadId)).toBe(w.agents[1].id)
    expect(await Notification.exists({ type: 'not_accepted' })).toBeTruthy()
  })

  it('auto check-out is skipped while the office is open', async () => {
    const w = await world()
    await checkIn(w.agents[0].id)
    await runTick()
    expect((await Attendance.findOne({ userId: w.agents[0].id, date: pktDateKey(new Date()) }).lean())?.status).toBe('checked_in')
  })
})
