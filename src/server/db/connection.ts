import 'server-only'
import mongoose from 'mongoose'
import { attachDatabasePool } from '@vercel/functions'
import { requireMongoUri } from '@/lib/env'

declare global {
  var __voltonMongoose: Promise<typeof mongoose> | undefined
}

/**
 * One cached connection per server instance (survives hot reload and warm serverless invocations).
 * attachDatabasePool lets Vercel close idle sockets before a function is suspended (no-op elsewhere).
 */
export function connectDb(uri: string = requireMongoUri()): Promise<typeof mongoose> {
  if (!globalThis.__voltonMongoose) {
    globalThis.__voltonMongoose = mongoose
      .connect(uri, { maxPoolSize: 10, maxIdleTimeMS: 5_000, serverSelectionTimeoutMS: 10_000 })
      .then((connected) => {
        attachDatabasePool(connected.connection.getClient())
        return connected
      })
      .catch((error: unknown) => {
        globalThis.__voltonMongoose = undefined
        throw error
      })
  }
  return globalThis.__voltonMongoose
}
