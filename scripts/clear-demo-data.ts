/**
 * Before real staff use the CRM: remove ALL demo data (demo users with password volton@123, leads, chats, visits…).
 * Keeps: super admin account(s), departments, settings (Google Sheet link, working hours, colours).
 *   npm run clear-demo-data -- --yes
 */
import mongoose from 'mongoose'
import { requireMongoUri } from '@/lib/env'
import { connectDb } from '@/server/db/connection'
import { ALL_MODELS, AuditLog, Department, Setting, User } from '@/server/db/models'

const KEEP = new Set([Department.modelName, Setting.modelName, User.modelName, AuditLog.modelName])

async function main() {
  if (!process.argv.includes('--yes')) throw new Error('This deletes all demo users and leads. Re-run with --yes to confirm.')
  await connectDb(requireMongoUri())
  const owners = await User.countDocuments({ role: 'super_admin', isActive: true, deletedAt: null })
  if (!owners) throw new Error('No super admin found — create one first: npm run create-super-admin -- <email> <password>')
  for (const model of ALL_MODELS) {
    if (KEEP.has(model.modelName)) continue
    const { deletedCount } = await model.collection.deleteMany({})
    if (deletedCount) console.log(`${model.modelName}: removed ${deletedCount}`)
  }
  const { deletedCount } = await User.collection.deleteMany({ role: { $ne: 'super_admin' } })
  console.log(`User: removed ${deletedCount} demo users (super admin kept)`)
  // Rows handled by the Sheet pull are gone too: run Settings → Google Sheet → "First time" once after this.
  await Setting.updateOne({ key: 'sheet_config' }, { $set: { 'value.cursor': {} } })
  console.log('Done. Next: sign in as super admin → Company admin → add managers; Settings → Google Sheet → "First time" option.')
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    await mongoose.disconnect()
    process.exit(1)
  })
