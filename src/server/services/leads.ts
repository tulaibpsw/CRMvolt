import 'server-only'
import { DEPARTMENTS, type Department, type LostReason, type Stage } from '@/domain/constants'
import { Department as DepartmentModel, Team } from '@/server/db/models'
import type { SessionUser } from '@/server/auth/session'
import { loadLeadFor } from '@/server/auth/guards'
import { drainQueue, resetAssignment, startAssignment } from '@/server/services/assignment'
import { isDuplicateKey, logActivity, oid, UserError } from '@/server/services/common'

const STAGE_ORDER: Stage[] = ['new', 'contacted', 'interested', 'requirement_collected', 'site_survey', 'quotation_pending', 'quotation_sent', 'negotiation', 'won', 'lost']
/** Stages an agent may set by hand (forward only). Won / lost come from the call result and need a manager's OK. */
export const AGENT_STAGES: readonly Stage[] = ['contacted', 'interested', 'requirement_collected']

export async function changeStage(user: SessionUser, leadId: string, stage: Stage, opts: { lostReason?: LostReason; wonValuePkr?: number }): Promise<void> {
  const manager = user.role !== 'agent'
  const lead = await loadLeadFor(user, leadId, manager ? 'manage' : 'work')
  if (!manager) {
    if (!AGENT_STAGES.includes(stage)) throw new UserError('Only a manager can set this stage. For a sale or "not interested", save it from the call result.')
    if (STAGE_ORDER.indexOf(stage) <= STAGE_ORDER.indexOf(lead.stage as Stage)) throw new UserError('Agents can only move a lead forward')
  }
  if (stage === 'won' && !(opts.wonValuePkr && opts.wonValuePkr > 0)) throw new UserError('Enter the sale value (PKR)')
  if (stage === 'lost' && !opts.lostReason) throw new UserError('Choose why the lead was lost')
  const now = new Date()
  lead.set({ stage, stageChangedAt: now, updatedBy: oid(user.id) })
  if (stage === 'won') lead.set({ status: 'won', closedAt: now, wonValuePkr: opts.wonValuePkr, closeReview: { status: 'approved', by: oid(user.id), at: now } })
  else if (stage === 'lost') lead.set({ status: 'lost', closedAt: now, lostReason: opts.lostReason, closeReview: { status: 'approved', by: oid(user.id), at: now } })
  else if (lead.status !== 'open') throw new UserError('Re-open the lead first')
  await lead.save()
  await logActivity(lead._id, 'stage_changed', user.id, { stage, lostReason: opts.lostReason, wonValuePkr: opts.wonValuePkr })
  if (lead.status !== 'open' && lead.teamId) await drainQueue(lead.teamId)
}

/** Manager re-opens a closed lead: it goes back to the queue for round-robin. */
export async function reopenLead(user: SessionUser, leadId: string): Promise<void> {
  const lead = await loadLeadFor(user, leadId, 'manage')
  if (lead.status === 'open') throw new UserError('The lead is already open')
  lead.set({ status: 'open', closedAt: null, lostReason: null, wonValuePkr: null, noAnswerStreak: 0, stage: 'contacted', stageChangedAt: new Date(), closeReview: { status: 'none', by: null, at: null } })
  try {
    await lead.save()
  } catch (error) {
    if (isDuplicateKey(error)) throw new UserError('This customer already has another open lead in this department — work that one')
    throw error
  }
  await logActivity(lead._id, 'status_changed', user.id, { status: 'open', reopened: true })
  await resetAssignment(lead._id, user.id, 'reopened')
  await startAssignment(lead._id)
}

/** Move a lead to the other department's queue (manager of the lead's department, or admin). */
export async function transferLead(user: SessionUser, leadId: string, code: Department, reason: string): Promise<void> {
  if (!DEPARTMENTS.includes(code)) throw new UserError('Pick a department')
  if (reason.trim().length < 3) throw new UserError('Write why the lead is moved')
  const lead = await loadLeadFor(user, leadId, 'manage')
  const dept = await DepartmentModel.findOne({ code }).lean()
  if (!dept) throw new UserError('Department not found')
  if (String(lead.departmentId) === String(dept._id)) throw new UserError('The lead is already in this department')
  const team = await Team.findOne({ departmentId: dept._id }).lean()
  lead.set({ departmentId: dept._id, teamId: team?._id ?? null, stage: 'new', stageChangedAt: new Date() })
  try {
    await lead.save()
  } catch (error) {
    if (isDuplicateKey(error)) throw new UserError('This customer already has an open lead in that department')
    throw error
  }
  await logActivity(lead._id, 'status_changed', user.id, { transferredTo: code, reason })
  await resetAssignment(lead._id, user.id, `moved to ${code}`)
  await startAssignment(lead._id)
}
