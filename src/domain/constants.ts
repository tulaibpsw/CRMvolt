/**
 * The ONLY place enum values are defined.
 * Mongoose `enum`, Zod `z.enum` and UI maps all import from here. Elsewhere, use the exported
 * union types (Stage, Role…) so TypeScript checks every literal — never declare a parallel list.
 * Every UPPER_SNAKE array here must be classified in src/domain/ui-maps.ts (a test enforces it).
 */

/** agent = call agent (phone/WhatsApp); field_agent = outdoor site-visit agent (Excel "Visits" tab). */
/** super_admin = owner: everything an admin can do + add/remove managers and admins. */
export const ROLES = ['super_admin', 'admin', 'manager', 'agent', 'field_agent'] as const
export type Role = (typeof ROLES)[number]

export const DEPARTMENTS = ['TRADING', 'INSTALLATION'] as const
export type Department = (typeof DEPARTMENTS)[number]

export const LEAD_STATUSES = ['open', 'won', 'lost', 'unreachable', 'junk'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const STAGES = [
  'new',
  'contacted',
  'interested',
  'requirement_collected',
  'site_survey',
  'quotation_pending',
  'quotation_sent',
  'negotiation',
  'won',
  'lost',
] as const
export type Stage = (typeof STAGES)[number]

/** Stages per department, in board order. Trading has no site survey. */
export const PIPELINES: Record<Department, readonly Stage[]> = {
  INSTALLATION: STAGES,
  TRADING: STAGES.filter((stage) => stage !== 'site_survey'),
}

export const LEAD_CHANNELS = ['sheet', 'whatsapp', 'website', 'manual', 'csv_import', 'meta_webhook'] as const
export type LeadChannel = (typeof LEAD_CHANNELS)[number]

export const AD_PLATFORMS = ['facebook', 'instagram', 'whatsapp', 'unknown'] as const
export type AdPlatform = (typeof AD_PLATFORMS)[number]

export const CONTACT_TYPES = ['individual', 'business'] as const
export type ContactType = (typeof CONTACT_TYPES)[number]

export const ASSIGNMENT_STATES = ['unassigned', 'manager_window', 'waiting', 'assigning', 'assigned', 'accepted'] as const
export type AssignmentState = (typeof ASSIGNMENT_STATES)[number]

export const ASSIGNMENT_METHODS = ['manual', 'auto', 'timeout', 'transfer'] as const
export type AssignmentMethod = (typeof ASSIGNMENT_METHODS)[number]

export const ATTEMPT_CHANNELS = ['whatsapp_chat', 'whatsapp_call', 'phone_call'] as const
export type AttemptChannel = (typeof ATTEMPT_CHANNELS)[number]

/** PDF §9 call statuses, step 1 of the outcome sheet. */
export const CALL_RESULTS = ['connected', 'no_answer', 'busy', 'number_off', 'wrong_number', 'could_not_call'] as const
export type CallResult = (typeof CALL_RESULTS)[number]

/** PDF §9 customer responses, step 2 (only when connected). */
export const CUSTOMER_RESPONSES = ['interested', 'not_interested', 'call_back_requested', 'already_has_solar', 'deal_won'] as const
export type CustomerResponse = (typeof CUSTOMER_RESPONSES)[number]

export const PROOF_STATUSES = ['verified', 'evidenced', 'logged', 'flagged'] as const
export type ProofStatus = (typeof PROOF_STATUSES)[number]

export const PROOF_FLAGS = [
  'never_left_app',
  'too_fast',
  'screenshot_reused',
  'screenshot_time_mismatch',
  'batch_logged',
  'off_duty',
  'outlier_no_answer',
  /** Agent closed the lead (lost / Dead / junk) — a manager must check it. */
  'lead_closed',
  /** Typed call length is much longer than the time away from the app. */
  'duration_mismatch',
  /** Random sample of normal attempts for the manager's call-back check. */
  'spot_check',
  /** "Could not call" logged again and again on the same lead. */
  'repeat_could_not_call',
] as const
export type ProofFlag = (typeof PROOF_FLAGS)[number]

/** A lead closed by an agent (won / lost / Dead) waits for a manager: won only counts in sales after approval. */
export const CLOSE_REVIEW_STATUSES = ['none', 'pending', 'approved', 'rejected'] as const
export type CloseReviewStatus = (typeof CLOSE_REVIEW_STATUSES)[number]

export const REVIEW_STATUSES = ['pending', 'reviewed', 'disputed'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

export const FOLLOW_UP_STATUSES = ['pending', 'done', 'missed', 'cancelled'] as const
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number]

export const ATTENDANCE_STATUSES = ['checked_in', 'on_break', 'checked_out'] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export const MESSAGE_DIRECTIONS = ['in', 'out'] as const
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number]

/** Who produced a WhatsApp message: the customer, the agent's phone app (echo), or the CRM (API). */
export const MESSAGE_SENDERS = ['customer', 'app', 'api'] as const
export type MessageSender = (typeof MESSAGE_SENDERS)[number]

export const MESSAGE_STATUSES = ['received', 'sent', 'delivered', 'read', 'failed'] as const
export type MessageStatus = (typeof MESSAGE_STATUSES)[number]

export const MESSAGE_TYPES = [
  'text',
  'image',
  'document',
  'audio',
  'video',
  'sticker',
  'location',
  'interactive',
  'template',
  'reaction',
  'system',
  'unsupported',
] as const
export type MessageType = (typeof MESSAGE_TYPES)[number]

export const DOCUMENT_OWNER_TYPES = ['lead', 'attempt', 'sale'] as const
export type DocumentOwnerType = (typeof DOCUMENT_OWNER_TYPES)[number]

export const DOCUMENT_CATEGORIES = [
  'attempt_screenshot',
  'site_photo',
  'layout_design',
  'net_metering',
  'electricity_bill',
  'cnic',
  'contract',
  'receipt',
  'installation_photo',
  'other',
] as const
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

export const ROOF_TYPES = ['rcc_slab', 'metal_sheet', 'tile', 'shingle', 'ground_mount', 'other'] as const
export type RoofType = (typeof ROOF_TYPES)[number]

export const SHADING_LEVELS = ['none', 'partial', 'heavy'] as const
export type ShadingLevel = (typeof SHADING_LEVELS)[number]

export const PROPERTY_TYPES = ['house', 'commercial', 'factory', 'farm', 'other'] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]

export const TRADING_CUSTOMER_TYPES = ['end_user', 'installer', 'dealer'] as const
export type TradingCustomerType = (typeof TRADING_CUSTOMER_TYPES)[number]

export const LOST_REASONS = ['price', 'competitor', 'not_interested', 'no_roof_space', 'financing', 'not_eligible', 'other'] as const
export type LostReason = (typeof LOST_REASONS)[number]

export const JOB_KINDS = ['manager_window_end', 'accept_due', 'contact_due', 'follow_up_due', 'follow_up_overdue', 'auto_checkout'] as const
export type JobKind = (typeof JOB_KINDS)[number]

export const JOB_STATUSES = ['pending', 'running', 'done', 'cancelled', 'failed'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const ACTIVITY_TYPES = [
  'lead_created',
  'lead_reinquiry',
  'assigned',
  'accepted',
  'reassigned',
  'stage_changed',
  'attempt_logged',
  'follow_up_scheduled',
  'follow_up_completed',
  'message_in',
  'message_out',
  'note_added',
  'document_added',
  'status_changed',
  'proof_reviewed',
  'visit_assigned',
  'visit_updated',
] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export const NOTIFICATION_TYPES = [
  'new_lead',
  'lead_unassigned',
  'lead_assigned',
  'lead_reassigned',
  'whatsapp_message',
  'not_accepted',
  'not_contacted',
  'follow_up_due',
  'follow_up_overdue',
  'lead_unreachable',
  'agent_auto_paused',
  'whatsapp_disconnected',
  'visit_assigned',
  'lead_closed',
  'auto_checked_out',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export const SLA_STATES = ['ok', 'due_soon', 'breached'] as const
export type SlaState = (typeof SLA_STATES)[number]

export const WHATSAPP_NUMBER_STATUSES = ['connected', 'pending', 'disconnected'] as const
export type WhatsAppNumberStatus = (typeof WHATSAPP_NUMBER_STATUSES)[number]

export const WHATSAPP_OWNER_TYPES = ['agent', 'department'] as const
export type WhatsAppOwnerType = (typeof WHATSAPP_OWNER_TYPES)[number]

export const INGEST_SOURCES = ['sheet', 'whatsapp', 'website'] as const
export type IngestSource = (typeof INGEST_SOURCES)[number]

/** Google Sheet rows already handled (by rowKey) — replaces the fragile row-count cursor. */
export const SHEET_ROW_STATUSES = ['ingested', 'skipped', 'failed'] as const
export type SheetRowStatus = (typeof SHEET_ROW_STATUSES)[number]

export const INGEST_STATUSES = ['received', 'processed', 'failed', 'ignored'] as const
export type IngestStatus = (typeof INGEST_STATUSES)[number]

export const AUDIT_ACTIONS = ['create', 'update', 'soft_delete', 'restore', 'export'] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const SETTING_KEYS = ['working_hours', 'holidays', 'sla_defaults', 'sheet_config', 'follow_up_cadence', 'routing', 'theme'] as const
export type SettingKey = (typeof SETTING_KEYS)[number]

/** Meta lead-form answers (the client's real form questions). */
export const SYSTEM_SIZE_RANGES = ['5_to_15_kw', '15_to_25_kw', '25_to_40_kw', 'more_than_40_kw'] as const
export type SystemSizeRange = (typeof SYSTEM_SIZE_RANGES)[number]

export const INSTALL_LOCATIONS = ['home', 'commercial', 'industry'] as const
export type InstallLocation = (typeof INSTALL_LOCATIONS)[number]

export const INSTALL_TIMELINES = ['within_7_to_15_days', 'within_a_month', 'later'] as const
export type InstallTimeline = (typeof INSTALL_TIMELINES)[number]

/** Site visits by outdoor (field) agents — the Excel "Visits" tab. */
export const VISIT_STATUSES = ['unassigned', 'assigned', 'rescheduled', 'completed', 'interested', 'not_interested', 'cancelled'] as const
export type VisitStatus = (typeof VISIT_STATUSES)[number]
/** Visits that still count toward a field agent's kW load. */
export const ACTIVE_VISIT_STATUSES: readonly VisitStatus[] = ['assigned', 'rescheduled']

/** CRM fields a Google Sheet column can map to. Unmapped columns are kept in lead.extra (dynamic columns). */
export const SHEET_LEAD_FIELDS = [
  'metaLeadId',
  'submittedAt',
  'name',
  'phone',
  'altPhone',
  'whatsapp',
  'email',
  'city',
  'area',
  'address',
  'department',
  'campaignId',
  'campaignName',
  'adsetId',
  'adsetName',
  'adId',
  'adName',
  'formId',
  'formName',
  'platform',
  'isOrganic',
  'monthlyBillPkr',
  'monthlyUnits',
  'targetKw',
  'propertyType',
  'notes',
  'agentName',
  'status',
  'systemSizeRange',
  'installLocation',
  'installTimeline',
] as const
export type SheetLeadField = (typeof SHEET_LEAD_FIELDS)[number]

/** Dashboard KPI tiles — labels are the PDF's exact wording (§4, §8). */
export const KPI_KEYS = [
  'totalLeads',
  'newUnassigned',
  'assignedSigned',
  'calledNotCalled',
  'interestedFollowUp',
  'quotationSent',
  'inProcess',
  'wonSales',
  'lost',
  'salesValue',
  'commission',
] as const
export type KpiKey = (typeof KPI_KEYS)[number]

/** Visual tones for statuses. Colours for each tone live in src/styles/theme.css. */
export const TONES = ['neutral', 'brand', 'info', 'success', 'warning', 'danger', 'trading', 'installation'] as const
export type Tone = (typeof TONES)[number]

// ── Defaults (typed, so models and services never type a free-form literal) ──
export const DEFAULT_ROLE: Role = 'agent'
export const DEFAULT_STAGE: Stage = 'new'
export const DEFAULT_LEAD_STATUS: LeadStatus = 'open'
export const DEFAULT_ASSIGNMENT_STATE: AssignmentState = 'unassigned'
export const DEFAULT_PROOF_STATUS: ProofStatus = 'logged'
export const DEFAULT_REVIEW_STATUS: ReviewStatus = 'pending'
export const DEFAULT_FOLLOW_UP_STATUS: FollowUpStatus = 'pending'
export const DEFAULT_JOB_STATUS: JobStatus = 'pending'
export const DEFAULT_CONTACT_TYPE: ContactType = 'individual'
export const DEFAULT_INGEST_STATUS: IngestStatus = 'received'

export const PK_TIMEZONE = 'Asia/Karachi'
export const MAX_FOLLOW_UPS = 3
/** Client's cadence (Excel READ ME): 1st call → +1 day → +3 days → Dead after 3 no-answers. */
export const FOLLOW_UP_GAP_DAYS = [0, 1, 3] as const
export const SESSION_DAYS = 30

export const TEAM_DEFAULTS = {
  managerWindowMin: 5,
  acceptWithinMin: 5,
  contactWithinMin: 15,
  maxPendingAccept: 3,
  autoMoveOnAcceptTimeout: false,
  paused: false,
} as const
