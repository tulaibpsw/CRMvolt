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

const tick = await import('@/app/api/cron/tick/route')
const sheetPull = await import('@/app/api/cron/sheet-pull/route')
const webhook = await import('@/app/api/webhooks/whatsapp/route')
const poll = await import('@/app/api/me/poll/route')
const sign = await import('@/app/api/uploads/sign/route')
const docs = await import('@/app/api/documents/[id]/route')
const { proxy } = await import('@/proxy')
const { ALL_MODELS, IngestEvent, Lead, User } = await import('@/server/db/models')
const { startSession } = await import('@/server/auth/session')
const { setSetting } = await import('@/server/services/settings')

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
  it('a Sheet that cannot be read returns a clear 500, not a crash', async () => {
    await setSetting('sheet_config', { spreadsheetId: 'unreadable-sheet-id-000000', tabs: [{ name: 'Leads' }], headerOverrides: {}, cursor: {} })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>login</html>', { status: 200 })))
    const res = await sheetPull.GET(req('/api/cron/sheet-pull', { headers: cron }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/Anyone with the link/)
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
    for (const p of ['/login', '/setup', '/api/cron/tick', '/manifest.webmanifest', '/sw.js', '/offline.html', '/icons/icon-192.png', '/brand/volton-logo.png']) expect(gate(p).status).toBe(200)
  })
})
