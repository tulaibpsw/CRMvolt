import 'server-only'
import { loadLeadFor } from '@/server/auth/guards'
import { hit } from '@/server/services/rate-limit'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { MessageStatus, MessageType } from '@/domain/constants'
import { MESSAGE_TYPES } from '@/domain/constants'
import { normalizePhone } from '@/lib/phone'
import { connectDb } from '@/server/db/connection'
import { Contact, ContactAttempt, IngestEvent, Lead, Message, WhatsAppNumber } from '@/server/db/models'
import type { SessionUser } from '@/server/auth/session'
import { isDuplicateKey, logActivity, notify, oid, UserError } from '@/server/services/common'
import { ingestLead } from '@/server/services/ingest'

const GRAPH = 'https://graph.facebook.com/v23.0'

/** Meta signs the RAW body: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(appSecret, body). */
export function verifySignature(rawBody: string, header: string | null, appSecret: string | undefined): boolean {
  if (!appSecret || !header?.startsWith('sha256=')) return false
  const expected = Buffer.from(createHmac('sha256', appSecret).update(rawBody).digest('hex'))
  const actual = Buffer.from(header.slice(7))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

interface WaMessage {
  id: string
  from?: string
  to?: string
  timestamp: string
  type: string
  text?: { body: string }
  image?: { caption?: string }
  document?: { caption?: string; filename?: string }
  button?: { text: string }
  interactive?: { button_reply?: { title: string }; list_reply?: { title: string } }
  referral?: { source_id?: string; source_type?: string; source_url?: string; headline?: string; body?: string; media_type?: string; image_url?: string; video_url?: string; thumbnail_url?: string; ctwa_clid?: string; welcome_message?: { text?: string } }
}
interface WaValue {
  metadata?: { phone_number_id: string; display_phone_number: string }
  contacts?: { profile?: { name?: string }; wa_id: string }[]
  messages?: WaMessage[]
  message_echoes?: WaMessage[]
  statuses?: { id: string; status: string; timestamp: string; errors?: { code: number }[] }[]
}

const textOf = (m: WaMessage) => m.text?.body ?? m.image?.caption ?? m.document?.caption ?? m.document?.filename ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? `[${m.type}]`
const typeOf = (t: string): MessageType => ((MESSAGE_TYPES as readonly string[]).includes(t) ? (t as MessageType) : t === 'button' ? 'interactive' : 'unsupported')

async function numberFor(value: WaValue) {
  const id = value.metadata?.phone_number_id
  if (!id) return null
  const existing = await WhatsAppNumber.findOne({ phoneNumberId: id })
  if (existing) return existing
  const display = normalizePhone(`+${value.metadata?.display_phone_number?.replace(/\D/g, '')}`) ?? '+920000000000'
  return WhatsAppNumber.create({ phoneNumberId: id, number: display, ownerType: 'department', status: 'connected', connectedAt: new Date() })
}

/** Process one webhook delivery. Idempotent: each wamid is stored once. */
export async function processWebhook(payload: { entry?: { changes?: { field: string; value: WaValue }[] }[] }): Promise<void> {
  await connectDb()
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      const number = await numberFor(value)
      if (!number) continue

      for (const m of value.messages ?? []) {
        const phone = normalizePhone(`+${m.from}`)
        if (!phone) continue
        let contact = await Contact.findOne({ phones: phone })
        let lead = contact ? await Lead.findOne({ contactId: contact._id, status: 'open', deletedAt: null }).sort({ receivedAt: -1 }) : null
        if (!lead) {
          const ref = m.referral
          const result = await ingestLead({
            name: value.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? phone,
            phone,
            whatsapp: phone,
            department: null,
            channel: 'whatsapp',
            source: {
              platform: 'whatsapp',
              campaignName: ref?.headline,
              ctwa: ref ? { sourceId: ref.source_id, sourceType: ref.source_type, sourceUrl: ref.source_url, headline: ref.headline, body: ref.body, mediaType: ref.media_type, imageUrl: ref.image_url, videoUrl: ref.video_url, thumbnailUrl: ref.thumbnail_url, ctwaClid: ref.ctwa_clid, welcomeMessage: ref.welcome_message?.text } : undefined,
            },
          })
          if ('leadId' in result) lead = await Lead.findById(result.leadId)
          contact = await Contact.findOne({ phones: phone })
        }
        if (!contact) continue
        try {
          await Message.create({ waMessageId: m.id, contactId: contact._id, leadId: lead?._id ?? null, numberId: number._id, direction: 'in', type: typeOf(m.type), text: textOf(m), sentFrom: 'customer', status: 'received', at: new Date(Number(m.timestamp) * 1000) })
        } catch (error) {
          if (isDuplicateKey(error)) continue
          throw error
        }
        if (lead) {
          await logActivity(lead._id, 'message_in', null, { text: textOf(m).slice(0, 200) })
          if (lead.assignment?.agentId) await notify({ userIds: [lead.assignment.agentId], type: 'whatsapp_message', title: `WhatsApp from ${contact.name}`, body: textOf(m).slice(0, 80), link: `/leads/${lead._id}`, dedupeKey: `wa_in:${m.id}` })
        }
      }

      // Messages the agent typed in the WhatsApp Business app (Coexistence echoes) → proof under the number's owner.
      for (const m of value.message_echoes ?? []) {
        const phone = normalizePhone(`+${m.to}`)
        if (!phone) continue
        const contact = await Contact.findOne({ phones: phone })
        if (!contact) continue
        const lead = await Lead.findOne({ contactId: contact._id, status: 'open', deletedAt: null }).sort({ receivedAt: -1 })
        const agentId = number.agentId ?? lead?.assignment?.agentId ?? null
        try {
          await Message.create({ waMessageId: m.id, contactId: contact._id, leadId: lead?._id ?? null, numberId: number._id, direction: 'out', type: typeOf(m.type), text: textOf(m), sentFrom: 'app', sentByUserId: agentId, status: 'sent', at: new Date(Number(m.timestamp) * 1000) })
        } catch (error) {
          if (isDuplicateKey(error)) continue
          throw error
        }
        number.lastEchoAt = new Date()
        await number.save()
        if (lead) {
          await logActivity(lead._id, 'message_out', agentId, { text: textOf(m).slice(0, 200), via: 'app' })
          await verifyRecentAttempt(String(lead._id), agentId ? String(agentId) : null)
        }
      }

      for (const s of value.statuses ?? []) {
        const map: Record<string, MessageStatus> = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' }
        if (map[s.status]) await Message.updateOne({ waMessageId: s.id }, { status: map[s.status], statusAt: new Date(Number(s.timestamp) * 1000), errorCode: s.errors?.[0]?.code ? String(s.errors[0].code) : null })
      }
    }
  }
}

/** A real WhatsApp message right after a WhatsApp tap = the attempt is Verified (strongest proof). */
async function verifyRecentAttempt(leadId: string, agentId: string | null): Promise<void> {
  const since = new Date(Date.now() - 30 * 60_000)
  await ContactAttempt.findOneAndUpdate(
    { leadId: oid(leadId), ...(agentId ? { agentId: oid(agentId) } : {}), channel: 'whatsapp_chat', serverTapAt: { $gte: since }, proofStatus: { $ne: 'flagged' } },
    { proofStatus: 'verified' },
    { sort: { serverTapAt: -1 } },
  )
}

/** Send a text from the CRM chat panel (Cloud API). Within 24 h of the customer's last message free-form text is allowed. */
export async function sendWhatsAppText(leadId: string, text: string, user: SessionUser): Promise<void> {
  await connectDb()
  const token = process.env.WHATSAPP_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) throw new UserError('WhatsApp is not connected yet (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID missing).')
  const lead = await loadLeadFor(user, leadId, 'work')
  const body0 = text.trim()
  if (!body0 || body0.length > 1000) throw new UserError('Message must be 1–1000 characters')
  if ((await hit(`wa_send:${user.id}`, 30, 60_000)).blocked) throw new UserError('Too many messages — wait a minute')
  // Meta rule: free text only within 24 h of the customer's last message (otherwise an approved template is needed).
  const lastIn = await Message.findOne({ contactId: lead.contactId, direction: 'in' }).sort({ at: -1 }).select('at').lean()
  if (!lastIn || Date.now() - lastIn.at.getTime() > 24 * 3_600_000) throw new UserError('The customer has not messaged in the last 24 hours — use the WhatsApp button to chat from your phone')
  const contact = await Contact.findById(lead.contactId).lean()
  const to = (contact?.whatsappE164 ?? contact?.phones[0] ?? '').replace(/^\+/, '')
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: body0 } }),
  })
  const body = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } }
  if (!res.ok || !body.messages?.[0]) throw new UserError(body.error?.message ?? 'WhatsApp send failed')
  const number = await WhatsAppNumber.findOneAndUpdate({ phoneNumberId }, { $setOnInsert: { number: '+920000000000', ownerType: 'department', status: 'connected' } }, { upsert: true, returnDocument: 'after' })
  await Message.create({ waMessageId: body.messages[0].id, contactId: lead.contactId, leadId: lead._id, numberId: number._id, direction: 'out', type: 'text', text: body0, sentFrom: 'api', sentByUserId: oid(user.id), status: 'sent', at: new Date() })
  await logActivity(lead._id, 'message_out', user.id, { text: body0.slice(0, 200), via: 'crm' })
  await verifyRecentAttempt(leadId, user.id)
}

/** Process one stored webhook event and record the result (processWebhook is idempotent, so retries are safe). */
export async function processStoredEvent(key: string): Promise<void> {
  await connectDb()
  const event = await IngestEvent.findOneAndUpdate({ idempotencyKey: key, status: { $in: ['received', 'failed'] }, tries: { $lt: 5 } }, { $inc: { tries: 1 } }, { returnDocument: 'after' }).lean()
  if (!event) return
  try {
    await processWebhook(event.payload as Parameters<typeof processWebhook>[0])
    await IngestEvent.updateOne({ _id: event._id }, { status: 'processed', error: null })
  } catch (error) {
    console.error('[whatsapp webhook]', error)
    await IngestEvent.updateOne({ _id: event._id }, { status: 'failed', error: error instanceof Error ? error.message.slice(0, 300) : 'failed' })
  }
}

/** Cron: retry webhook events that were stored but not processed (server restarted, database hiccup…). */
export async function retryStoredEvents(): Promise<number> {
  await connectDb()
  const stuck = await IngestEvent.find({ source: 'whatsapp', status: { $in: ['received', 'failed'] }, tries: { $lt: 5 }, receivedAt: { $lt: new Date(Date.now() - 2 * 60_000) } }).sort({ receivedAt: 1 }).limit(20).select('idempotencyKey').lean()
  for (const e of stuck) await processStoredEvent(e.idempotencyKey)
  return stuck.length
}

export async function storeRawEvent(payload: unknown, key: string): Promise<boolean> {
  await connectDb()
  try {
    await IngestEvent.create({ source: 'whatsapp', idempotencyKey: key, payload })
    return true
  } catch (error) {
    if (isDuplicateKey(error)) return false
    throw error
  }
}
