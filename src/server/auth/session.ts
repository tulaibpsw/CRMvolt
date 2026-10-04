import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_DAYS, type Department, type Role } from '@/domain/constants'
import { connectDb } from '@/server/db/connection'
import { Department as DepartmentModel, Session, User } from '@/server/db/models'

export const SESSION_COOKIE = 'volton_session'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: Role
  departmentId: string | null
  departmentCode: Department | null
  managerId: string | null
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/** Create a session after a successful login (Server Action / route handler only). */
export async function startSession(userId: string, userAgent?: string): Promise<void> {
  await connectDb()
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  await Session.create({ tokenHash: sha256(token), userId, expiresAt, userAgent })
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: expiresAt })
}

export async function endSession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) {
    await connectDb()
    await Session.deleteOne({ tokenHash: sha256(token) })
  }
  jar.delete(SESSION_COOKIE)
}

/** Current user or null. Cached per request. Inactive/deleted users are treated as signed out. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null
  await connectDb()
  const session = await Session.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } }).lean()
  if (!session) return null
  const user = await User.findOne({ _id: session.userId, isActive: true, deletedAt: null }).lean()
  if (!user) return null
  const department = user.departmentId ? await DepartmentModel.findById(user.departmentId).lean() : null
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role as Role,
    departmentId: user.departmentId ? String(user.departmentId) : null,
    departmentCode: (department?.code as Department | undefined) ?? null,
    managerId: user.managerId ? String(user.managerId) : null,
  }
})

/** For pages and actions: signed-in user, or redirect to /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return user
}

export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to do this.') {
    super(message)
  }
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser()
  if (!roles.includes(user.role)) throw new ForbiddenError()
  return user
}

/** Revoke every session of a user (deactivation, password reset). */
export async function revokeSessions(userId: string): Promise<void> {
  await connectDb()
  await Session.deleteMany({ userId })
}
