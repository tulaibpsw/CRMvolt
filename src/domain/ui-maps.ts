/**
 * Enum value → { label, tone, icon }. The ONLY place a status gets its colour (tone) or icon.
 * StatusBadge renders these. To recolour a status, change its tone here; to recolour a tone, edit theme.css.
 * This file may reference lucide icons as data, but never imports from src/components, src/app or src/server.
 */
import {
  Ban,
  BadgeCheck,
  Check,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  ClipboardList,
  Clock,
  Coffee,
  FileImage,
  FileSpreadsheet,
  FileText,
  Flag,
  Globe,
  Handshake,
  Hourglass,
  Inbox,
  LogIn,
  LogOut,
  MapPin,
  Megaphone,
  MessageCircle,
  PenLine,
  Phone,
  PhoneCall,
  PhoneMissed,
  PhoneOff,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Timer,
  Trophy,
  Upload,
  User,
  UserCheck,
  UserPlus,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import * as C from '@/domain/constants'
import type { Tone } from '@/domain/constants'
import { en } from '@/i18n/en'

export interface StatusMeta {
  label: string
  tone: Tone
  icon?: LucideIcon
}

type MetaMap<T extends string> = Record<T, StatusMeta>

export const ROLE_META: MetaMap<C.Role> = {
  admin: { label: en.role.admin, tone: 'brand', icon: ShieldCheck },
  manager: { label: en.role.manager, tone: 'info', icon: UserCheck },
  agent: { label: en.role.agent, tone: 'neutral', icon: User },
  field_agent: { label: en.role.field_agent, tone: 'installation', icon: MapPin },
}

export const DEPARTMENT_META: MetaMap<C.Department> = {
  TRADING: { label: en.department.TRADING, tone: 'trading', icon: Store },
  INSTALLATION: { label: en.department.INSTALLATION, tone: 'installation', icon: Wrench },
}

export const LEAD_STATUS_META: MetaMap<C.LeadStatus> = {
  open: { label: en.leadStatus.open, tone: 'info', icon: CircleDashed },
  won: { label: en.leadStatus.won, tone: 'success', icon: Trophy },
  lost: { label: en.leadStatus.lost, tone: 'danger', icon: CircleX },
  unreachable: { label: en.leadStatus.unreachable, tone: 'warning', icon: PhoneOff },
  junk: { label: en.leadStatus.junk, tone: 'neutral', icon: Ban },
}

export const STAGE_META: MetaMap<C.Stage> = {
  new: { label: en.stage.new, tone: 'info', icon: Sparkles },
  contacted: { label: en.stage.contacted, tone: 'neutral', icon: PhoneCall },
  interested: { label: en.stage.interested, tone: 'brand', icon: Star },
  requirement_collected: { label: en.stage.requirement_collected, tone: 'info', icon: ClipboardList },
  site_survey: { label: en.stage.site_survey, tone: 'installation', icon: MapPin },
  quotation_pending: { label: en.stage.quotation_pending, tone: 'warning', icon: Hourglass },
  quotation_sent: { label: en.stage.quotation_sent, tone: 'info', icon: FileText },
  negotiation: { label: en.stage.negotiation, tone: 'brand', icon: Handshake },
  won: { label: en.stage.won, tone: 'success', icon: Trophy },
  lost: { label: en.stage.lost, tone: 'danger', icon: CircleX },
}

export const CHANNEL_META: MetaMap<C.LeadChannel> = {
  sheet: { label: en.channel.sheet, tone: 'neutral', icon: FileSpreadsheet },
  whatsapp: { label: en.channel.whatsapp, tone: 'success', icon: MessageCircle },
  website: { label: en.channel.website, tone: 'info', icon: Globe },
  manual: { label: en.channel.manual, tone: 'neutral', icon: PenLine },
  csv_import: { label: en.channel.csv_import, tone: 'neutral', icon: Upload },
  meta_webhook: { label: en.channel.meta_webhook, tone: 'info', icon: Megaphone },
}

export const ASSIGNMENT_STATE_META: MetaMap<C.AssignmentState> = {
  unassigned: { label: en.assignmentState.unassigned, tone: 'warning', icon: Inbox },
  manager_window: { label: en.assignmentState.manager_window, tone: 'neutral', icon: Hourglass },
  waiting: { label: en.assignmentState.waiting, tone: 'warning', icon: Clock },
  assigning: { label: en.assignmentState.assigning, tone: 'neutral', icon: UserPlus },
  assigned: { label: en.assignmentState.assigned, tone: 'brand', icon: Timer },
  accepted: { label: en.assignmentState.accepted, tone: 'success', icon: UserCheck },
}

export const ATTEMPT_CHANNEL_META: MetaMap<C.AttemptChannel> = {
  whatsapp_chat: { label: en.attemptChannel.whatsapp_chat, tone: 'success', icon: MessageCircle },
  whatsapp_call: { label: en.attemptChannel.whatsapp_call, tone: 'success', icon: PhoneCall },
  phone_call: { label: en.attemptChannel.phone_call, tone: 'info', icon: Phone },
}

export const CALL_RESULT_META: MetaMap<C.CallResult> = {
  connected: { label: en.callResult.connected, tone: 'success', icon: CircleCheck },
  no_answer: { label: en.callResult.no_answer, tone: 'warning', icon: PhoneMissed },
  busy: { label: en.callResult.busy, tone: 'warning', icon: PhoneOff },
  number_off: { label: en.callResult.number_off, tone: 'neutral', icon: PhoneOff },
  wrong_number: { label: en.callResult.wrong_number, tone: 'danger', icon: Ban },
  could_not_call: { label: en.callResult.could_not_call, tone: 'neutral', icon: Clock },
}

export const CUSTOMER_RESPONSE_META: MetaMap<C.CustomerResponse> = {
  interested: { label: en.customerResponse.interested, tone: 'success', icon: Star },
  not_interested: { label: en.customerResponse.not_interested, tone: 'danger', icon: CircleX },
  call_back_requested: { label: en.customerResponse.call_back_requested, tone: 'info', icon: PhoneCall },
  already_has_solar: { label: en.customerResponse.already_has_solar, tone: 'neutral', icon: Ban },
}

export const PROOF_STATUS_META: MetaMap<C.ProofStatus> = {
  verified: { label: en.proofStatus.verified, tone: 'success', icon: BadgeCheck },
  evidenced: { label: en.proofStatus.evidenced, tone: 'info', icon: FileImage },
  logged: { label: en.proofStatus.logged, tone: 'neutral', icon: PenLine },
  flagged: { label: en.proofStatus.flagged, tone: 'danger', icon: Flag },
}

export const PROOF_FLAG_META: MetaMap<C.ProofFlag> = {
  never_left_app: { label: en.proofFlag.never_left_app, tone: 'danger', icon: Flag },
  too_fast: { label: en.proofFlag.too_fast, tone: 'warning', icon: Timer },
  screenshot_reused: { label: en.proofFlag.screenshot_reused, tone: 'danger', icon: FileImage },
  screenshot_time_mismatch: { label: en.proofFlag.screenshot_time_mismatch, tone: 'warning', icon: Clock },
  batch_logged: { label: en.proofFlag.batch_logged, tone: 'warning', icon: ClipboardList },
  off_duty: { label: en.proofFlag.off_duty, tone: 'warning', icon: LogOut },
  outlier_no_answer: { label: en.proofFlag.outlier_no_answer, tone: 'warning', icon: PhoneMissed },
}

export const REVIEW_STATUS_META: MetaMap<C.ReviewStatus> = {
  pending: { label: en.reviewStatus.pending, tone: 'neutral', icon: CircleDashed },
  reviewed: { label: en.reviewStatus.reviewed, tone: 'success', icon: CircleCheck },
  disputed: { label: en.reviewStatus.disputed, tone: 'danger', icon: CircleAlert },
}

export const FOLLOW_UP_STATUS_META: MetaMap<C.FollowUpStatus> = {
  pending: { label: en.followUpStatus.pending, tone: 'info', icon: Clock },
  done: { label: en.followUpStatus.done, tone: 'success', icon: Check },
  missed: { label: en.followUpStatus.missed, tone: 'danger', icon: CircleAlert },
  cancelled: { label: en.followUpStatus.cancelled, tone: 'neutral', icon: CircleX },
}

export const ATTENDANCE_STATUS_META: MetaMap<C.AttendanceStatus> = {
  checked_in: { label: en.attendanceStatus.checked_in, tone: 'success', icon: LogIn },
  on_break: { label: en.attendanceStatus.on_break, tone: 'warning', icon: Coffee },
  checked_out: { label: en.attendanceStatus.checked_out, tone: 'neutral', icon: LogOut },
}

export const MESSAGE_STATUS_META: MetaMap<C.MessageStatus> = {
  received: { label: en.messageStatus.received, tone: 'neutral', icon: Inbox },
  sent: { label: en.messageStatus.sent, tone: 'neutral', icon: Check },
  delivered: { label: en.messageStatus.delivered, tone: 'neutral', icon: CheckCheck },
  read: { label: en.messageStatus.read, tone: 'info', icon: CheckCheck },
  failed: { label: en.messageStatus.failed, tone: 'danger', icon: CircleAlert },
}

export const SLA_STATE_META: MetaMap<C.SlaState> = {
  ok: { label: en.slaState.ok, tone: 'success', icon: Timer },
  due_soon: { label: en.slaState.due_soon, tone: 'warning', icon: Hourglass },
  breached: { label: en.slaState.breached, tone: 'danger', icon: CircleAlert },
}

export const ACTIVITY_TYPE_META: MetaMap<C.ActivityType> = {
  lead_created: { label: en.activityType.lead_created, tone: 'info', icon: Sparkles },
  lead_reinquiry: { label: en.activityType.lead_reinquiry, tone: 'brand', icon: Sparkles },
  assigned: { label: en.activityType.assigned, tone: 'neutral', icon: UserPlus },
  accepted: { label: en.activityType.accepted, tone: 'success', icon: UserCheck },
  reassigned: { label: en.activityType.reassigned, tone: 'warning', icon: UserPlus },
  stage_changed: { label: en.activityType.stage_changed, tone: 'info', icon: ClipboardList },
  attempt_logged: { label: en.activityType.attempt_logged, tone: 'neutral', icon: PhoneCall },
  follow_up_scheduled: { label: en.activityType.follow_up_scheduled, tone: 'info', icon: Clock },
  follow_up_completed: { label: en.activityType.follow_up_completed, tone: 'success', icon: Check },
  message_in: { label: en.activityType.message_in, tone: 'success', icon: MessageCircle },
  message_out: { label: en.activityType.message_out, tone: 'success', icon: MessageCircle },
  note_added: { label: en.activityType.note_added, tone: 'neutral', icon: PenLine },
  document_added: { label: en.activityType.document_added, tone: 'neutral', icon: FileImage },
  status_changed: { label: en.activityType.status_changed, tone: 'brand', icon: Flag },
  proof_reviewed: { label: en.activityType.proof_reviewed, tone: 'info', icon: ShieldCheck },
  visit_assigned: { label: en.activityType.visit_assigned, tone: 'installation', icon: MapPin },
  visit_updated: { label: en.activityType.visit_updated, tone: 'installation', icon: MapPin },
}

export const VISIT_STATUS_META: MetaMap<C.VisitStatus> = {
  unassigned: { label: en.visitStatus.unassigned, tone: 'warning', icon: Inbox },
  assigned: { label: en.visitStatus.assigned, tone: 'info', icon: MapPin },
  rescheduled: { label: en.visitStatus.rescheduled, tone: 'warning', icon: Clock },
  completed: { label: en.visitStatus.completed, tone: 'neutral', icon: Check },
  interested: { label: en.visitStatus.interested, tone: 'success', icon: Star },
  not_interested: { label: en.visitStatus.not_interested, tone: 'danger', icon: CircleX },
  cancelled: { label: en.visitStatus.cancelled, tone: 'neutral', icon: Ban },
}

export const WHATSAPP_NUMBER_STATUS_META: MetaMap<C.WhatsAppNumberStatus> = {
  connected: { label: en.whatsappNumberStatus.connected, tone: 'success', icon: CircleCheck },
  pending: { label: en.whatsappNumberStatus.pending, tone: 'warning', icon: Hourglass },
  disconnected: { label: en.whatsappNumberStatus.disconnected, tone: 'danger', icon: CircleAlert },
}

/** Enums shown as coloured badges: [values, meta map]. Keyed by the constant's name. */
export const ENUM_UI_MAPS = {
  ROLES: [C.ROLES, ROLE_META],
  DEPARTMENTS: [C.DEPARTMENTS, DEPARTMENT_META],
  LEAD_STATUSES: [C.LEAD_STATUSES, LEAD_STATUS_META],
  STAGES: [C.STAGES, STAGE_META],
  LEAD_CHANNELS: [C.LEAD_CHANNELS, CHANNEL_META],
  ASSIGNMENT_STATES: [C.ASSIGNMENT_STATES, ASSIGNMENT_STATE_META],
  ATTEMPT_CHANNELS: [C.ATTEMPT_CHANNELS, ATTEMPT_CHANNEL_META],
  CALL_RESULTS: [C.CALL_RESULTS, CALL_RESULT_META],
  CUSTOMER_RESPONSES: [C.CUSTOMER_RESPONSES, CUSTOMER_RESPONSE_META],
  PROOF_STATUSES: [C.PROOF_STATUSES, PROOF_STATUS_META],
  PROOF_FLAGS: [C.PROOF_FLAGS, PROOF_FLAG_META],
  REVIEW_STATUSES: [C.REVIEW_STATUSES, REVIEW_STATUS_META],
  FOLLOW_UP_STATUSES: [C.FOLLOW_UP_STATUSES, FOLLOW_UP_STATUS_META],
  ATTENDANCE_STATUSES: [C.ATTENDANCE_STATUSES, ATTENDANCE_STATUS_META],
  MESSAGE_STATUSES: [C.MESSAGE_STATUSES, MESSAGE_STATUS_META],
  SLA_STATES: [C.SLA_STATES, SLA_STATE_META],
  ACTIVITY_TYPES: [C.ACTIVITY_TYPES, ACTIVITY_TYPE_META],
  WHATSAPP_NUMBER_STATUSES: [C.WHATSAPP_NUMBER_STATUSES, WHATSAPP_NUMBER_STATUS_META],
  VISIT_STATUSES: [C.VISIT_STATUSES, VISIT_STATUS_META],
} as const satisfies Record<string, readonly [readonly string[], Record<string, StatusMeta>]>

/** Enums shown as plain text (selects, tables): [values, labels]. */
export const LABEL_ONLY_ENUMS = {
  AD_PLATFORMS: [C.AD_PLATFORMS, en.adPlatform],
  CONTACT_TYPES: [C.CONTACT_TYPES, en.contactType],
  ASSIGNMENT_METHODS: [C.ASSIGNMENT_METHODS, en.assignmentMethod],
  MESSAGE_SENDERS: [C.MESSAGE_SENDERS, en.messageSender],
  DOCUMENT_CATEGORIES: [C.DOCUMENT_CATEGORIES, en.documentCategory],
  ROOF_TYPES: [C.ROOF_TYPES, en.roofType],
  SHADING_LEVELS: [C.SHADING_LEVELS, en.shading],
  PROPERTY_TYPES: [C.PROPERTY_TYPES, en.propertyType],
  TRADING_CUSTOMER_TYPES: [C.TRADING_CUSTOMER_TYPES, en.tradingCustomerType],
  LOST_REASONS: [C.LOST_REASONS, en.lostReason],
  NOTIFICATION_TYPES: [C.NOTIFICATION_TYPES, en.notificationType],
  AUDIT_ACTIONS: [C.AUDIT_ACTIONS, en.auditAction],
  KPI_KEYS: [C.KPI_KEYS, en.kpi],
  SHEET_LEAD_FIELDS: [C.SHEET_LEAD_FIELDS, en.sheetField],
  SYSTEM_SIZE_RANGES: [C.SYSTEM_SIZE_RANGES, en.systemSizeRange],
  INSTALL_LOCATIONS: [C.INSTALL_LOCATIONS, en.installLocation],
  INSTALL_TIMELINES: [C.INSTALL_TIMELINES, en.installTimeline],
} as const satisfies Record<string, readonly [readonly string[], Record<string, string>]>

/** Enums never shown to users. */
export const INTERNAL_ENUMS = [
  'MESSAGE_DIRECTIONS',
  'ACTIVE_VISIT_STATUSES',
  'FOLLOW_UP_GAP_DAYS',
  'MESSAGE_TYPES',
  'DOCUMENT_OWNER_TYPES',
  'JOB_KINDS',
  'JOB_STATUSES',
  'WHATSAPP_OWNER_TYPES',
  'INGEST_SOURCES',
  'INGEST_STATUSES',
  'SETTING_KEYS',
  'TONES',
] as const

/** Build <select> options from a label-only enum, in definition order. */
export function optionsFor<T extends string>(values: readonly T[], labels: Record<T, string>) {
  return values.map((value) => ({ value, label: labels[value] }))
}
