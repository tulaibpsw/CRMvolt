/**
 * npm run seed            — fill an EMPTY database with demo data
 * npm run seed -- --reset — wipe everything and reseed (dev/demo databases only)
 */
import mongoose from 'mongoose'
import { requireMongoUri } from '@/lib/env'
import { connectDb } from '@/server/db/connection'
import { ALL_MODELS, User } from '@/server/db/models'
import { seedDemoData } from '@/server/db/seed/build-seed'

const args = new Set(process.argv.slice(2))

async function main() {
  const uri = requireMongoUri()
  if (/prod/i.test(uri) && !args.has('--force')) throw new Error('This looks like a production database. Re-run with --force if you are sure.')
  await connectDb(uri)
  await Promise.all(ALL_MODELS.map((model) => model.syncIndexes()))
  const existing = await User.countDocuments()
  if (existing > 0 && !args.has('--reset')) {
    throw new Error(`Database already has ${existing} users. Re-run with --reset to wipe it and reseed demo data.`)
  }
  const summary = await seedDemoData()
  console.log('Seeded demo data:', summary)
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    await mongoose.disconnect()
    process.exit(1)
  })
