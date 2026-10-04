import 'server-only'
import { Types } from 'mongoose'
import type { SessionUser } from '@/server/auth/session'

/**
 * Data scoping — EVERY lead query goes through this.
 * admin = all · manager = own department · call agent = own leads · field agent = leads of their visits (via visit queries).
 */
export function leadScope(user: SessionUser): Record<string, unknown> {
  const base = { deletedAt: null }
  if (user.role === 'admin') return base
  if (user.role === 'manager') return { ...base, departmentId: user.departmentId ? new Types.ObjectId(user.departmentId) : null }
  return { ...base, 'assignment.agentId': new Types.ObjectId(user.id) }
}

/** Site visits: admin all, manager own department leads' visits (all visits for now — Installation runs visits), field agent own. */
export function visitScope(user: SessionUser): Record<string, unknown> {
  const base = { deletedAt: null }
  if (user.role === 'field_agent') return { ...base, agentId: new Types.ObjectId(user.id) }
  return base
}

/** Users a person may see/manage. */
export function userScope(user: SessionUser): Record<string, unknown> {
  const base = { deletedAt: null }
  if (user.role === 'admin') return base
  if (user.role === 'manager') return { ...base, departmentId: user.departmentId ? new Types.ObjectId(user.departmentId) : null }
  return { ...base, _id: new Types.ObjectId(user.id) }
}

export const isManagerOrAdmin = (user: SessionUser) => user.role === 'admin' || user.role === 'manager'
