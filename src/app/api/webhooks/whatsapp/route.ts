import { createHash } from 'node:crypto'
import { after, NextResponse, type NextRequest } from 'next/server'
import { safeEqual } from '@/server/auth/password'
import { processStoredEvent, storeRawEvent, verifySignature } from '@/server/services/whatsapp'

/** Meta webhook verification (GET) — echo hub.challenge when the verify token matches. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const token = process.env.WHATSAPP_VERIFY_TOKEN
  if (token && p.get('hub.mode') === 'subscribe' && safeEqual(p.get('hub.verify_token') ?? '', token)) {
    return new NextResponse((p.get('hub.challenge') ?? '').slice(0, 200), { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}

/** Messages, statuses and Coexistence echoes. Signature checked on the RAW body; answers fast, processes after. */
export async function POST(request: NextRequest) {
  const raw = await request.text()
  if (raw.length > 1_000_000) return NextResponse.json({ error: 'too large' }, { status: 413 })
  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'), process.env.WHATSAPP_APP_SECRET)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }
  const key = createHash('sha256').update(raw).digest('hex')
  // Stored first: if processing fails it is retried by the cron tick, never lost.
  if (await storeRawEvent(payload, key)) after(() => processStoredEvent(key))
  return NextResponse.json({ ok: true })
}
