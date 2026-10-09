import { createHash } from 'node:crypto'
import { after, NextResponse, type NextRequest } from 'next/server'
import { safeEqual } from '@/server/auth/password'
import { metaConfig } from '@/server/services/meta-leads'
import { processStoredEvent, storeRawEvent, verifySignature } from '@/server/services/whatsapp'

/** Meta webhook verification (GET) for the Page "leadgen" field — echo hub.challenge when the verify token matches. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const token = metaConfig().verifyToken
  if (token && p.get('hub.mode') === 'subscribe' && safeEqual(p.get('hub.verify_token') ?? '', token)) {
    return new NextResponse((p.get('hub.challenge') ?? '').slice(0, 200), { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}

/** New Facebook / Instagram form leads. Stored first (retried by the cron tick if processing fails), answered fast. */
export async function POST(request: NextRequest) {
  const raw = await request.text()
  if (raw.length > 1_000_000) return NextResponse.json({ error: 'too large' }, { status: 413 })
  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'), metaConfig().appSecret)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }
  const key = `meta:${createHash('sha256').update(raw).digest('hex')}`
  if (await storeRawEvent(payload, key, 'meta_leads')) after(() => processStoredEvent(key))
  return NextResponse.json({ ok: true })
}
