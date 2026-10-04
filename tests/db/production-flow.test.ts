/**
 * The whole business day, end to end, through the REAL server actions (as the phone would call them):
 *   super admin → creates a manager → manager signs in, sets own password → creates agents → agents set passwords →
 *   check in → a new row lands in the Google Sheet → CRM pulls it → manager assigns it by hand → agent accepts →
 *   WhatsApp / call try 1 (no answer) → next day try 2 (no answer) → 3 days later try 3 → deal WON →
 *   manager approves → sales numbers update. Plus the Dead path (3 no-answers → manager disputes → re-opened).
 * Synthetic data only. Cookies/headers/redirect are simulated; everything else is the production code.
 */
import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest'

// ── Simulated request context (one "phone" at a time) ──
const jar = new Map<string, string>()
let ip = '10.0.0.1'
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers({ 'x-forwarded-for': ip, 'user-agent': 'vitest-phone' }),
}))
vi.mock('next/cache', () => ({ refresh: () => {}, revalidatePath: () => {} }))
// React's per-request cache would keep the first signed-in user across our simulated requests.
vi.mock('react', async (importOriginal) => ({ ...(await importOriginal<typeof import('react')>()), cache: <T,>(fn: T) => fn }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    const error = new Error(`REDIRECT ${url}`) as Error & { digest: string }
    error.digest = `NEXT_REDIRECT;replace;${url};307;`
    throw error
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))

const A = await import('@/server/actions')
const { ALL_MODELS, ContactAttempt, Department, Lead, Team, User } = await import('@/server/db/models')
const { hashPassword } = await import('@/server/auth/password')
const { getSessionUser } = await import('@/server/auth/session')
const { getKpis } = await import('@/server/services/queries')
const { PIPELINES } = await import('@/domain/constants')

const fd = (data: Record<string, string | number | boolean | undefined>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(data)) if (v !== undefined) f.append(k, String(v))
  return f
}
/** Run an action; return where it redirected (or the returned state). */
async function run<T>(p: Promise<T>): Promise<{ redirect?: string; state?: T }> {
  try {
    return { state: await p }
  } catch (error) {
    const digest = (error as { digest?: string }).digest
    if (digest?.startsWith('NEXT_REDIRECT')) return { redirect: digest.split(';')[2] }
    throw error
  }
}
async function signIn(login: string, password: string) {
  jar.clear()
  return run(A.loginAction(null, fd({ login, password })))
}
async function me() {
  return (await getSessionUser())!
}
const at = (iso: string) => vi.setSystemTime(new Date(iso))

// Tue 6 Oct 2026, 11:00 Pakistan time (office open 10:00–19:00 Mon–Sat)
const DAY1 = '2026-10-06T06:00:00.000Z'

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(DAY1)
  await mongoose.connect(inject('mongoUri'), { dbName: 'volton_production_flow' })
  globalThis.__voltonMongoose = Promise.resolve(mongoose)
  await Promise.all(ALL_MODELS.map((m) => m.syncIndexes()))
  await Promise.all(ALL_MODELS.map((m) => m.collection.deleteMany({})))
  const [, installation] = await Department.create([
    { code: 'TRADING', name: 'Trading', stages: PIPELINES.TRADING, routingKeywords: [] },
    { code: 'INSTALLATION', name: 'Installation', stages: PIPELINES.INSTALLATION, routingKeywords: [] },
  ])
  installationId = String(installation._id)
  await User.create({ name: 'Owner', email: 'owner@flow.test', username: 'owner', role: 'super_admin', passwordHash: await hashPassword('Owner#2026pass') })
})
afterAll(async () => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
  globalThis.__voltonMongoose = undefined
})

let installationId = ''
let leadId = ''

describe('1. accounts: super admin → manager → agents (everyone sets their own password)', () => {
  it('super admin signs in and adds a manager with a temporary password', async () => {
    expect((await signIn('owner@flow.test', 'Owner#2026pass')).redirect).toBe('/dashboard')
    const res = await run(A.createUserAction(null, fd({ name: 'Bilal Manager', username: 'bilal', password: 'Temp#12345', role: 'manager', departmentId: installationId })))
    expect(res.state?.ok).toBe(true)
    const bilal = await User.findOne({ username: 'bilal' }).lean()
    expect(bilal?.mustChangePassword).toBe(true)
    expect(await Team.exists({ managerId: bilal?._id })).toBeTruthy()
  })

  it('an admin cannot add managers — only the super admin can', async () => {
    await User.create({ name: 'Plain Admin', email: 'admin@flow.test', username: 'admin1', role: 'admin', passwordHash: await hashPassword('Admin#2026pass') })
    await signIn('admin1', 'Admin#2026pass')
    const res = await run(A.createUserAction(null, fd({ name: 'Sneaky', username: 'sneaky', password: 'Temp#12345', role: 'manager', departmentId: installationId })))
    expect(res.state).toMatchObject({ ok: false })
  })

  it('manager must change the temporary password before using the app', async () => {
    expect((await signIn('bilal', 'Temp#12345')).redirect).toBe('/change-password')
    const weak = await run(A.changePasswordAction(null, fd({ current: 'Temp#12345', password: 'bilal123x', confirm: 'bilal123x' })))
    expect(weak.state?.ok).toBe(false) // contains the username
    const ok = await run(A.changePasswordAction(null, fd({ current: 'Temp#12345', password: 'Solar#Mgr2026', confirm: 'Solar#Mgr2026' })))
    expect(ok.redirect).toBe('/dashboard?notice=password-changed')
    expect((await me()).mustChangePassword).toBe(false)
  })

  it('manager creates two call agents; they join the round-robin order', async () => {
    await signIn('bilal', 'Solar#Mgr2026')
    for (const [name, username] of [['Talha Khan', 'talha'], ['Waji Ahmed', 'waji']]) {
      const res = await run(A.createUserAction(null, fd({ name, username, password: 'Start#2026', role: 'agent' })))
      expect(res.state?.ok).toBe(true)
    }
    const nope = await run(A.createUserAction(null, fd({ name: 'X', username: 'xadmin', password: 'Start#2026', role: 'admin' })))
    expect(nope.state?.ok).toBe(false)
    const team = await Team.findOne().lean()
    expect(team?.memberOrder).toHaveLength(2)
  })

  it('agents sign in, set their own passwords', async () => {
    for (const [u, p] of [['talha', 'Agent#One2026'], ['waji', 'Agent#Two2026']]) {
      expect((await signIn(u, 'Start#2026')).redirect).toBe('/change-password')
      expect((await run(A.changePasswordAction(null, fd({ current: 'Start#2026', password: p, confirm: p })))).redirect).toBe('/dashboard?notice=password-changed')
    }
  })

  it('an agent cannot create users (sent away with "no access")', async () => {
    await signIn('talha', 'Agent#One2026')
    expect((await run(A.createUserAction(null, fd({ name: 'Y', username: 'yy1', password: 'Start#2026', role: 'agent' })))).redirect).toBe('/dashboard?notice=no-access')
  })

  it('5 wrong passwords lock the account for 15 minutes; open-redirect links are ignored', async () => {
    ip = '10.0.0.66'
    for (let i = 0; i < 5; i++) expect((await signIn('waji', `wrong-${i}`)).state).toMatchObject({ ok: false, message: 'Wrong username or password' })
    const locked = await signIn('waji', 'Agent#Two2026')
    expect(locked.state?.message).toMatch(/Too many wrong tries/)
    at('2026-10-06T06:16:00.000Z')
    jar.clear()
    expect((await run(A.loginAction(null, fd({ login: 'waji', password: 'Agent#Two2026', next: '//evil.example' })))).redirect).toBe('/dashboard')
    ip = '10.0.0.1'
  })
})

describe('2. a lead lands in the Google Sheet and reaches the right agent', () => {
  const header = ['', 'campaign name', 'full_name', 'whatsapp_number', 'Remark']
  const csv = (rows: string[][]) => [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
  const sheet = (rows: string[][]) => vi.stubGlobal('fetch', vi.fn(async () => new Response(csv(rows), { status: 200 })))
  const oldRow = ['10/5/26', 'Solar Home Oct', 'Old Customer', '+923009800001', 'already handled on paper']

  it('agents check in for the day', async () => {
    for (const [u, p] of [['talha', 'Agent#One2026'], ['waji', 'Agent#Two2026']]) {
      await signIn(u, p)
      await A.checkInAction()
    }
  })

  it('admin connects the Sheet and starts "from now" (old rows are not imported)', async () => {
    await signIn('owner', 'Owner#2026pass')
    expect((await run(A.saveSheetConfigAction(null, fd({ spreadsheet: 'https://docs.google.com/spreadsheets/d/1TestSheetIdAbcdefghijklmnop/edit', tabs: 'Leads:INSTALLATION' })))).state?.ok).toBe(true)
    sheet([oldRow])
    const live = await run(A.pullSheetAction(null, fd({ mode: 'live' })))
    expect(live.state?.message).toMatch(/first choose/)
    const skip = await run(A.pullSheetAction(null, fd({ mode: 'skip' })))
    expect(skip.state?.message).toMatch(/1 skipped/)
    expect(await Lead.countDocuments()).toBe(0)
  })

  it('a new customer fills the Facebook form → the row appears → the next pull creates the lead', async () => {
    sheet([oldRow, ['10/6/26', 'Solar Home Oct', 'Ayesha Malik', '+923009800002', 'wants 10 kW']])
    await signIn('bilal', 'Solar#Mgr2026')
    const res = await run(A.pullSheetAction(null, fd({ mode: 'live' })))
    expect(res.state?.message).toMatch(/1 new/)
    const lead = await Lead.findOne().lean()
    leadId = String(lead!._id)
    expect(lead?.source?.channel).toBe('sheet')
  })

  it('manager assigns the lead by hand to Waji', async () => {
    await signIn('bilal', 'Solar#Mgr2026')
    const waji = await User.findOne({ username: 'waji' }).lean()
    const res = await run(A.assignLeadAction(null, fd({ leadId, agentId: String(waji!._id) })))
    expect(res.state).toMatchObject({ ok: true, message: 'Assigned to Waji Ahmed' })
  })

  it('Talha cannot open, call or close Waji\'s lead', async () => {
    await signIn('talha', 'Agent#One2026')
    expect(await A.tapAttemptAction(leadId, 'phone_call')).toEqual({ error: 'Lead not found' })
    expect((await run(A.changeStageAction(null, fd({ leadId, stage: 'won', wonValuePkr: 5_000_000 })))).state).toMatchObject({ ok: false })
  })
})

describe('3. three tries over three days, then the deal closes', () => {
  async function tryOnce(channel: 'whatsapp_chat' | 'phone_call', outcome: Record<string, string | number>) {
    const tap = await A.tapAttemptAction(leadId, channel)
    if ('error' in tap) throw new Error(tap.error)
    const tapAt = Date.now()
    at(new Date(tapAt + 90_000).toISOString())
    return run(A.logOutcomeAction(null, fd({ attemptId: tap.attemptId, leftAt: tapAt + 2_000, returnedAt: tapAt + 85_000, ...outcome })))
  }

  it('Waji must accept first; WhatsApp opens with a greeting', async () => {
    await signIn('waji', 'Agent#Two2026')
    expect(await A.tapAttemptAction(leadId, 'whatsapp_chat')).toEqual({ error: 'Accept the lead first' })
    await A.acceptLeadAction(fd({ leadId }))
    const tap = await A.tapAttemptAction(leadId, 'whatsapp_chat')
    expect('href' in tap && tap.href).toMatch(/^https:\/\/wa\.me\/923009800002\?text=Assalam/)
    // save the open attempt as "no answer" so the next try can start
    const res = await run(A.logOutcomeAction(null, fd({ attemptId: 'attemptId' in tap ? tap.attemptId : '', result: 'no_answer', leftAt: Date.now(), returnedAt: Date.now() + 20_000 })))
    expect(res.state).toMatchObject({ ok: true })
  })

  it('try 1 (day 1): automatic follow-up tomorrow', async () => {
    const lead = await Lead.findById(leadId).lean()
    expect(lead?.attemptCount).toBe(1)
    expect(lead?.nextFollowUpAt?.toISOString().slice(0, 10)).toBe('2026-10-07')
  })

  it('try 2 (next day): no answer again → follow-up in 3 days', async () => {
    at('2026-10-07T06:00:00.000Z')
    await signIn('waji', 'Agent#Two2026')
    await A.checkInAction()
    expect((await tryOnce('phone_call', { result: 'no_answer' })).state).toMatchObject({ ok: true })
    const lead = await Lead.findById(leadId).lean()
    expect(lead?.attemptCount).toBe(2)
    expect(lead?.nextFollowUpAt?.toISOString().slice(0, 10)).toBe('2026-10-10')
  })

  it('try 3 (3 days later): customer says YES — deal won, waiting for the manager', async () => {
    at('2026-10-10T06:00:00.000Z')
    await signIn('waji', 'Agent#Two2026')
    await A.checkInAction()
    const noValue = await tryOnce('phone_call', { result: 'connected', response: 'deal_won', remarks: 'agreed 10 kW system' })
    expect(noValue.state).toMatchObject({ ok: false, message: 'Enter the sale value (PKR)' })
    const attempt = await ContactAttempt.findOne({ leadId, outcomeAt: null }).lean()
    const res = await run(A.logOutcomeAction(null, fd({ attemptId: String(attempt!._id), result: 'connected', response: 'deal_won', remarks: 'agreed 10 kW system', wonValuePkr: 1_500_000, durationMin: 45, leftAt: Date.now() - 80_000, returnedAt: Date.now() - 5_000 })))
    expect(res.state).toMatchObject({ ok: true })
    const lead = await Lead.findById(leadId).lean()
    expect(lead).toMatchObject({ status: 'won', attemptCount: 3, wonValuePkr: 1_500_000 })
    expect(lead?.closeReview?.status).toBe('pending')
    const saved = await ContactAttempt.findById(attempt!._id).lean()
    expect(saved?.flags).toEqual(expect.arrayContaining(['lead_closed', 'duration_mismatch']))
    expect(saved?.durationSec).toBeLessThanOrEqual(150)
  })

  it('sales do not count until the manager approves; after OK they do', async () => {
    await signIn('bilal', 'Solar#Mgr2026')
    const before = await getKpis(await me())
    expect(before.find((k) => k.key === 'wonSales')).toMatchObject({ value: 0, hint: '+1 waiting for manager approval' })
    const attempt = await ContactAttempt.findOne({ leadId, flags: 'lead_closed' }).lean()
    expect((await run(A.reviewAttemptAction(null, fd({ attemptId: String(attempt!._id), decision: 'reviewed' })))).state).toMatchObject({ ok: true })
    const after = await getKpis(await me())
    expect(after.find((k) => k.key === 'wonSales')?.value).toBe(1)
    expect(after.find((k) => k.key === 'salesValue')?.value).toMatch(/15/)
  })
})

describe('4. the Dead path: 3 no-answers → manager checks → disputes → lead re-opened for another agent', () => {
  it('runs end to end', async () => {
    at('2026-10-12T06:00:00.000Z') // Monday
    vi.stubGlobal('fetch', vi.fn(async () => new Response(['"","campaign name","full_name","whatsapp_number"', '"10/12/26","Solar Home Oct","Faraz Ali","+923009800003"'].join('\n'), { status: 200 })))
    await signIn('bilal', 'Solar#Mgr2026')
    await run(A.pullSheetAction(null, fd({ mode: 'live' })))
    const lead = await Lead.findOne({ status: 'open' }).lean()
    const id = String(lead!._id)
    const talha = await User.findOne({ username: 'talha' }).lean()
    await run(A.assignLeadAction(null, fd({ leadId: id, agentId: String(talha!._id) })))
    for (const day of ['2026-10-12', '2026-10-13', '2026-10-16']) {
      at(`${day}T07:00:00.000Z`)
      await signIn('talha', 'Agent#One2026')
      await A.checkInAction()
      await A.acceptLeadAction(fd({ leadId: id }))
      const tap = await A.tapAttemptAction(id, 'phone_call')
      if ('error' in tap) throw new Error(tap.error)
      const res = await run(A.logOutcomeAction(null, fd({ attemptId: tap.attemptId, result: 'no_answer', leftAt: Date.now() + 1_000, returnedAt: Date.now() + 30_000 })))
      expect(res.state).toMatchObject({ ok: true })
    }
    expect((await Lead.findById(id).lean())?.status).toBe('unreachable')
    await signIn('bilal', 'Solar#Mgr2026')
    const last = await ContactAttempt.findOne({ leadId: id, flags: 'lead_closed' }).lean()
    expect((await run(A.reviewAttemptAction(null, fd({ attemptId: String(last!._id), decision: 'disputed' })))).state).toMatchObject({ ok: false }) // needs a note
    expect((await run(A.reviewAttemptAction(null, fd({ attemptId: String(last!._id), decision: 'disputed', note: 'customer says nobody called' })))).state).toMatchObject({ ok: true })
    const reopened = await Lead.findById(id).lean()
    expect(reopened?.status).toBe('open')
    expect(String(reopened?.assignment?.agentId)).not.toBe(String(talha!._id))
  })
})
