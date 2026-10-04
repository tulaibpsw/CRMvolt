import { createHash } from 'node:crypto'
import { after, NextResponse, type NextRequest } from 'next/server'
import { processWebhook, storeRawEvent, verifySignature } from '@/server/services/whatsapp'

/** Meta webhook verification (GET) — echo hub.challenge when the verify token matches. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(p.get('hub.challenge') ?? '', { status: 200 })
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}

/** Messages, statuses and Coexistence echoes. Signature checked on the RAW body; answers fast, processes after. */
export async function POST(request: NextRequest) {
  const raw = await request.text()
  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'), process.env.WHATSAPP_APP_SECRET)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }
  const payload = JSON.parse(raw)
  const key = createHash('sha256').update(raw).digest('hex')
  if (await storeRawEvent(payload, key)) after(() => processWebhook(payload))
  return NextResponse.json({ ok: true })
}
