/** Contacts, leads, assignment history, contact attempts (proof), follow-ups, activity timeline. */
import { Schema, type InferSchemaType } from 'mongoose'
import {
  ACTIVITY_TYPES,
  AD_PLATFORMS,
  ASSIGNMENT_METHODS,
  ASSIGNMENT_STATES,
  ATTEMPT_CHANNELS,
  CALL_RESULTS,
  CONTACT_TYPES,
  CUSTOMER_RESPONSES,
  DEFAULT_ASSIGNMENT_STATE,
  DEFAULT_CONTACT_TYPE,
  DEFAULT_FOLLOW_UP_STATUS,
  DEFAULT_LEAD_STATUS,
  DEFAULT_PROOF_STATUS,
  DEFAULT_REVIEW_STATUS,
  DEFAULT_STAGE,
  FOLLOW_UP_STATUSES,
  LEAD_CHANNELS,
  LEAD_STATUSES,
  LOST_REASONS,
  PROOF_FLAGS,
  PROOF_STATUSES,
  PROPERTY_TYPES,
  REVIEW_STATUSES,
  ROOF_TYPES,
  SHADING_LEVELS,
  STAGES,
  TRADING_CUSTOMER_TYPES,
} from '@/domain/constants'
import { isE164 } from '@/lib/phone'
import { auditFields, defineModel, insertOnly, softDelete } from '@/server/db/plugins'

const { ObjectId, Mixed } = Schema.Types

// ── Contact: a person/business, unique by phone. A contact can have leads in both departments. ──
const contactSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phones: {
      type: [String],
      validate: [
        { validator: (v: string[]) => v.length > 0, message: 'at least one phone is required' },
        { validator: (v: string[]) => v.every((p) => isE164(p)), message: 'phones must be E.164 (+92…)' },
      ],
    },
    whatsappE164: { type: String, default: null, validate: { validator: (v: string | null) => v === null || isE164(v), message: 'whatsapp must be E.164' } },
    email: { type: String, lowercase: true, trim: true },
    city: String,
    area: String,
    address: String,
    type: { type: String, enum: CONTACT_TYPES, default: DEFAULT_CONTACT_TYPE },
  },
  { timestamps: true },
)
contactSchema.index({ phones: 1 }, { unique: true })
contactSchema.plugin(auditFields)
contactSchema.plugin(softDelete)

// ── Lead ──
const ctwaSchema = new Schema(
  {
    sourceId: String, // Meta referral.source_id (ad ID)
    sourceType: String, // referral.source_type — Meta documents only "ad"
    sourceUrl: String,
    headline: String,
    body: String,
    mediaType: String,
    imageUrl: String,
    videoUrl: String,
    thumbnailUrl: String,
    ctwaClid: String,
    welcomeMessage: String,
  },
  { _id: false },
)

const sourceSchema = new Schema(
  {
    channel: { type: String, enum: LEAD_CHANNELS, required: true },
    /** Unique key for Sheet rows: Meta lead ID or hash(tab + phone + created time). */
    rowKey: String,
    metaLeadId: String,
    /** When the customer submitted the form (Meta created_time). */
    submittedAt: Date,
    campaignId: String,
    campaignName: String,
    adsetId: String,
    adsetName: String,
    adId: String,
    adName: String,
    formId: String,
    formName: String,
    platform: { type: String, enum: AD_PLATFORMS },
    sheetTab: String,
    sheetRow: Number,
    ctwa: { type: ctwaSchema, default: undefined },
  },
  { _id: false },
)

const assignmentSchema = new Schema(
  {
    agentId: { type: ObjectId, ref: 'User', default: null },
    state: { type: String, enum: ASSIGNMENT_STATES, default: DEFAULT_ASSIGNMENT_STATE },
    assignedAt: { type: Date, default: null },
    assignedBy: { type: ObjectId, ref: 'User', default: null },
    method: { type: String, enum: ASSIGNMENT_METHODS, default: null },
    acceptedAt: { type: Date, default: null },
    bounces: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
)

const siteSchema = new Schema(
  {
    propertyType: { type: String, enum: PROPERTY_TYPES },
    monthlyBillPkr: { type: Number, min: 0 },
    monthlyUnits: { type: Number, min: 0 },
    roofType: { type: String, enum: ROOF_TYPES },
    shading: { type: String, enum: SHADING_LEVELS },
    targetKw: { type: Number, min: 0, max: 1000 },
    batteryRequired: Boolean,
    netMeteringRequired: Boolean,
  },
  { _id: false },
)

const tradingSchema = new Schema(
  {
    customerType: { type: String, enum: TRADING_CUSTOMER_TYPES },
    products: { type: [String], default: undefined },
    quantity: { type: Number, min: 0 },
    deliveryCity: String,
  },
  { _id: false },
)

const leadSchema = new Schema(
  {
    leadNo: { type: String, required: true, unique: true },
    contactId: { type: ObjectId, ref: 'Contact', required: true },
    /** null = not routed yet (admin "Unrouted" queue). */
    departmentId: { type: ObjectId, ref: 'Department', default: null },
    teamId: { type: ObjectId, ref: 'Team', default: null },
    stage: { type: String, enum: STAGES, default: DEFAULT_STAGE },
    stageChangedAt: { type: Date, default: () => new Date() },
    status: { type: String, enum: LEAD_STATUSES, default: DEFAULT_LEAD_STATUS },
    closedAt: { type: Date, default: null },
    lostReason: { type: String, enum: LOST_REASONS, default: null },
    wonValuePkr: { type: Number, min: 0, default: null },
    receivedAt: { type: Date, required: true },
    /** Arrival, or next opening time for night/holiday leads. */
    assignableAt: { type: Date, required: true },
    source: { type: sourceSchema, required: true },
    assignment: { type: assignmentSchema, default: () => ({}) },
    firstContactAt: { type: Date, default: null },
    lastContactAt: { type: Date, default: null },
    attemptCount: { type: Number, default: 0, min: 0 },
    noAnswerStreak: { type: Number, default: 0, min: 0 },
    nextFollowUpAt: { type: Date, default: null },
    site: { type: siteSchema, default: undefined },
    trading: { type: tradingSchema, default: undefined },
    /** Unknown Sheet columns, kept so nothing is lost. */
    extra: { type: Mixed, default: undefined },
    version: { type: Number, default: 0 },
  },
  { timestamps: true },
)
leadSchema.plugin(auditFields)
leadSchema.plugin(softDelete)
leadSchema.index({ departmentId: 1, stage: 1, status: 1 })
leadSchema.index({ 'assignment.agentId': 1, status: 1, nextFollowUpAt: 1 })
leadSchema.index({ contactId: 1, departmentId: 1 }, { unique: true, partialFilterExpression: { status: DEFAULT_LEAD_STATUS } })
leadSchema.index({ 'source.metaLeadId': 1 }, { unique: true, partialFilterExpression: { 'source.metaLeadId': { $type: 'string' } } })
leadSchema.index({ 'source.rowKey': 1 }, { unique: true, partialFilterExpression: { 'source.rowKey': { $type: 'string' } } })
leadSchema.index({ receivedAt: -1 })

// ── Assignment history (never overwritten — PDF §6) ──
const leadAssignmentSchema = new Schema(
  {
    leadId: { type: ObjectId, ref: 'Lead', required: true },
    agentId: { type: ObjectId, ref: 'User', required: true },
    /** null = assigned by the system (round-robin). */
    by: { type: ObjectId, ref: 'User', default: null },
    method: { type: String, enum: ASSIGNMENT_METHODS, required: true },
    assignedAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    reason: { type: String, default: null },
  },
  { timestamps: true },
)
leadAssignmentSchema.index({ leadId: 1, assignedAt: -1 })
leadAssignmentSchema.index({ agentId: 1, assignedAt: -1 })

// ── Contact attempt = proof of work (PDF `calls`, feature-list "VoIP log") ──
const contactAttemptSchema = new Schema(
  {
    leadId: { type: ObjectId, ref: 'Lead', required: true },
    agentId: { type: ObjectId, ref: 'User', required: true },
    channel: { type: String, enum: ATTEMPT_CHANNELS, required: true },
    followUpNo: { type: Number, default: 0, min: 0 },
    /** Server time of the WhatsApp/Call tap (logged before the app opened). */
    serverTapAt: { type: Date, required: true },
    leftAt: { type: Date, default: null },
    returnedAt: { type: Date, default: null },
    outcomeAt: { type: Date, default: null },
    result: { type: String, enum: CALL_RESULTS, default: null },
    response: { type: String, enum: CUSTOMER_RESPONSES, default: null },
    remarks: { type: String, trim: true, maxlength: 2000, default: null },
    durationSec: { type: Number, min: 0, default: null },
    proof: {
      docIds: [{ type: ObjectId, ref: 'Document' }],
      phash: { type: String, default: null },
      messageIds: [{ type: ObjectId, ref: 'Message' }],
    },
    proofStatus: { type: String, enum: PROOF_STATUSES, default: DEFAULT_PROOF_STATUS },
    flags: [{ type: String, enum: PROOF_FLAGS }],
    review: {
      status: { type: String, enum: REVIEW_STATUSES, default: DEFAULT_REVIEW_STATUS },
      by: { type: ObjectId, ref: 'User', default: null },
      at: { type: Date, default: null },
      note: { type: String, default: null },
    },
    /** Optional recorded-calls add-on (WhatsApp Calling API). */
    recording: { type: new Schema({ blobKey: String, sourceId: String, durationSec: Number }, { _id: false }), default: undefined },
  },
  { timestamps: true },
)
contactAttemptSchema.index({ leadId: 1, serverTapAt: -1 })
contactAttemptSchema.index({ agentId: 1, serverTapAt: -1 })
contactAttemptSchema.index({ proofStatus: 1, 'review.status': 1 })

const followUpSchema = new Schema(
  {
    leadId: { type: ObjectId, ref: 'Lead', required: true },
    agentId: { type: ObjectId, ref: 'User', required: true },
    number: { type: Number, required: true, min: 1 },
    dueAt: { type: Date, required: true },
    status: { type: String, enum: FOLLOW_UP_STATUSES, default: DEFAULT_FOLLOW_UP_STATUS },
    outcome: { type: String, default: null },
    attemptId: { type: ObjectId, ref: 'ContactAttempt', default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
)
followUpSchema.index({ agentId: 1, status: 1, dueAt: 1 })
followUpSchema.index({ leadId: 1, number: 1 })

/** The lead timeline (PDF §18). Insert-only. */
const activitySchema = new Schema(
  {
    leadId: { type: ObjectId, ref: 'Lead', required: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    actorId: { type: ObjectId, ref: 'User', default: null },
    at: { type: Date, required: true, default: () => new Date() },
    data: { type: Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)
activitySchema.index({ leadId: 1, at: -1 })
insertOnly(activitySchema, 'activities')

export const Contact = defineModel('Contact', contactSchema)
export const Lead = defineModel('Lead', leadSchema)
export const LeadAssignment = defineModel('LeadAssignment', leadAssignmentSchema)
export const ContactAttempt = defineModel('ContactAttempt', contactAttemptSchema)
export const FollowUp = defineModel('FollowUp', followUpSchema)
export const Activity = defineModel('Activity', activitySchema)

export type ContactDoc = InferSchemaType<typeof contactSchema>
export type LeadDoc = InferSchemaType<typeof leadSchema>
export type LeadAssignmentDoc = InferSchemaType<typeof leadAssignmentSchema>
export type ContactAttemptDoc = InferSchemaType<typeof contactAttemptSchema>
export type FollowUpDoc = InferSchemaType<typeof followUpSchema>
export type ActivityDoc = InferSchemaType<typeof activitySchema>
