import 'server-only'
import { connectDb } from '@/server/db/connection'
import { RateLimit } from '@/server/db/models'

/**
 * Fixed-window counter in Mongo (free, works across Vercel instances).
 * hit() counts one attempt and says whether the key is now over the limit.
 */
export async function hit(key: string, limit: number, windowMs: number): Promise<{ blocked: boolean; retryAfterMin: number }> {
  await connectDb()
  const now = new Date()
  // Start a fresh window when the old one has ended (the TTL index may not have removed it yet).
  await RateLimit.deleteOne({ key, resetAt: { $lte: now } })
  const row = await RateLimit.findOneAndUpdate(
    { key },
    { $inc: { count: 1 }, $setOnInsert: { resetAt: new Date(now.getTime() + windowMs) } },
    { upsert: true, returnDocument: 'after' },
  ).lean()
  const retryAfterMin = Math.max(1, Math.ceil(((row?.resetAt?.getTime() ?? now.getTime()) - now.getTime()) / 60_000))
  return { blocked: (row?.count ?? 0) > limit, retryAfterMin }
}

/** Is the key already over the limit (without counting a new attempt)? */
export async function isBlocked(key: string, limit: number): Promise<{ blocked: boolean; retryAfterMin: number }> {
  await connectDb()
  const row = await RateLimit.findOne({ key, resetAt: { $gt: new Date() } }).lean()
  const retryAfterMin = row ? Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 60_000)) : 0
  return { blocked: !!row && row.count >= limit, retryAfterMin }
}

export async function clear(key: string): Promise<void> {
  await connectDb()
  await RateLimit.deleteOne({ key })
}
