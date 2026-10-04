import mongoose, { type ClientSession } from 'mongoose'

/**
 * Run several writes as one unit. The driver retries on transient errors, so `fn` may run more than once:
 * keep side effects (push notifications, HTTP calls) OUTSIDE and do them after this resolves.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession()
  try {
    let result!: T
    await session.withTransaction(async () => {
      result = await fn(session)
    })
    return result
  } finally {
    await session.endSession()
  }
}
