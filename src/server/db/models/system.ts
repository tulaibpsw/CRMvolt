/** Supporting collections: audit, jobs/locks, notifications, documents, WhatsApp, settings, ingest, counters. */
import { Schema, type ClientSession, type InferSchemaType } from 'mongoose'
import {
  AUDIT_ACTIONS,
  DEFAULT_INGEST_STATUS,
  DEFAULT_JOB_STATUS,
  DOCUMENT_CATEGORIES,
  DOCUMENT_OWNER_TYPES,
  INGEST_SOURCES,
  INGEST_STATUSES,
  JOB_KINDS,
  JOB_STATUSES,
  MESSAGE_DIRECTIONS,
  MESSAGE_SENDERS,
  MESSAGE_STATUSES,
  MESSAGE_TYPES,
  NOTIFICATION_TYPES,
  SETTING_KEYS,
  WHATSAPP_NUMBER_STATUSES,
  WHATSAPP_OWNER_TYPES,
  SHEET_ROW_STATUSES,
} from '@/domain/constants'
import { isE164 } from '@/lib/phone'
import { defineModel, insertOnly } from '@/server/db/plugins'

const { ObjectId, Mixed } = Schema.Types
const DAY_SECONDS = 24 * 60 * 60

/** Who changed what (PDF §23): users, settings, prices, money. Insert-only. */
const auditLogSchema = new Schema(
  {
    entity: { type: String, required: true },
    entityId: { type: ObjectId, default: null },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    before: { type: Mixed, default: null },
    after: { type: Mixed, default: null },
    actorId: { type: ObjectId, ref: 'User', default: null },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: false },
)
auditLogSchema.index({ entity: 1, entityId: 1, at: -1 })
insertOnly(auditLogSchema, 'audit_logs')

/** Timers checked by the cron tick (manager window, accept/contact deadlines, follow-ups). */
const jobSchema = new Schema(
  {
    kind: { type: String, enum: JOB_KINDS, required: true },
    leadId: { type: ObjectId, ref: 'Lead', default: null },
    assignmentId: { type: ObjectId, ref: 'LeadAssignment', default: null },
    userId: { type: ObjectId, ref: 'User', default: null },
    dueAt: { type: Date, required: true },
    status: { type: String, enum: JOB_STATUSES, default: DEFAULT_JOB_STATUS },
    /** e.g. "accept_due:<assignmentId>" — scheduling the same timer twice is a no-op. */
    dedupeKey: { type: String },
    tries: { type: Number, default: 0 },
    lastError: { type: String, default: null },
  },
  { timestamps: true },
)
jobSchema.index({ status: 1, dueAt: 1 })
jobSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } })

/** Lease locks so overlapping cron runs never double-process ("tick", "sheet-pull"). */
const lockSchema = new Schema(
  {
    _id: { type: String, required: true },
    until: { type: Date, required: true },
    holder: { type: String, default: null },
  },
  { versionKey: false },
)

/** Fixed-window counters (login / setup throttling). Removed by TTL when the window ends. */
const rateLimitSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, default: 0 },
    resetAt: { type: Date, required: true },
  },
  { versionKey: false },
)
rateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 })

/** One row per Google Sheet row already handled. The Sheet pull skips known rowKeys, so deleted/sorted rows never lose leads. */
const sheetRowSchema = new Schema(
  {
    rowKey: { type: String, required: true, unique: true },
    tab: { type: String, required: true },
    status: { type: String, enum: SHEET_ROW_STATUSES, required: true },
    leadId: { type: ObjectId, ref: 'Lead', default: null },
    tries: { type: Number, default: 0 },
    error: { type: String, default: null },
    sheetRow: { type: Number, default: null },
  },
  { timestamps: true },
)
sheetRowSchema.index({ tab: 1, status: 1 })

const notificationSchema = new Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: { type: String, default: null },
    /** Each alert is sent exactly once, e.g. "not_contacted:<assignmentId>". */
    dedupeKey: { type: String, required: true, unique: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
)
notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 })
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * DAY_SECONDS })

const pushSubscriptionSchema = new Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
    userAgent: String,
  },
  { timestamps: true },
)

const documentSchema = new Schema(
  {
    ownerType: { type: String, enum: DOCUMENT_OWNER_TYPES, required: true },
    ownerId: { type: ObjectId, required: true },
    category: { type: String, enum: DOCUMENT_CATEGORIES, required: true },
    fileName: { type: String, required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    /** Cloudinary public_id (type 'authenticated') — served only via short-lived signed URLs. */
    storageKey: { type: String, required: true },
    uploadedBy: { type: ObjectId, ref: 'User', required: true },
    deletedAt: { type: Date, default: null },
    /** Set when a manager cleared proof storage (the file is gone from Cloudinary; the call record stays). */
    clearedBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)
documentSchema.index({ ownerType: 1, ownerId: 1 })
documentSchema.index({ ownerType: 1, deletedAt: 1, createdAt: -1 })

const whatsappNumberSchema = new Schema(
  {
    phoneNumberId: { type: String, required: true, unique: true },
    number: { type: String, required: true, validate: { validator: (v: string) => isE164(v), message: 'number must be E.164' } },
    displayName: String,
    ownerType: { type: String, enum: WHATSAPP_OWNER_TYPES, required: true },
    agentId: { type: ObjectId, ref: 'User', default: null },
    departmentId: { type: ObjectId, ref: 'Department', default: null },
    status: { type: String, enum: WHATSAPP_NUMBER_STATUSES, required: true },
    connectedAt: { type: Date, default: null },
    lastEchoAt: { type: Date, default: null },
  },
  { timestamps: true },
)

const messageSchema = new Schema(
  {
    /** Meta wamid — makes webhook retries harmless. */
    waMessageId: { type: String, required: true, unique: true },
    contactId: { type: ObjectId, ref: 'Contact', required: true },
    leadId: { type: ObjectId, ref: 'Lead', default: null },
    numberId: { type: ObjectId, ref: 'WhatsAppNumber', required: true },
    direction: { type: String, enum: MESSAGE_DIRECTIONS, required: true },
    type: { type: String, enum: MESSAGE_TYPES, required: true },
    text: { type: String, default: '' },
    mediaStorageKey: { type: String, default: null },
    sentFrom: { type: String, enum: MESSAGE_SENDERS, required: true },
    sentByUserId: { type: ObjectId, ref: 'User', default: null },
    status: { type: String, enum: MESSAGE_STATUSES, required: true },
    at: { type: Date, required: true },
    statusAt: { type: Date, default: null },
    errorCode: { type: String, default: null },
  },
  { timestamps: true },
)
messageSchema.index({ contactId: 1, at: -1 })
messageSchema.index({ leadId: 1, at: -1 })

const settingSchema = new Schema(
  {
    key: { type: String, enum: SETTING_KEYS, required: true, unique: true },
    value: { type: Mixed, required: true },
    updatedBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

/** Raw webhook / Sheet payloads for debugging and replay. Deleted after 30 days (keeps Atlas M0 small). */
const ingestEventSchema = new Schema(
  {
    source: { type: String, enum: INGEST_SOURCES, required: true },
    idempotencyKey: { type: String, required: true, unique: true },
    payload: { type: Mixed, required: true },
    status: { type: String, enum: INGEST_STATUSES, default: DEFAULT_INGEST_STATUS },
    error: { type: String, default: null },
    tries: { type: Number, default: 0 },
    receivedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: false },
)
ingestEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 30 * DAY_SECONDS })

const counterSchema = new Schema({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } }, { versionKey: false })

export const AuditLog = defineModel('AuditLog', auditLogSchema)
export const Job = defineModel('Job', jobSchema)
export const Lock = defineModel('Lock', lockSchema)
export const RateLimit = defineModel('RateLimit', rateLimitSchema)
export const SheetRow = defineModel('SheetRow', sheetRowSchema)
export const Notification = defineModel('Notification', notificationSchema)
export const PushSubscription = defineModel('PushSubscription', pushSubscriptionSchema)
export const DocumentFile = defineModel('Document', documentSchema)
export const WhatsAppNumber = defineModel('WhatsAppNumber', whatsappNumberSchema)
export const Message = defineModel('Message', messageSchema)
export const Setting = defineModel('Setting', settingSchema)
export const IngestEvent = defineModel('IngestEvent', ingestEventSchema)
export const Counter = defineModel('Counter', counterSchema)

/** Atomic sequence (lead numbers, quotation numbers). Safe under concurrency. */
export async function nextSequence(name: string, session?: ClientSession): Promise<number> {
  const counter = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after', session })
  return counter.seq
}

export type MessageDoc = InferSchemaType<typeof messageSchema>
export type NotificationDoc = InferSchemaType<typeof notificationSchema>
