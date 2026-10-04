import 'server-only'
import { Types } from 'mongoose'
import { connectDb } from '@/server/db/connection'
import { Lead, User, Visit } from '@/server/db/models'
import type { SessionUser } from '@/server/auth/session'
import { leadScope, visitScope } from '@/server/auth/scope'
import { UserError } from '@/server/services/common'

/**
 * The ONE way actions load a lead or visit for a user. Never use Lead.findById(id from the client) in an action.
 *  - view   : read / add a note (agent: own lead · manager: own department · admin: all)
 *  - work   : call, WhatsApp, log outcome, edit site details (agent: must be the accepted assignee of an OPEN lead)
 *  - manage : assign, transfer, reopen, change any stage (admin / manager of the lead's department only)
 */
export type LeadAccess = 'view' | 'work' | 'manage'

export function isObjectId(id: unknown): id is string {
  return typeof id === 'string' && Types.ObjectId.isValid(id) && String(new Types.ObjectId(id)) === id
}

export async function loadLeadFor(user: SessionUser, leadId: unknown, access: LeadAccess) {
  if (!isObjectId(leadId)) throw new UserError('Lead not found')
  if (user.role === 'field_agent') throw new UserError('Field agents work from Site visits')
  if (access === 'manage' && user.role !== 'admin' && user.role !== 'manager') throw new UserError('Only a manager can do this')
  await connectDb()
  const lead = await Lead.findOne({ $and: [{ _id: new Types.ObjectId(leadId) }, leadScope(user)] })
  if (!lead) throw new UserError('Lead not found')
  if (access === 'work' && user.role === 'agent') {
    if (lead.status !== 'open') throw new UserError('This lead is closed')
    if (String(lead.assignment?.agentId) !== user.id) throw new UserError('This lead is no longer yours')
    if (lead.assignment?.state !== 'accepted') throw new UserError('Accept the lead first')
  }
  if (access === 'work' && lead.status !== 'open') throw new UserError('This lead is closed')
  return lead
}

export async function loadVisitFor(user: SessionUser, visitId: unknown) {
  if (!isObjectId(visitId)) throw new UserError('Visit not found')
  if (user.role === 'agent') throw new UserError('Only managers and field agents update visits')
  await connectDb()
  const visit = await Visit.findOne({ $and: [{ _id: new Types.ObjectId(visitId) }, visitScope(user)] })
  if (!visit) throw new UserError('Visit not found')
  return visit
}

/** A user a manager/admin may act on (assign to, add to the order, deactivate). */
export async function loadManagedUser(actor: SessionUser, userId: unknown, roles: string[]) {
  if (!isObjectId(userId)) throw new UserError('User not found')
  await connectDb()
  const target = await User.findOne({ _id: new Types.ObjectId(userId), deletedAt: null }).lean()
  if (!target) throw new UserError('User not found')
  if (!roles.includes(target.role)) throw new UserError('Not allowed for this kind of user')
  if (actor.role === 'manager' && String(target.departmentId) !== actor.departmentId) throw new UserError('That person is not in your department')
  return target
}

/** Only internal paths after login: "/x" yes; "//evil.com", "/\\evil.com", "https://…" no. */
export function safeNext(next: string | undefined | null): string {
  if (!next || !/^\/(?![/\\])[^\s]*$/.test(next)) return '/dashboard'
  return next
}
