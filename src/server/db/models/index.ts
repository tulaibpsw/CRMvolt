export * from '@/server/db/models/org'
export * from '@/server/db/models/leads'
export * from '@/server/db/models/system'

import { Attendance, Department, Session, Team, User } from '@/server/db/models/org'
import { Activity, Contact, ContactAttempt, FollowUp, Lead, LeadAssignment, Visit } from '@/server/db/models/leads'
import {
  AuditLog,
  Counter,
  DocumentFile,
  IngestEvent,
  Job,
  Lock,
  Message,
  Notification,
  PushSubscription,
  Setting,
  WhatsAppNumber,
} from '@/server/db/models/system'

/** Every model — used by index sync and tests. */
export const ALL_MODELS = [
  Department,
  Team,
  User,
  Attendance,
  Session,
  Visit,
  Contact,
  Lead,
  LeadAssignment,
  ContactAttempt,
  FollowUp,
  Activity,
  AuditLog,
  Job,
  Lock,
  Notification,
  PushSubscription,
  DocumentFile,
  WhatsAppNumber,
  Message,
  Setting,
  IngestEvent,
  Counter,
] as const
