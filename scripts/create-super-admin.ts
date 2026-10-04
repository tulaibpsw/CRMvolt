/**
 * Create or update the owner account (super admin).
 *   npm run create-super-admin -- <email> <password> [full name]
 * The password is passed on the command line only — it is never written to the repo.
 */
import mongoose from 'mongoose'
import { requireMongoUri } from '@/lib/env'
import { connectDb } from '@/server/db/connection'
import { AuditLog, User } from '@/server/db/models'
import { hashPassword, passwordProblem } from '@/server/auth/password'

async function main() {
  const [email, password, ...nameParts] = process.argv.slice(2)
  if (!email || !password) throw new Error('Usage: npm run create-super-admin -- <email> <password> [full name]')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('That is not an email address')
  if (password.length < 8) throw new Error('Password must be at least 8 characters')
  const problem = passwordProblem(password, email.split('@')[0])
  if (problem) console.warn(`Warning: ${problem}. Change it after the first sign-in (menu → Change password).`)
  await connectDb(requireMongoUri())
  await Promise.all([User.syncIndexes(), AuditLog.syncIndexes()])
  const lower = email.toLowerCase()
  let username = lower.split('@')[0].replace(/[^a-z0-9._-]/g, '').slice(0, 30) || 'owner'
  const clash = await User.findOne({ username, email: { $ne: lower } }).lean()
  if (clash) username = `${username}.owner`
  const name = nameParts.join(' ').trim() || username.charAt(0).toUpperCase() + username.slice(1)
  const passwordHash = await hashPassword(password)
  const existing = await User.findOne({ email: lower })
  const user = existing
    ? await User.findByIdAndUpdate(existing._id, { role: 'super_admin', passwordHash, isActive: true, deletedAt: null, mustChangePassword: false, departmentId: null }, { returnDocument: 'after' })
    : await User.create({ name, email: lower, username, role: 'super_admin', passwordHash, mustChangePassword: false })
  await AuditLog.create({ entity: 'user', entityId: user!._id, action: existing ? 'update' : 'create', after: { role: 'super_admin', via: 'create-super-admin script' }, actorId: null })
  console.log(`Super admin ready: ${user!.email} (username: ${user!.username}) — sign in with the email or the username.`)
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    await mongoose.disconnect()
    process.exit(1)
  })
