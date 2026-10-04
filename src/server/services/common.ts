import 'server-only'
import { Types, type ClientSession } from 'mongoose'
import type { ActivityType, JobKind, NotificationType } from '@/domain/constants'
import { Activity, Job, Notification } from '@/server/db/models'

export const oid = (id: string | Types.ObjectId) => (typeof id === 'string' ? new Types.ObjectId(id) : id)
export const isDuplicateKey = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && (error as { code: number }).code === 11000

/** Append to the lead timeline (insert-only). */
export async function logActivity(
  leadId: Types.ObjectId | string,
  type: ActivityType,
  actorId: Types.ObjectId | string | null,
  data: Record<string, unknown> = {},
  session?: ClientSession,
) {
  await Activity.create([{ leadId: oid(leadId), type, actorId: actorId ? oid(actorId) : null, at: new Date(), data }], { session })
}

export interface NotifyInput {
  userIds: (Types.ObjectId | string)[]
  type: NotificationType
  title: string
  body?: string
  link?: string
  /** Base key; the user id is appended so each person gets the alert exactly once. */
  dedupeKey: string
}

/** In-app notifications, sent exactly once per (dedupeKey, user). Call AFTER a transaction commits. */
export async function notify({ userIds, type, title, body = '', link, dedupeKey }: NotifyInput): Promise<void> {
  const unique = [...new Set(userIds.map(String))]
  if (unique.length === 0) return
  const docs = unique.map((userId) => ({ userId: oid(userId), type, title, body, link: link ?? null, dedupeKey: `${dedupeKey}:${userId}` }))
  try {
    await Notification.insertMany(docs, { ordered: false })
  } catch (error) {
    if (!isDuplicateKey(error) && !(error as { writeErrors?: unknown[] }).writeErrors) throw error
  }
}

/** Schedule a timer for the cron tick. Same dedupeKey twice = no-op. */
export async function scheduleJob(
  kind: JobKind,
  dueAt: Date,
  dedupeKey: string,
  refs: { leadId?: Types.ObjectId | string; assignmentId?: Types.ObjectId | string; userId?: Types.ObjectId | string } = {},
): Promise<void> {
  try {
    await Job.create({
      kind,
      dueAt,
      dedupeKey,
      leadId: refs.leadId ? oid(refs.leadId) : null,
      assignmentId: refs.assignmentId ? oid(refs.assignmentId) : null,
      userId: refs.userId ? oid(refs.userId) : null,
    })
  } catch (error) {
    if (!isDuplicateKey(error)) throw error
  }
}

export async function cancelJobs(filter: Record<string, unknown>): Promise<void> {
  await Job.updateMany({ ...filter, status: 'pending' }, { status: 'cancelled' })
}

/** Action result shape for useActionState forms. */
export type ActionState = { ok: boolean; message?: string; fieldErrors?: Record<string, string> } | null

export function errorState(error: unknown): ActionState {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues: { path: PropertyKey[]; message: string }[] }).issues
    return { ok: false, message: issues[0]?.message, fieldErrors: Object.fromEntries(issues.map((i) => [String(i.path[0] ?? 'form'), i.message])) }
  }
  return { ok: false, message: error instanceof Error ? error.message : 'Something went wrong' }
}
