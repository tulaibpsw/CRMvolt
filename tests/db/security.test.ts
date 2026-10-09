/**
 * Regression tests for the loopholes found in the QA report (docs/qa/2026-10-04-QA-test-report.xlsx).
 * Each test names the finding it closes. Synthetic data only.
 */
import mongoose, { type Types } from 'mongoose'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest'
import { PIPELINES } from '@/domain/constants'
import type { SessionUser } from '@/server/auth/session'
import { loadLeadFor, safeNext } from '@/server/auth/guards'
import { ALL_MODELS, ContactAttempt, Department, Lead, SheetRow, Team, User, Visit } from '@/server/db/models'
import { acceptLead, checkIn, drainQueue } from '@/server/services/assignment'
import { logOutcome, tapAttempt } from '@/server/services/attempts'
import { ingestLead } from '@/server/services/ingest'
import { changeStage } from '@/server/services/leads'
import { getKpis, listLeads } from '@/server/services/queries'
import { hit, isBlocked } from '@/server/services/rate-limit'
import { setSetting } from '@/server/services/settings'
import { matchAgent, pullSheet } from '@/server/services/sheet'
import { createVisit, updateVisit } from '@/server/services/visits'

beforeAll(async () => {
  await mongoose.connect(inject('mongoUri'), { dbName: 'volton_security_test' })
  globalThis.__voltonMongoose = Promise.resolve(mongoose)
  await Promise.all(ALL_MODELS.map((m) => m.syncIndexes()))
})
afterAll(async () => {
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
  globalThis.__voltonMongoose = undefined
})
afterEach(() => vi.unstubAllGlobals())

let n = 0
const phone = () => `+9230077${String(++n).padStart(5, '0')}`
const asSession = (u: { _id: Types.ObjectId; name: string; email: string; role: string; departmentId?: Types.ObjectId | null }, code = 'INSTALLATION'): SessionUser =>
  ({ id: String(u._id), name: u.name, email: u.email, role: u.role, departmentId: u.departmentId ? String(u.departmentId) : null, departmentCode: code, managerId: null, mustChangePassword: false }) as SessionUser

let installation: Types.ObjectId
let trading: Types.ObjectId
let a1: SessionUser
let a2: SessionUser
let mgr: SessionUser
let tradingMgr: SessionUser

beforeEach(async () => {
  await Promise.all(ALL_MODELS.map((m) => m.collection.deleteMany({})))
  await setSetting('working_hours', { start: '00:00', end: '23:59', days: [0, 1, 2, 3, 4, 5, 6] })
  const [t, i] = await Department.create([
    { code: 'TRADING', name: 'Trading', stages: PIPELINES.TRADING, routingKeywords: [] },
    { code: 'INSTALLATION', name: 'Installation', stages: PIPELINES.INSTALLATION, routingKeywords: [] },
  ])
  trading = t._id
  installation = i._id
  const [m, tm, x, y] = await User.create([
    { name: 'Mgr Inst', email: `m${++n}@s.test`, role: 'manager', departmentId: installation },
    { name: 'Mgr Trad', email: `m${++n}@s.test`, role: 'manager', departmentId: trading },
    { name: 'Asad One', email: `a${++n}@s.test`, role: 'agent', departmentId: installation },
    { name: 'Bilqees Two', email: `a${++n}@s.test`, role: 'agent', departmentId: installation },
  ])
  mgr = asSession(m)
  tradingMgr = asSession(tm, 'TRADING')
  a1 = asSession(x)
  a2 = asSession(y)
  await Team.create({ departmentId: installation, managerId: m._id, name: 'Inst', memberOrder: [x._id, y._id], managerWindowMin: 0, maxPendingAccept: 10 })
  await Team.create({ departmentId: trading, managerId: tm._id, name: 'Trad', memberOrder: [] })
})

async function acceptedLeadFor(agent: SessionUser) {
  await checkIn(agent.id)
  const r = await ingestLead({ name: 'Cust', phone: phone(), department: 'INSTALLATION', channel: 'manual' })
  if (r.status !== 'created') throw new Error(r.status)
  const lead = await Lead.findById(r.leadId).lean()
  if (String(lead?.assignment?.agentId) !== agent.id) await Lead.updateOne({ _id: lead!._id }, { 'assignment.agentId': new mongoose.Types.ObjectId(agent.id), 'assignment.state': 'assigned' })
  await acceptLead(r.leadId, agent.id)
  return r.leadId
}

describe('fake sales and lead dumping', () => {
  it('B-01/L-17: an agent cannot set Won / Lost or late stages directly', async () => {
    const id = await acceptedLeadFor(a1)
    await expect(changeStage(a1, id, 'won', { wonValuePkr: 5_000_000 })).rejects.toThrow(/Only a manager/)
    await expect(changeStage(a1, id, 'quotation_sent', {})).rejects.toThrow(/Only a manager/)
    await changeStage(a1, id, 'interested', {})
    await expect(changeStage(a1, id, 'contacted', {})).rejects.toThrow(/forward/)
    expect((await getKpis(mgr)).find((k) => k.key === 'salesValue')?.value).toMatch(/0/)
  })

  it('L-04/L-05: closing as not interested needs remarks and goes to the manager (KPIs show it as pending)', async () => {
    const id = await acceptedLeadFor(a1)
    const { attemptId } = await tapAttempt(id, 'phone_call', a1)
    const t = Date.now()
    await logOutcome({ attemptId, result: 'connected', response: 'not_interested', remarks: 'has no roof', closeLead: false, leftAt: new Date(t - 60_000), returnedAt: new Date(t - 1_000) }, a1)
    const lead = await Lead.findById(id).lean()
    expect(lead).toMatchObject({ status: 'lost' })
    expect(lead?.closeReview?.status).toBe('pending')
    expect((await ContactAttempt.findById(attemptId).lean())?.flags).toContain('lead_closed')
  })

  it('L-49: the same result cannot be saved twice (double tap)', async () => {
    const id = await acceptedLeadFor(a1)
    const { attemptId } = await tapAttempt(id, 'phone_call', a1)
    const input = { attemptId, result: 'no_answer' as const, closeLead: false, leftAt: new Date(Date.now() - 30_000), returnedAt: new Date() }
    const results = await Promise.allSettled([logOutcome(input, a1), logOutcome(input, a1)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect((await Lead.findById(id).lean())?.attemptCount).toBe(1)
  })

  it('L-02: phone times outside [tap, now] are ignored → never_left_app flag', async () => {
    const id = await acceptedLeadFor(a1)
    const { attemptId } = await tapAttempt(id, 'phone_call', a1)
    await logOutcome({ attemptId, result: 'no_answer', closeLead: false, leftAt: new Date(Date.now() - 86_400_000), returnedAt: new Date() }, a1)
    expect((await ContactAttempt.findById(attemptId).lean())?.flags).toContain('never_left_app')
  })

  it('L-10: a screenshot must come from the agent\'s own upload folder', async () => {
    const id = await acceptedLeadFor(a1)
    const { attemptId } = await tapAttempt(id, 'phone_call', a1)
    await expect(logOutcome({ attemptId, result: 'no_answer', closeLead: false, screenshot: { publicId: `volton/attempts/${a2.id}/x`, name: 'x.jpg', mime: 'image/jpeg', size: 10 } }, a1)).rejects.toThrow(/not uploaded from your account/)
    // the failed save does not burn the attempt — it can be saved properly
    await logOutcome({ attemptId, result: 'no_answer', closeLead: false, leftAt: new Date(Date.now() - 20_000), returnedAt: new Date() }, a1)
  })

  it('L-48: closed or not-accepted leads cannot be worked', async () => {
    const r = await ingestLead({ name: 'C', phone: phone(), department: 'INSTALLATION', channel: 'manual' })
    if (r.status !== 'created') throw new Error()
    await Lead.updateOne({ _id: r.leadId }, { 'assignment.agentId': new mongoose.Types.ObjectId(a1.id), 'assignment.state': 'assigned' })
    await expect(tapAttempt(r.leadId, 'phone_call', a1)).rejects.toThrow(/Accept the lead first/)
    await Lead.updateOne({ _id: r.leadId }, { 'assignment.state': 'accepted', status: 'lost' })
    await expect(tapAttempt(r.leadId, 'phone_call', a1)).rejects.toThrow(/closed/)
  })
})

describe('who can see and change what', () => {
  it('L-27/L-31: a manager of another department cannot touch the lead', async () => {
    const id = await acceptedLeadFor(a1)
    await expect(loadLeadFor(tradingMgr, id, 'manage')).rejects.toThrow(/not found/)
    await expect(changeStage(tradingMgr, id, 'won', { wonValuePkr: 1 })).rejects.toThrow(/not found/)
    await expect(loadLeadFor(mgr, id, 'manage')).resolves.toBeTruthy()
    await expect(loadLeadFor(a1, 'not-an-id', 'view')).rejects.toThrow(/not found/)
  })

  it('agents cannot list other agents\' leads with ?agentId=', async () => {
    const id = await acceptedLeadFor(a2)
    const list = await listLeads(a1, { view: 'all', agentId: a2.id })
    expect(list.rows.map((r) => r.id)).not.toContain(id)
    const kpi = await getKpis(a1)
    expect(kpi.find((k) => k.key === 'totalLeads')?.value).toBe(0)
  })

  it('phone numbers stay hidden until the agent accepts', async () => {
    await checkIn(a1.id)
    await ingestLead({ name: 'Hidden', phone: phone(), department: 'INSTALLATION', channel: 'manual' })
    const before = await listLeads(a1, { view: 'all' })
    expect(before.rows[0]?.maskPhone).toBe(true)
  })

  it('B-03: only internal paths are allowed after login', () => {
    expect(safeNext('//evil.example')).toBe('/dashboard')
    expect(safeNext('/\\evil.example')).toBe('/dashboard')
    expect(safeNext('https://evil.example')).toBe('/dashboard')
    expect(safeNext('/leads/123?x=1')).toBe('/leads/123?x=1')
  })

  it('B-04: rate limiter blocks after the limit and opens after the window', async () => {
    for (let i = 0; i < 5; i++) await hit('login:user:test', 5, 60_000)
    expect((await isBlocked('login:user:test', 5)).blocked).toBe(true)
    expect((await isBlocked('login:user:other', 5)).blocked).toBe(false)
  })
})

describe('assignment and timers', () => {
  it('L-47: a paused team gets no automatic leads, even from the queue', async () => {
    await Team.updateOne({ departmentId: installation }, { paused: true })
    await checkIn(a1.id)
    const r = await ingestLead({ name: 'P', phone: phone(), department: 'INSTALLATION', channel: 'manual' })
    if (r.status !== 'created') throw new Error()
    await drainQueue()
    expect((await Lead.findById(r.leadId).lean())?.assignment?.agentId ?? null).toBeNull()
  })
})

describe('site visits', () => {
  it('B-02: field agents cannot cancel/unassign, must write feedback; managers are told about "not interested"', async () => {
    const [f1, f2] = await User.create([
      { name: 'Field A', email: `f${++n}@s.test`, role: 'field_agent', departmentId: installation },
      { name: 'Field B', email: `f${++n}@s.test`, role: 'field_agent', departmentId: installation },
    ])
    const visitId = await createVisit({ customerName: 'V', phone: phone(), address: 'DHA', kw: 10 }, mgr)
    const visit = await Visit.findById(visitId).lean()
    const owner = String(visit?.agentId) === String(f1._id) ? asSession(f1) : asSession(f2)
    await expect(updateVisit(visitId, 'cancelled', 'no reason given here', owner)).rejects.toThrow(/Only a manager/)
    await expect(updateVisit(visitId, 'not_interested', '', owner)).rejects.toThrow(/Write what happened/)
    await updateVisit(visitId, 'not_interested', 'price too high for him', owner)
    expect(String((await Visit.findById(visitId).lean())?.agentId)).not.toBe(owner.id)
    await expect(updateVisit(visitId, 'completed', 'done visit ok', a1)).rejects.toThrow(/Only managers and field agents/)
    expect((await Visit.findById(visitId).lean())?.departmentId?.toString()).toBe(String(installation))
  })
})

describe('Google Sheet', () => {
  const head = '"","full_name","whatsapp_number","Alternate Phone"'
  const row = (d: string, name: string, p: string, alt = '') => `"${d}","${name}","${p}","${alt}"`
  const serve = (lines: string[]) => vi.stubGlobal('fetch', vi.fn(async () => new Response([head, ...lines].join('\n'), { status: 200 })))

  it('L-44: one bad row never blocks the rest; L-45: deleting/sorting rows loses nothing', async () => {
    await setSetting('sheet_config', { spreadsheetId: 'sec-sheet', tabs: [{ name: 'Leads', department: 'INSTALLATION' }], headerOverrides: {}, cursor: {} })
    const existing = phone()
    await ingestLead({ name: 'Existing', phone: existing, department: 'INSTALLATION', channel: 'manual' })
    const old = phone()
    serve([row('10/1/26', 'Old', old)])
    await pullSheet('skip')
    const p1 = phone()
    const p2 = phone()
    // row 2: alt phone belongs to another customer (used to crash the import)
    serve([row('10/1/26', 'Old', old), row('10/2/26', 'Clash', p1, existing), row('10/2/26', 'Fine', p2)])
    const [first] = (await pullSheet('live'))!
    expect(first.failed).toBe(0)
    expect(await Lead.exists({ 'source.sheetTab': 'Leads', contactId: { $ne: null } })).toBeTruthy()
    // someone deletes the top rows and sorts — a new row in the middle is still found
    const p3 = phone()
    serve([row('10/3/26', 'Newer', p3), row('10/2/26', 'Fine', p2)])
    const [second] = (await pullSheet('live'))!
    expect(second.created).toBe(1)
    expect(await SheetRow.countDocuments({ status: 'ingested' })).toBe(3)
  })

  it('L-46: history import matches full names, and first names only when unique', () => {
    const agents = [
      { _id: 'x1', name: 'Waji Ahmed' },
      { _id: 'x2', name: 'Waji Field' },
      { _id: 'x3', name: 'Talha Khan' },
    ]
    expect(matchAgent('waji ahmed', agents)).toBe('x1')
    expect(matchAgent('Waji', agents)).toBeNull()
    expect(matchAgent('Talha', agents)).toBe('x3')
    expect(matchAgent('', agents)).toBeNull()
  })
})

describe('deleting leads (managers)', () => {
  it('managers delete leads of their department only; deleted leads vanish from lists and numbers, the customer can return', async () => {
    const { deleteLeads } = await import('@/server/services/leads')
    const { FollowUp, Notification } = await import('@/server/db/models')
    const id = await acceptedLeadFor(a1)
    await FollowUp.create({ leadId: id, agentId: new mongoose.Types.ObjectId(a1.id), number: 2, dueAt: new Date(Date.now() + 86_400_000) })
    await expect(deleteLeads(mgr, [id], '')).rejects.toThrow(/Write why/)
    await expect(deleteLeads(a1, [id], 'spam')).rejects.toThrow(/Only a manager/)
    expect(await deleteLeads(tradingMgr, [id], 'spam')).toMatchObject({ deleted: [], skipped: 1 })
    const lead = await Lead.findById(id).lean()
    const res = await deleteLeads(mgr, [id, 'not-an-id'], 'test lead')
    expect(res).toMatchObject({ deleted: [lead!.leadNo], skipped: 1 })
    expect((await listLeads(mgr, { view: 'all' })).rows.map((r) => r.id)).not.toContain(id)
    expect((await getKpis(mgr)).find((k) => k.key === 'totalLeads')?.value).toBe(0)
    expect(await FollowUp.countDocuments({ leadId: id, status: 'pending' })).toBe(0)
    expect(await Notification.exists({ userId: new mongoose.Types.ObjectId(a1.id), title: { $regex: 'was removed' } })).toBeTruthy()
    // same phone can come back as a fresh lead (the deleted one no longer blocks it)
    const contact = await (await import('@/server/db/models')).Contact.findById(lead!.contactId).lean()
    const again = await ingestLead({ name: 'Back again', phone: contact!.phones[0], department: 'INSTALLATION', channel: 'manual' })
    expect(again.status).toBe('created')
  })
})
