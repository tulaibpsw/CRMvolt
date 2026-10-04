/**
 * UI-facing data shapes. Services map Mongoose documents to these; components only ever receive these
 * (plain, serialisable — dates are ISO strings). Keeps components independent of the database.
 */
import type {
  AssignmentState,
  AttemptChannel,
  AttendanceStatus,
  CallResult,
  CustomerResponse,
  Department,
  FollowUpStatus,
  KpiKey,
  LeadChannel,
  LeadStatus,
  MessageDirection,
  MessageSender,
  MessageStatus,
  ProofFlag,
  ProofStatus,
  ReviewStatus,
  Role,
  Stage,
} from '@/domain/constants'

export interface AgentRef {
  id: string
  name: string
}

export interface LeadSummary {
  id: string
  leadNo: string
  name: string
  /** E.164 */
  phone: string
  /** Show a masked number (agents, when masking is on). */
  maskPhone?: boolean
  department: Department
  stage: Stage
  status: LeadStatus
  channel: LeadChannel
  /** Campaign / ad / form name or WhatsApp-ad headline. */
  sourceDetail?: string
  agent?: AgentRef
  assignmentState: AssignmentState
  attemptCount: number
  nextFollowUpAt?: string
  /** Accept or first-contact deadline while one is running. */
  sla?: { startedAt: string; deadline: string }
  receivedAt: string
}

export interface LeadDetail extends LeadSummary {
  altPhones: string[]
  city?: string
  area?: string
  campaignName?: string
  adName?: string
  formName?: string
  ctwaHeadline?: string
}

export interface AttemptView {
  id: string
  channel: AttemptChannel
  followUpNo: number
  agent: AgentRef
  tappedAt: string
  leftAt?: string
  returnedAt?: string
  loggedAt?: string
  result?: CallResult
  response?: CustomerResponse
  remarks?: string
  screenshotUrl?: string
  proofStatus: ProofStatus
  flags: ProofFlag[]
  reviewStatus: ReviewStatus
}

export interface FollowUpView {
  id: string
  leadId: string
  leadName: string
  number: number
  dueAt: string
  status: FollowUpStatus
  isOverdue: boolean
}

export interface TeamMemberView {
  id: string
  name: string
  role: Role
  attendance: AttendanceStatus
  since?: string
  openLeads: number
  pendingAccept: number
  lastActionAt?: string
}

export interface MessageView {
  id: string
  direction: MessageDirection
  sentFrom: MessageSender
  text: string
  at: string
  status: MessageStatus
  senderName?: string
}

export interface KpiItem {
  key: KpiKey
  value: string | number
  hint?: string
  comingIn?: number
}
