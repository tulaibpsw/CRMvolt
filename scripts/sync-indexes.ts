/** npm run db:indexes — make the database indexes match the Mongoose schemas (the schemas are the source of truth). */
import mongoose from 'mongoose'
import { connectDb } from '@/server/db/connection'
import { ALL_MODELS } from '@/server/db/models'

async function main() {
  await connectDb()
  for (const model of ALL_MODELS) {
    const dropped = await model.syncIndexes()
    console.log(`${model.collection.collectionName}: in sync${dropped.length ? ` (dropped ${dropped.join(', ')})` : ''}`)
  }
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    await mongoose.disconnect()
    process.exit(1)
  })
