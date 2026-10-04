import 'server-only'
import { Types } from 'mongoose'
import type { SessionUser } from '@/server/auth/session'

/**
 * Data scoping — EVERY lead query goes through this.
 * admin = all · manager = own department · call agent = own leads · field agent = leads of their visits (via visit queries).
 */
/** super_admin and admin see and manage everything. */
export const isAdminRole = (role: string) => role === 'admin' || role === 'super_admin'

export function leadScope(user: SessionUser): Record<string, unknown> {
  const base = { deletedAt: null }
  if (isAdminRole(user.role)) return base
  if (user.role === 'manager') return { ...base, departmentId: user.departmentId ? new Types.ObjectId(user.departmentId) : null }
  return { ...base, 'assignment.agentId': new Types.ObjectId(user.id) }
}

/** Site visits: admin all · manager own department (older visits without a department too) · field agent own · call agent none. */
export function visitScope(user: SessionUser): Record<string, unknown> {
  const base = { deletedAt: null }
  if (user.role === 'field_agent') return { ...base, agentId: new Types.ObjectId(user.id) }
  if (user.role === 'manager') return { ...base, departmentId: { $in: [user.departmentId ? new Types.ObjectId(user.departmentId) : null, null] } }
  if (user.role === 'agent') return { ...base, _id: null }
  return base
}

/** Users a person may see/manage. */
export function userScope(user: SessionUser): Record<string, unknown> {
  const base = { deletedAt: null }
  if (isAdminRole(user.role)) return base
  if (user.role === 'manager') return { ...base, departmentId: user.departmentId ? new Types.ObjectId(user.departmentId) : null }
  return { ...base, _id: new Types.ObjectId(user.id) }
}

export const isManagerOrAdmin = (user: SessionUser) => isAdminRole(user.role) || user.role === 'manager'
