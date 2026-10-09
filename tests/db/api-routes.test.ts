/**
 * Every API route, called like the internet would call it: no login, wrong secret, right secret, bad input.
 * Plus the proxy gate (which pages need a login) and the PWA files being public.
 */
import { createHmac } from 'node:crypto'
import mongoose from 'mongoose'
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const jar = new Map<string, string>()
const pending: Promise<unknown>[] = []
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers({ 'x-forwarded-for': '10.9.9.9' }),
}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => unknown) => void pending.push(Promise.resolve().then(fn)),
}))
vi.mock('react', async (importOriginal) => ({ ...(await importOriginal<typeof import('react')>()), cache: <T,>(fn: T) => fn }))

process.env.CRON_SECRET = 'test-cron-secret-0123456789'
process.env.WHATSAPP_VERIFY_TOKEN = 'verify-me'
process.env.WHATSAPP_APP_SECRET = 'app-secret'
process.env.META_PAGE_ID = '100200300400'
process.env.META_PAGE_ACCESS_TOKEN = 'test-page-token'

const tick = await import('@/app/api/cron/tick/route')
const sheetPull = await import('@/app/api/cron/sheet-pull/route')
const webhook = await import('@/app/api/webhooks/whatsapp/route')
const metaHook = await import('@/app/api/webhooks/meta-leads/route')
const { subscribeMetaPage, syncMetaLeads } = await import('@/server/services/meta-leads')
const poll = await import('@/app/api/me/poll/route')
const sign = await import('@/app/api/uploads/sign/route')
const docs = await import('@/app/api/documents/[id]/route')
const { proxy } = await import('@/proxy')
const { ALL_MODELS, Contact, Department, IngestEvent, Lead, User } = await import('@/server/db/models')
const { startSession } = await import('@/server/auth/session')
const { getSetting, setSetting } = await import('@/server/services/settings')

const req = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => new NextRequest(new URL(url, 'https://crm.test'), init)
const cron = { authorization: `Bearer ${process.env.CRON_SECRET}` }

beforeAll(async () => {
  await mongoose.connect(inject('mongoUri'), { dbName: 'volton_api_test' })
  globalThis.__voltonMongoose = Promise.resolve(mongoose)
  await Promise.all(ALL_MODELS.map((m) => m.syncIndexes()))
  await Promise.all(ALL_MODELS.map((m) => m.collection.deleteMany({})))
})
afterAll(async () => {
  await Promise.allSettled(pending)
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
  globalThis.__voltonMongoose = undefined
})

describe('cron endpoints', () => {
  it('refuse without / with a wrong secret', async () => {
    expect((await tick.GET(req('/api/cron/tick'))).status).toBe(401)
    expect((await tick.GET(req('/api/cron/tick', { headers: { authorization: 'Bearer nope' } }))).status).toBe(401)
    expect((await sheetPull.GET(req('/api/cron/sheet-pull', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}x` } }))).status).toBe(401)
  })
  it('run with the right secret', async () => {
    const res = await tick.GET(req('/api/cron/tick', { headers: cron }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
    const pull = await sheetPull.GET(req('/api/cron/sheet-pull', { headers: cron }))
    expect(pull.status).toBe(200)
    expect(await pull.json()).toMatchObject({ ok: true, results: [] }) // no Sheet configured yet
  })
  it('a Sheet that cannot be read is reported (other sheets keep syncing), not a crash', async () => {
    await setSetting('sheet_config', { spreadsheetId: 'unreadable-sheet-id-000000', tabs: [{ name: 'Leads' }], headerOverrides: {}, cursor: {} })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>login</html>', { status: 200 })))
    const res = await sheetPull.GET(req('/api/cron/sheet-pull', { headers: cron }))
    expect(res.status).toBe(200)
    expect((await res.json()).results[0].problem).toMatch(/Anyone with the link/)
    vi.unstubAllGlobals()
    await setSetting('sheet_config', { spreadsheetId: '', tabs: [{ name: 'Leads' }], headerOverrides: {}, cursor: {} })
  })
})

describe('WhatsApp webhook', () => {
  const signed = (body: string, secret = 'app-secret') => ({ 'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` })

  it('GET verification echoes the challenge only with the right token', async () => {
    const ok = await webhook.GET(req('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345'))
    expect(ok.status).toBe(200)
    expect(await ok.text()).toBe('12345')
    expect((await webhook.GET(req('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1'))).status).toBe(403)
  })
  it('POST rejects unsigned / wrongly signed / broken bodies', async () => {
    const body = JSON.stringify({ entry: [] })
    expect((await webhook.POST(req('/api/webhooks/whatsapp', { method: 'POST', body }))).status).toBe(401)
    expect((await webhook.POST(req('/api/webhooks/whatsapp', { method: 'POST', body, headers: signed(body, 'other') }))).status).toBe(401)
    expect((await webhook.POST(req('/api/webhooks/whatsapp', { method: 'POST', body: '{bad', headers: signed('{bad') }))).status).toBe(400)
  })
  it('POST with a valid signature stores the event once and creates the lead', async () => {
    const body = JSON.stringify({
      entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'PN1', display_phone_number: '923000000001' }, contacts: [{ wa_id: '923009700001', profile: { name: 'Api Test' } }], messages: [{ id: 'wamid.api1', from: '923009700001', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'price?' } }] } }] }],
    })
    expect((await webhook.POST(req('/api/webhooks/whatsapp', { method: 'POST', body, headers: signed(body) }))).status).toBe(200)
    expect((await webhook.POST(req('/api/webhooks/whatsapp', { method: 'POST', body, headers: signed(body) }))).status).toBe(200) // Meta retry
    await Promise.allSettled(pending)
    expect(await IngestEvent.countDocuments()).toBe(1)
    expect((await IngestEvent.findOne().lean())?.status).toBe('processed')
    expect(await Lead.countDocuments({ 'source.channel': 'whatsapp' })).toBe(1)
  })
})

describe('Meta lead ads webhook (no Google Sheet)', () => {
  const signed = (body: string, secret = 'app-secret') => ({ 'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` })
  const metaLead = (id: string, phone: string, extra: Record<string, unknown> = {}) => ({
    id,
    created_time: '2026-10-09T05:15:30+0000',
    form_id: '555000111',
    campaign_name: 'Home solar Lahore',
    ad_name: 'Video 1',
    platform: 'ig',
    field_data: [
      { name: 'full_name', values: ['Meta Customer'] },
      { name: 'phone_number', values: [phone] },
      { name: 'city', values: ['Lahore'] },
      { name: 'what_size_solar_system_are_you_planning_to_install?', values: ['15_to_25_kw'] },
      { name: 'roof_type', values: ['Concrete'] },
    ],
    ...extra,
  })
  /** Fake Graph API: /{leadId}, /{formId}, /{pageId}/leadgen_forms, /{formId}/leads */
  const graph = (leads: Record<string, unknown>[]) =>
    vi.fn(async (input: URL | string) => {
      const url = new URL(String(input))
      expect(url.searchParams.get('access_token')).toBe('test-page-token')
      const path = url.pathname.replace('/v23.0/', '')
      if (path === '100200300400/leadgen_forms') return Response.json({ data: [{ id: '555000111', name: 'Solar quote form', status: 'ACTIVE' }] })
      if (path === '555000111/leads') return Response.json({ data: leads })
      if (path === '555000111') return Response.json({ id: '555000111', name: 'Solar quote form' })
      if (path === '100200300400/subscribed_apps') return Response.json({ success: url.searchParams.get('subscribed_fields') === 'leadgen' })
      const lead = leads.find((l) => l.id === path)
      return lead ? Response.json(lead) : Response.json({ error: { message: 'not found', code: 100 } }, { status: 400 })
    })

  beforeAll(async () => {
    await Department.create([{ code: 'INSTALLATION', name: 'Installation' }, { code: 'TRADING', name: 'Trading' }])
  })

  it('GET verification uses the verify token (shared with WhatsApp when META_VERIFY_TOKEN is empty)', async () => {
    const ok = await metaHook.GET(req('/api/webhooks/meta-leads?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=777'))
    expect(ok.status).toBe(200)
    expect(await ok.text()).toBe('777')
    expect((await metaHook.GET(req('/api/webhooks/meta-leads?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1'))).status).toBe(403)
  })
  it('POST rejects unsigned / wrongly signed bodies', async () => {
    const body = JSON.stringify({ object: 'page', entry: [] })
    expect((await metaHook.POST(req('/api/webhooks/meta-leads', { method: 'POST', body }))).status).toBe(401)
    expect((await metaHook.POST(req('/api/webhooks/meta-leads', { method: 'POST', body, headers: signed(body, 'other') }))).status).toBe(401)
  })
  it('a new form lead is fetched from Meta and created once, with the form answers and the form department', async () => {
    await setSetting('meta_leads', { forms: { '555000111': { name: 'Solar quote form', department: 'TRADING', leads: 0 } } })
    vi.stubGlobal('fetch', graph([metaLead('9001001', '+923009800001')]))
    const body = JSON.stringify({ object: 'page', entry: [{ id: '100200300400', time: 1, changes: [{ field: 'leadgen', value: { leadgen_id: '9001001', form_id: '555000111', page_id: '100200300400' } }] }] })
    expect((await metaHook.POST(req('/api/webhooks/meta-leads', { method: 'POST', body, headers: signed(body) }))).status).toBe(200)
    expect((await metaHook.POST(req('/api/webhooks/meta-leads', { method: 'POST', body, headers: signed(body) }))).status).toBe(200) // Meta retry
    await Promise.allSettled(pending)
    vi.unstubAllGlobals()
    expect((await IngestEvent.findOne({ source: 'meta_leads' }).lean())?.status).toBe('processed')
    const leads = await Lead.find({ 'source.channel': 'meta_webhook' }).lean()
    expect(leads).toHaveLength(1)
    const lead = leads[0]
    expect(lead.source).toMatchObject({ metaLeadId: '9001001', rowKey: 'meta:9001001', campaignName: 'Home solar Lahore', adName: 'Video 1', formName: 'Solar quote form', platform: 'instagram' })
    expect(lead.site?.systemSizeRange).toBe('15_to_25_kw')
    expect(lead.extra).toMatchObject({ roof_type: 'Concrete' })
    expect(String(lead.departmentId)).toBe(String((await Department.findOne({ code: 'TRADING' }).lean())?._id))
    expect((await Contact.findOne({ phones: '+923009800001' }).lean())?.city).toBe('Lahore')
    expect((await getSetting('meta_leads')).forms['555000111']).toMatchObject({ leads: 1, department: 'TRADING' })
  })
  it('the catch-up sync imports missed leads, skips ones already in the CRM and customers that came from the Sheet', async () => {
    await Contact.create({ name: 'Sheet Customer', phones: ['+923009800003'], whatsappE164: '+923009800003' })
    vi.stubGlobal('fetch', graph([metaLead('9001001', '+923009800001'), metaLead('9001002', '+923009800002'), metaLead('9001003', '+923009800003')]))
    const r = await syncMetaLeads(7)
    vi.unstubAllGlobals()
    expect(r).toMatchObject({ forms: 1, read: 3, created: 1, alreadyInCrm: 1, skipped: 1, failed: 0 })
    expect(await Lead.countDocuments({ 'source.channel': 'meta_webhook' })).toBe(2)
    expect((await getSetting('meta_leads')).lastError).toBeNull()
  })
  it('Turn on live leads subscribes the Page to leadgen', async () => {
    vi.stubGlobal('fetch', graph([]))
    await subscribeMetaPage()
    vi.unstubAllGlobals()
    expect((await getSetting('meta_leads')).subscribedAt).toBeTruthy()
  })
  it('an expired token is reported in plain words', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { message: 'Session has expired', code: 190 } }, { status: 400 })))
    await expect(syncMetaLeads(1)).rejects.toThrow(/expired/)
    vi.unstubAllGlobals()
    expect((await getSetting('meta_leads')).lastError).toMatch(/expired/)
  })
})

describe('signed-in endpoints', () => {
  it('refuse without a session', async () => {
    jar.clear()
    expect((await poll.GET()).status).toBe(401)
    expect((await sign.POST()).status).toBe(401)
    expect((await docs.GET(req('/api/documents/x'), { params: Promise.resolve({ id: 'x' }) })).status).toBe(401)
  })
  it('work with a session; bad ids are 404, not 500', async () => {
    const u = await User.create({ name: 'Api Agent', email: 'api@agent.test', role: 'agent' })
    await startSession(String(u._id))
    const res = await poll.GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ unread: 0, items: [] })
    expect((await docs.GET(req('/api/documents/not-an-id'), { params: Promise.resolve({ id: 'not-an-id' }) })).status).toBe(404)
    expect((await docs.GET(req('/api/documents/64b000000000000000000000'), { params: Promise.resolve({ id: '64b000000000000000000000' }) })).status).toBe(404)
    // Cloudinary keys missing in tests → clear 503 instead of a crash
    expect([200, 503]).toContain((await sign.POST()).status)
  })
})

describe('proxy gate', () => {
  const gate = (path: string, cookie?: string) => proxy(req(path, cookie ? { headers: { cookie: `volton_session=${cookie}` } } : {}))
  it('pages need a login cookie; the wanted page is kept', () => {
    const res = gate('/leads')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://crm.test/login?next=%2Fleads')
    expect(gate('/leads', 'abc').status).toBe(200)
  })
  it('login, setup, APIs and the PWA files are public', () => {
    for (const p of ['/login', '/setup', '/privacy', '/api/cron/tick', '/manifest.webmanifest', '/sw.js', '/offline.html', '/icons/icon-192.png', '/brand/volton-logo.png']) expect(gate(p).status).toBe(200)
  })
})
