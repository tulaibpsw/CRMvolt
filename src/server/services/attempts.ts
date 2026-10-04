import 'server-only'
import { FOLLOW_UP_GAP_DAYS, MAX_FOLLOW_UPS, type AttemptChannel, type CallResult, type ProofFlag, type ProofStatus, type Stage } from '@/domain/constants'
import type { AttemptOutcomeInput } from '@/domain/schemas'
import { pktDateKey } from '@/lib/dates-pkt'
import { toWhatsAppDigits } from '@/lib/phone'
import { connectDb } from '@/server/db/connection'
import { Attendance, Contact, ContactAttempt, FollowUp, Lead } from '@/server/db/models'
import { withTransaction } from '@/server/db/transaction'
import type { SessionUser } from '@/server/auth/session'
import { managersOf, drainQueue } from '@/server/services/assignment'
import { cancelJobs, logActivity, notify, oid, scheduleJob } from '@/server/services/common'
import { en } from '@/i18n/en'

const NO_ANSWER: CallResult[] = ['no_answer', 'busy', 'number_off']
/** Minimum believable time away from the app per result (anti-fraud). */
const MIN_AWAY_MS: Partial<Record<CallResult, number>> = { connected: 20_000, no_answer: 15_000, busy: 5_000, number_off: 5_000, wrong_number: 10_000 }
const STAGE_ORDER: Stage[] = ['new', 'contacted', 'interested', 'requirement_collected', 'site_survey', 'quotation_pending', 'quotation_sent', 'negotiation', 'won', 'lost']

function canWork(lead: { assignment?: { agentId?: unknown } | null; departmentId?: unknown }, user: SessionUser) {
  if (user.role === 'admin') return true
  if (user.role === 'manager') return String(lead.departmentId) === user.departmentId
  return String(lead.assignment?.agentId) === user.id
}

/** WhatsApp Business app on Android (company number), falling back to wa.me; or the phone dialer. */
export function contactHref(channel: AttemptChannel, phone: string, greeting: string): string {
  const digits = toWhatsAppDigits(phone)
  if (channel === 'phone_call') return `tel:${phone}`
  const text = encodeURIComponent(greeting)
  return `https://wa.me/${digits}?text=${text}`
}

/** Step 1: the tap is logged on the SERVER before WhatsApp/dialer opens. */
export async function tapAttempt(leadId: string, channel: AttemptChannel, user: SessionUser): Promise<{ attemptId: string; href: string }> {
  await connectDb()
  const lead = await Lead.findById(leadId).lean()
  if (!lead || !canWork(lead, user)) throw new Error('You cannot work this lead')
  const contact = await Contact.findById(lead.contactId).lean()
  if (!contact) throw new Error('Contact missing')
  const attempt = await ContactAttempt.create({
    leadId: lead._id,
    agentId: oid(user.id),
    channel,
    followUpNo: Math.min(lead.attemptCount + 1, MAX_FOLLOW_UPS),
    serverTapAt: new Date(),
  })
  const phone = channel === 'phone_call' ? contact.phones[0] : (contact.whatsappE164 ?? contact.phones[0])
  const greeting = `Assalam o Alaikum ${contact.name}, this is ${user.name.split(' ')[0]} from ${en.app.company}. You asked about solar — is now a good time to talk?`
  return { attemptId: String(attempt._id), href: contactHref(channel, phone, greeting) }
}

/** Step 2: the 2-tap outcome sheet. Applies the client's cadence: 1st → +1 day → +3 days → Dead after 3 no-answers. */
export async function logOutcome(input: AttemptOutcomeInput & { screenshotDocIds?: string[] }, user: SessionUser): Promise<void> {
  await connectDb()
  const attempt = await ContactAttempt.findById(input.attemptId)
  if (!attempt || String(attempt.agentId) !== user.id) throw new Error('Attempt not found')
  if (attempt.outcomeAt) throw new Error('This attempt is already logged')
  const lead = await Lead.findById(attempt.leadId)
  if (!lead) throw new Error('Lead not found')

  const now = new Date()
  const flags: ProofFlag[] = []
  const awayMs = input.leftAt && input.returnedAt ? input.returnedAt.getTime() - input.leftAt.getTime() : null
  if (input.result !== 'could_not_call' && !input.leftAt) flags.push('never_left_app')
  if (awayMs !== null && awayMs < (MIN_AWAY_MS[input.result] ?? 0)) flags.push('too_fast')
  const onDuty = await Attendance.exists({ userId: oid(user.id), date: pktDateKey(now), status: { $in: ['checked_in', 'on_break'] } })
  if (!onDuty && user.role === 'agent') flags.push('off_duty')
  const hasScreenshot = (input.screenshotDocIds?.length ?? 0) > 0
  const proofStatus: ProofStatus = flags.length ? 'flagged' : hasScreenshot ? 'evidenced' : 'logged'

  const counted = input.result !== 'could_not_call'
  const noAnswer = NO_ANSWER.includes(input.result)
  const attemptCount = lead.attemptCount + (counted ? 1 : 0)
  const noAnswerStreak = noAnswer ? lead.noAnswerStreak + 1 : counted ? 0 : lead.noAnswerStreak

  // Stage / status from the outcome.
  let stage = lead.stage as Stage
  let status = lead.status
  let lostReason = lead.lostReason
  const raise = (to: Stage) => {
    if (STAGE_ORDER.indexOf(to) > STAGE_ORDER.indexOf(stage)) stage = to
  }
  if (input.result === 'connected') raise('contacted')
  if (input.response === 'interested') raise('interested')
  if (input.response === 'not_interested' || input.response === 'already_has_solar') {
    status = 'lost'
    stage = 'lost'
    lostReason = 'not_interested'
  }
  if (input.result === 'wrong_number') status = 'junk'
  if (input.closeLead && status === 'open') {
    status = 'lost'
    stage = 'lost'
    lostReason = lostReason ?? 'other'
  }

  // "Dead" rule: 3 no-answers, spread over at least 2 different days.
  let deadNow = false
  if (status === 'open' && noAnswerStreak >= MAX_FOLLOW_UPS) {
    const days = new Set((await ContactAttempt.find({ leadId: lead._id, result: { $in: NO_ANSWER } }).select('serverTapAt').lean()).map((a) => pktDateKey(a.serverTapAt)))
    days.add(pktDateKey(now))
    if (days.size >= 2) {
      status = 'unreachable'
      deadNow = true
    }
  }

  // Next follow-up.
  let nextDue: Date | null = null
  let nextNumber = Math.min(attemptCount + 1, MAX_FOLLOW_UPS)
  if (status === 'open') {
    if (input.nextFollowUpAt) nextDue = input.nextFollowUpAt
    else if (noAnswer && attemptCount < MAX_FOLLOW_UPS) nextDue = new Date(now.getTime() + FOLLOW_UP_GAP_DAYS[attemptCount] * 86_400_000)
    else if (input.result === 'could_not_call') nextDue = new Date(now.getTime() + 2 * 3_600_000)
    if (attemptCount >= MAX_FOLLOW_UPS) nextNumber = attemptCount + 1
  }

  await withTransaction(async (session) => {
    attempt.set({
      outcomeAt: now,
      leftAt: input.leftAt ?? null,
      returnedAt: input.returnedAt ?? null,
      result: input.result,
      response: input.response ?? null,
      remarks: input.remarks ?? null,
      durationSec: input.durationSec ?? null,
      flags,
      proofStatus,
      'proof.docIds': (input.screenshotDocIds ?? []).map(oid),
    })
    await attempt.save({ session })
    await FollowUp.updateMany({ leadId: lead._id, status: 'pending' }, { status: 'done', completedAt: now, attemptId: attempt._id, outcome: input.result }, { session })
    lead.set({
      attemptCount,
      noAnswerStreak,
      stage,
      status,
      lostReason,
      stageChangedAt: stage !== lead.stage ? now : lead.stageChangedAt,
      closedAt: status === 'open' ? null : now,
      firstContactAt: lead.firstContactAt ?? (counted ? now : null),
      lastContactAt: counted ? now : lead.lastContactAt,
      nextFollowUpAt: nextDue,
      updatedBy: oid(user.id),
    })
    await lead.save({ session })
    await logActivity(lead._id, 'attempt_logged', user.id, { attemptId: String(attempt._id), channel: attempt.channel, result: input.result, response: input.response, flags, remarks: input.remarks }, session)
    if (nextDue) {
      await FollowUp.create([{ leadId: lead._id, agentId: oid(user.id), number: nextNumber, dueAt: nextDue }], { session })
      await logActivity(lead._id, 'follow_up_scheduled', user.id, { number: nextNumber, dueAt: nextDue }, session)
    }
    if (status !== 'open') await logActivity(lead._id, 'status_changed', user.id, { status, lostReason }, session)
  })

  await cancelJobs({ leadId: lead._id, kind: { $in: ['contact_due', 'follow_up_due', 'follow_up_overdue'] } })
  if (nextDue) {
    await scheduleJob('follow_up_due', nextDue, `follow_up_due:${lead._id}:${nextNumber}:${nextDue.getTime()}`, { leadId: lead._id, userId: user.id })
    await scheduleJob('follow_up_overdue', new Date(nextDue.getTime() + 4 * 3_600_000), `follow_up_overdue:${lead._id}:${nextNumber}:${nextDue.getTime()}`, { leadId: lead._id, userId: user.id })
  }
  if (deadNow) {
    await notify({ userIds: await managersOf(lead.departmentId), type: 'lead_unreachable', title: 'Lead marked Dead after 3 no-answers', body: lead.leadNo, link: `/leads/${lead._id}`, dedupeKey: `dead:${lead._id}` })
  }
  if (status !== 'open' && lead.teamId) await drainQueue(lead.teamId)
}

/** Manager review of a flagged attempt. */
export async function reviewAttempt(attemptId: string, decision: 'reviewed' | 'disputed', note: string, user: SessionUser): Promise<void> {
  await connectDb()
  const attempt = await ContactAttempt.findById(attemptId)
  if (!attempt) throw new Error('Attempt not found')
  attempt.set({ review: { status: decision, by: oid(user.id), at: new Date(), note } })
  await attempt.save()
  await logActivity(attempt.leadId, 'proof_reviewed', user.id, { attemptId, decision, note })
}
