import 'server-only'
import { Types, type PipelineStage } from 'mongoose'
import { pktParts } from '@/lib/dates-pkt'
import { connectDb } from '@/server/db/connection'
import { AuditLog, ContactAttempt, DocumentFile, Lead, User } from '@/server/db/models'
import type { SessionUser } from '@/server/auth/session'
import { isAdminRole } from '@/server/auth/scope'
import { deletePrivateImages, isCloudinaryConfigured } from '@/server/services/cloudinary'
import { oid, UserError } from '@/server/services/common'

/** Proof files = screenshots agents attach to calls/chats. Only these are measured and cleared (never users, leads or call records). */
export const PROOF_RANGES = ['this_week', 'this_month', 'last_month', 'older_90', 'custom'] as const
export type ProofRange = (typeof PROOF_RANGES)[number]

const DAY = 86_400_000
/** Start of a Pakistan calendar day (00:00 PKT) as a UTC instant. */
const pktMidnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d) - 5 * 3_600_000)

/** [from, to) in UTC for a named range, in Pakistan time. Custom dates are "YYYY-MM-DD" (both days included). */
export function proofRangeDates(range: ProofRange, now = new Date(), custom?: { from?: string; to?: string }): { from: Date; to: Date } {
  const p = pktParts(now)
  const today = pktMidnight(p.year, p.month, p.day)
  switch (range) {
    case 'this_week': {
      const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() // 0 = Sunday
      return { from: new Date(today.getTime() - ((weekday + 6) % 7) * DAY), to: now }
    }
    case 'this_month':
      return { from: pktMidnight(p.year, p.month, 1), to: now }
    case 'last_month':
      return { from: p.month === 1 ? pktMidnight(p.year - 1, 12, 1) : pktMidnight(p.year, p.month - 1, 1), to: pktMidnight(p.year, p.month, 1) }
    case 'older_90':
      return { from: new Date(0), to: new Date(today.getTime() - 90 * DAY) }
    case 'custom': {
      const parse = (v?: string) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '')
        return m ? pktMidnight(Number(m[1]), Number(m[2]), Number(m[3])) : null
      }
      const from = parse(custom?.from)
      const toDay = parse(custom?.to)
      if (!from || !toDay) throw new UserError('Pick both dates for the range')
      if (toDay < from) throw new UserError('The end date is before the start date')
      return { from, to: new Date(toDay.getTime() + DAY) }
    }
  }
}

/** Proof documents in the user's scope (managers: their department's leads), with their call attempt attached. */
function scopedPipeline(user: SessionUser, match: Record<string, unknown>): PipelineStage[] {
  const stages: PipelineStage[] = [
    { $match: { ownerType: 'attempt', deletedAt: null, ...match } },
    { $lookup: { from: ContactAttempt.collection.name, localField: 'ownerId', foreignField: '_id', as: 'attempt' } },
    { $unwind: { path: '$attempt', preserveNullAndEmptyArrays: true } },
  ]
  if (!isAdminRole(user.role)) {
    stages.push(
      { $lookup: { from: Lead.collection.name, localField: 'attempt.leadId', foreignField: '_id', as: 'lead' } },
      { $unwind: '$lead' },
      { $match: { 'lead.departmentId': user.departmentId ? new Types.ObjectId(user.departmentId) : null } },
    )
  }
  return stages
}

/** Still needed by the manager: flagged / closed / spot-check proofs not reviewed yet. */
const pendingReview = {
  'attempt.review.status': 'pending',
  $or: [{ 'attempt.proofStatus': 'flagged' }, { 'attempt.flags': { $in: ['lead_closed', 'spot_check'] } }],
}

export interface StorageBucket {
  count: number
  bytes: number
}

export async function proofStorageStats(user: SessionUser) {
  await connectDb()
  const now = new Date()
  const week = proofRangeDates('this_week', now)
  const month = proofRangeDates('this_month', now)
  const old = proofRangeDates('older_90', now)
  const sum = { $group: { _id: null, count: { $sum: 1 }, bytes: { $sum: '$size' } } }
  const [row] = await DocumentFile.aggregate<Record<string, { count: number; bytes: number }[]>>([
    ...scopedPipeline(user, {}),
    {
      $facet: {
        all: [sum],
        week: [{ $match: { createdAt: { $gte: week.from } } }, sum],
        month: [{ $match: { createdAt: { $gte: month.from } } }, sum],
        older90: [{ $match: { createdAt: { $lt: old.to } } }, sum],
        pending: [{ $match: pendingReview }, sum],
        byAgent: [{ $group: { _id: '$uploadedBy', count: { $sum: 1 }, bytes: { $sum: '$size' } } }, { $sort: { bytes: -1 } }, { $limit: 20 }],
      },
    },
  ])
  const pick = (k: string): StorageBucket => ({ count: row?.[k]?.[0]?.count ?? 0, bytes: row?.[k]?.[0]?.bytes ?? 0 })
  const byAgentRows = (row?.byAgent ?? []) as unknown as { _id: Types.ObjectId; count: number; bytes: number }[]
  const names = new Map((await User.find({ _id: { $in: byAgentRows.map((r) => r._id) } }).select('name').lean()).map((u) => [String(u._id), u.name]))
  return {
    all: pick('all'),
    week: pick('week'),
    month: pick('month'),
    older90: pick('older90'),
    pendingReview: pick('pending'),
    byAgent: byAgentRows.map((r) => ({ name: names.get(String(r._id)) ?? '—', count: r.count, bytes: r.bytes })),
  }
}

/**
 * Preview or clear proof files in a date range. Files are deleted from Cloudinary FIRST; only then marked cleared
 * (if Cloudinary refuses, nothing changes). Call records, results and notes stay.
 */
export async function clearProofs(user: SessionUser, opts: { range: ProofRange; from?: string; to?: string; keepPendingReview: boolean; dryRun: boolean }): Promise<{ count: number; bytes: number; from: Date; to: Date }> {
  await connectDb()
  const { from, to } = proofRangeDates(opts.range, new Date(), { from: opts.from, to: opts.to })
  const pipeline: PipelineStage[] = [...scopedPipeline(user, { createdAt: { $gte: from, $lt: to } })]
  if (opts.keepPendingReview) pipeline.push({ $match: { $nor: [pendingReview] } })
  pipeline.push({ $project: { _id: 1, storageKey: 1, size: 1 } })
  const docs = await DocumentFile.aggregate<{ _id: Types.ObjectId; storageKey: string; size: number }>(pipeline)
  const bytes = docs.reduce((n, d) => n + (d.size ?? 0), 0)
  if (opts.dryRun || !docs.length) return { count: docs.length, bytes, from, to }
  if (isCloudinaryConfigured()) await deletePrivateImages(docs.map((d) => d.storageKey))
  await DocumentFile.updateMany({ _id: { $in: docs.map((d) => d._id) } }, { $set: { deletedAt: new Date(), clearedBy: oid(user.id) } })
  await AuditLog.create({ entity: 'storage', entityId: null, action: 'soft_delete', after: { cleared: docs.length, bytes, range: opts.range, from, to, keptPendingReview: opts.keepPendingReview }, actorId: oid(user.id) })
  return { count: docs.length, bytes, from, to }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}
