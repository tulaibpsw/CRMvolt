import 'server-only'
import { FOLLOW_UP_GAP_DAYS, MAX_FOLLOW_UPS, type AttemptChannel, type CallResult, type ProofFlag, type ProofStatus, type Stage } from '@/domain/constants'
import type { AttemptOutcomeInput } from '@/domain/schemas'
import { pktDateKey } from '@/lib/dates-pkt'
import { toWhatsAppDigits } from '@/lib/phone'
import { connectDb } from '@/server/db/connection'
import { Attendance, Contact, ContactAttempt, DocumentFile, FollowUp, Lead } from '@/server/db/models'
import { withTransaction } from '@/server/db/transaction'
import type { SessionUser } from '@/server/auth/session'
import { isObjectId, loadLeadFor } from '@/server/auth/guards'
import { leadScope } from '@/server/auth/scope'
import { managersOf, autoAssign, drainQueue } from '@/server/services/assignment'
import { getPrivateImage, isCloudinaryConfigured } from '@/server/services/cloudinary'
import { notifyWatchers } from '@/server/services/watch'
import { ATTEMPT_CHANNEL_META, CALL_RESULT_META, CUSTOMER_RESPONSE_META } from '@/domain/ui-maps'
import { cancelJobs, logActivity, notify, oid, scheduleJob, UserError } from '@/server/services/common'
import { en } from '@/i18n/en'
import { getSetting, nextOpening } from '@/server/services/settings'

const NO_ANSWER: CallResult[] = ['no_answer', 'busy', 'number_off']
/** Minimum believable time away from the app per result (anti-fraud). */
const MIN_AWAY_MS: Partial<Record<CallResult, number>> = { connected: 30_000, no_answer: 15_000, busy: 5_000, number_off: 5_000, wrong_number: 10_000 }
const STAGE_ORDER: Stage[] = ['new', 'contacted', 'interested', 'requirement_collected', 'site_survey', 'quotation_pending', 'quotation_sent', 'negotiation', 'won', 'lost']
/** Share of normal "connected" calls sent to the manager for a call-back check. */
const SPOT_CHECK_RATE = 0.1
/** Phone clocks drift a little; a time this far before the tap or after now is not trusted. */
const CLOCK_SLACK_MS = 2 * 60_000

/** WhatsApp (wa.me) or the phone dialer. */
export function contactHref(channel: AttemptChannel, phone: string, greeting: string): string {
  const digits = toWhatsAppDigits(phone)
  if (channel === 'phone_call') return `tel:${phone}`
  const text = encodeURIComponent(greeting)
  return `https://wa.me/${digits}?text=${text}`
}

/** Step 1: the tap is logged on the SERVER before WhatsApp/dialer opens. Agents: only their accepted, open lead. */
export async function tapAttempt(leadId: string, channel: AttemptChannel, user: SessionUser): Promise<{ attemptId: string; href: string }> {
  const lead = await loadLeadFor(user, leadId, 'work')
  const contact = await Contact.findById(lead.contactId).lean()
  if (!contact) throw new UserError('Customer details are missing')
  // An unlogged attempt must be finished first (stops "tap-only" activity).
  const open = await ContactAttempt.findOne({ leadId: lead._id, agentId: oid(user.id), outcomeAt: null }).lean()
  if (open && Date.now() - open.serverTapAt.getTime() < 6 * 3_600_000) throw new UserError('First save the result of your last call or chat on this lead')
  const attempt = await ContactAttempt.create({
    leadId: lead._id,
    agentId: oid(user.id),
    channel,
    followUpNo: Math.min(lead.attemptCount + 1, MAX_FOLLOW_UPS),
    serverTapAt: new Date(),
  })
  await notifyWatchers({ id: user.id, departmentId: user.departmentId }, 'contact_tap', {
    title: `${user.name} tapped ${ATTEMPT_CHANNEL_META[channel].label} for ${contact.name} (${lead.leadNo})`,
    body: `Try ${Math.min(lead.attemptCount + 1, MAX_FOLLOW_UPS)} of ${MAX_FOLLOW_UPS}`,
    link: `/leads/${lead._id}`,
    dedupeKey: `tap:${attempt._id}`,
  })
  const phone = channel === 'phone_call' ? contact.phones[0] : (contact.whatsappE164 ?? contact.phones[0])
  const greeting = `Assalam o Alaikum ${contact.name}, this is ${user.name.split(' ')[0]} from ${en.app.company}. You asked about solar — is now a good time to talk?`
  return { attemptId: String(attempt._id), href: contactHref(channel, phone, greeting) }
}

export interface ScreenshotInput {
  publicId: string
  name: string
  mime: string
  size: number
}

/** Step 2: the 2-tap outcome sheet. Applies the client's cadence: 1st → +1 day → +3 days → Dead after 3 no-answers. */
export async function logOutcome(input: AttemptOutcomeInput & { screenshot?: ScreenshotInput }, user: SessionUser): Promise<void> {
  await connectDb()
  const now = new Date()
  // Claim the attempt atomically — a double tap cannot log it twice.
  const attempt = await ContactAttempt.findOneAndUpdate({ _id: oid(input.attemptId), agentId: oid(user.id), outcomeAt: null }, { $set: { outcomeAt: now } }, { returnDocument: 'after' })
  if (!attempt) {
    const exists = await ContactAttempt.exists({ _id: oid(input.attemptId), agentId: oid(user.id) })
    throw new UserError(exists ? 'This result is already saved' : 'Call not found')
  }
  try {
    await applyOutcome(attempt, input, user, now)
  } catch (error) {
    await ContactAttempt.updateOne({ _id: attempt._id }, { $set: { outcomeAt: null } })
    throw error
  }
}

async function applyOutcome(attempt: InstanceType<typeof ContactAttempt>, input: AttemptOutcomeInput & { screenshot?: ScreenshotInput }, user: SessionUser, now: Date) {
  const lead = await loadLeadFor(user, String(attempt.leadId), 'work')
  const tapAt = attempt.serverTapAt.getTime()

  // ── Timing: phone-reported times are only trusted inside [tap, now]. ──
  const flags: ProofFlag[] = []
  const leftAt = input.leftAt && input.leftAt.getTime() >= tapAt - CLOCK_SLACK_MS && input.leftAt.getTime() <= now.getTime() + CLOCK_SLACK_MS ? input.leftAt : undefined
  let returnedAt = input.returnedAt && leftAt && input.returnedAt >= leftAt && input.returnedAt.getTime() <= now.getTime() + CLOCK_SLACK_MS ? input.returnedAt : undefined
  if (leftAt && !returnedAt) returnedAt = now
  if (!leftAt) returnedAt = undefined
  const awayMs = leftAt && returnedAt ? returnedAt.getTime() - leftAt.getTime() : null
  if (input.result !== 'could_not_call' && awayMs === null) flags.push('never_left_app')
  if (awayMs !== null && awayMs < (MIN_AWAY_MS[input.result] ?? 0)) flags.push('too_fast')
  // Typed call length can never be longer than the time away (+1 min). Longer claims are flagged and capped.
  let durationSec = input.durationSec
  if (durationSec !== undefined) {
    const maxSec = Math.round((awayMs ?? now.getTime() - tapAt) / 1000) + 60
    if (durationSec > maxSec + 60) flags.push('duration_mismatch')
    durationSec = Math.min(durationSec, maxSec)
  }
  const onDuty = await Attendance.exists({ userId: oid(user.id), date: pktDateKey(now), status: { $in: ['checked_in', 'on_break'] } })
  if (!onDuty && user.role === 'agent') flags.push('off_duty')

  // ── Screenshot: must be a real private upload in this agent's folder, made after the tap, never used before. ──
  let screenshotDocId: string | null = null
  let etag: string | null = null
  if (input.screenshot) {
    const shot = input.screenshot
    if (!shot.publicId.startsWith(`volton/attempts/${user.id}/`)) throw new UserError('That screenshot was not uploaded from your account')
    if (isCloudinaryConfigured()) {
      const meta = await getPrivateImage(shot.publicId)
      if (!meta) throw new UserError('Screenshot not found — please upload it again')
      etag = meta.etag
      if (meta.createdAt.getTime() < tapAt - CLOCK_SLACK_MS) flags.push('screenshot_time_mismatch')
      if (await ContactAttempt.exists({ 'proof.phash': etag, _id: { $ne: attempt._id } })) flags.push('screenshot_reused')
    }
    const doc = await DocumentFile.create({ ownerType: 'attempt', ownerId: attempt._id, category: 'attempt_screenshot', fileName: shot.name.slice(0, 120), mime: /^image\//.test(shot.mime) ? shot.mime : 'image/jpeg', size: Math.max(0, shot.size), storageKey: shot.publicId, uploadedBy: oid(user.id) })
    screenshotDocId = String(doc._id)
  }

  // ── Counters ──
  const counted = input.result !== 'could_not_call'
  const noAnswer = NO_ANSWER.includes(input.result)
  const attemptCount = lead.attemptCount + (counted ? 1 : 0)
  const noAnswerStreak = noAnswer ? lead.noAnswerStreak + 1 : counted ? 0 : lead.noAnswerStreak
  if (!counted) {
    const lastThree = await ContactAttempt.find({ leadId: lead._id, outcomeAt: { $ne: null }, _id: { $ne: attempt._id } }).sort({ serverTapAt: -1 }).limit(2).select('result').lean()
    if (lastThree.length === 2 && lastThree.every((a) => a.result === 'could_not_call')) flags.push('repeat_could_not_call')
  }

  // ── Stage / status ──
  let stage = lead.stage as Stage
  let status = lead.status
  let lostReason = lead.lostReason
  let wonValuePkr = lead.wonValuePkr
  const raise = (to: Stage) => {
    if (STAGE_ORDER.indexOf(to) > STAGE_ORDER.indexOf(stage)) stage = to
  }
  if (input.result === 'connected') raise('contacted')
  if (input.response === 'interested') raise('interested')
  if (input.response === 'deal_won') {
    status = 'won'
    stage = 'won'
    wonValuePkr = input.wonValuePkr ?? null
  }
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

  // "Dead" rule: the last 3 attempts are no-answers, spread over at least 2 different days.
  let deadNow = false
  if (status === 'open' && noAnswerStreak >= MAX_FOLLOW_UPS) {
    const streak = await ContactAttempt.find({ leadId: lead._id, outcomeAt: { $ne: null }, _id: { $ne: attempt._id } }).sort({ serverTapAt: -1 }).limit(MAX_FOLLOW_UPS - 1).select('serverTapAt result').lean()
    const days = new Set(streak.filter((a) => NO_ANSWER.includes(a.result as CallResult)).map((a) => pktDateKey(a.serverTapAt)))
    days.add(pktDateKey(now))
    if (days.size >= 2) {
      status = 'unreachable'
      deadNow = true
    }
  }

  // Every lead an agent closes (won / lost / Dead / junk) goes to the manager's review queue.
  const closedByAgent = status !== 'open' && user.role === 'agent'
  if (closedByAgent) flags.push('lead_closed')
  // Random call-back sample of normal connected calls.
  const spotCheck = !closedByAgent && flags.length === 0 && input.result === 'connected' && Math.random() < SPOT_CHECK_RATE
  if (spotCheck) flags.push('spot_check')

  const wasVerified = attempt.proofStatus === 'verified'
  const serious = flags.filter((f) => f !== 'spot_check' && f !== 'lead_closed')
  // Spot checks and closes go to the review queue by flag, without marking the agent's proof as bad.
  const proofStatus: ProofStatus = serious.length ? 'flagged' : wasVerified ? 'verified' : screenshotDocId ? 'evidenced' : 'logged'

  // ── Next follow-up (only while open): agent's time, else the automatic plan. ──
  let nextDue: Date | null = null
  const nextNumber = attemptCount + 1
  if (status === 'open') {
    if (input.nextFollowUpAt) nextDue = input.nextFollowUpAt
    else if (noAnswer) nextDue = new Date(now.getTime() + (FOLLOW_UP_GAP_DAYS[Math.min(attemptCount, FOLLOW_UP_GAP_DAYS.length - 1)] || 1) * 86_400_000)
    else if (input.result === 'could_not_call') nextDue = new Date(now.getTime() + 2 * 3_600_000)
    else nextDue = new Date(now.getTime() + 86_400_000)
  // Automatic times never fall at night or on a holiday: moved to the next opening time.
    if (nextDue && !input.nextFollowUpAt) nextDue = nextOpening(nextDue, await getSetting('working_hours'))
  }

  await withTransaction(async (session) => {
    attempt.set({
      outcomeAt: now,
      leftAt: leftAt ?? null,
      returnedAt: returnedAt ?? null,
      result: input.result,
      response: input.response ?? null,
      remarks: input.remarks ?? null,
      durationSec: durationSec ?? null,
      flags,
      proofStatus,
      'proof.docIds': screenshotDocId ? [oid(screenshotDocId)] : [],
      'proof.phash': etag,
    })
    await attempt.save({ session })
    await FollowUp.updateMany({ leadId: lead._id, status: 'pending' }, { status: 'done', completedAt: now, attemptId: attempt._id, outcome: input.result }, { session })
    lead.set({
      attemptCount,
      noAnswerStreak,
      stage,
      status,
      lostReason,
      wonValuePkr,
      stageChangedAt: stage !== lead.stage ? now : lead.stageChangedAt,
      closedAt: status === 'open' ? null : (lead.closedAt ?? now),
      firstContactAt: lead.firstContactAt ?? (counted ? now : null),
      lastContactAt: counted ? now : lead.lastContactAt,
      nextFollowUpAt: nextDue,
      updatedBy: oid(user.id),
      ...(closedByAgent ? { closeReview: { status: 'pending', by: null, at: null } } : {}),
    })
    await lead.save({ session })
    await logActivity(lead._id, 'attempt_logged', user.id, { attemptId: String(attempt._id), channel: attempt.channel, result: input.result, response: input.response, flags, remarks: input.remarks }, session)
    if (nextDue) {
      await FollowUp.create([{ leadId: lead._id, agentId: oid(user.id), number: nextNumber, dueAt: nextDue }], { session })
      await logActivity(lead._id, 'follow_up_scheduled', user.id, { number: nextNumber, dueAt: nextDue }, session)
    }
    if (status !== 'open') await logActivity(lead._id, 'status_changed', user.id, { status, lostReason, wonValuePkr: status === 'won' ? wonValuePkr : undefined, needsApproval: closedByAgent }, session)
  })

  // Counted attempts (and closes) stop the "not contacted" / follow-up alarms. "Could not call" does not.
  if (counted || status !== 'open') await cancelJobs({ leadId: lead._id, kind: { $in: ['contact_due', 'follow_up_due', 'follow_up_overdue'] } })
  if (nextDue) {
    await scheduleJob('follow_up_due', nextDue, `follow_up_due:${lead._id}:${nextNumber}:${nextDue.getTime()}`, { leadId: lead._id, userId: user.id })
    await scheduleJob('follow_up_overdue', new Date(nextDue.getTime() + 4 * 3_600_000), `follow_up_overdue:${lead._id}:${nextNumber}:${nextDue.getTime()}`, { leadId: lead._id, userId: user.id })
  }
  if (closedByAgent) {
    const what = status === 'won' ? `marked WON (Rs ${wonValuePkr?.toLocaleString('en-PK')})` : deadNow ? 'marked Dead after 3 no-answers' : status === 'junk' ? 'marked wrong number' : 'marked not interested'
    await notify({ userIds: await managersOf(lead.departmentId), type: deadNow ? 'lead_unreachable' : 'lead_closed', title: `${user.name} ${what} — please check`, body: lead.leadNo, link: '/review', dedupeKey: `closed:${attempt._id}` })
  }
  const contactName = (await Contact.findById(lead.contactId).select('name').lean())?.name ?? 'customer'
  const what = [CALL_RESULT_META[input.result].label, input.response ? CUSTOMER_RESPONSE_META[input.response].label : null].filter(Boolean).join(' — ')
  await notifyWatchers({ id: user.id, departmentId: user.departmentId }, 'result_logged', {
    title: `${user.name}: ${what} · ${contactName} (${lead.leadNo})`,
    body: [counted ? `Try ${attemptCount} of ${MAX_FOLLOW_UPS}` : null, input.remarks?.slice(0, 80)].filter(Boolean).join(' · '),
    link: `/leads/${lead._id}`,
    dedupeKey: `result:${attempt._id}`,
  })
  if (status !== 'open' && lead.teamId) await drainQueue(lead.teamId)
}

/**
 * "I tapped by mistake": closes an unsaved tap without counting it as a try (nothing else changes).
 * Only right after the tap (time away under 2 minutes) — after a real call the result must be saved.
 */
export async function cancelAttempt(attemptId: string, user: SessionUser, away?: { leftAt?: Date; returnedAt?: Date }): Promise<void> {
  await connectDb()
  if (!isObjectId(attemptId)) throw new UserError('Call not found')
  const attempt = await ContactAttempt.findOne({ _id: oid(attemptId), agentId: oid(user.id), outcomeAt: null })
  if (!attempt) throw new UserError('This tap is already saved')
  const now = new Date()
  const awayMs = away?.leftAt && away.returnedAt ? away.returnedAt.getTime() - away.leftAt.getTime() : 0
  if (awayMs > 2 * 60_000 || now.getTime() - attempt.serverTapAt.getTime() > 30 * 60_000) {
    throw new UserError('You were away from the app for a while — please save what happened instead (e.g. "Couldn\'t call now").')
  }
  const claimed = await ContactAttempt.findOneAndUpdate({ _id: attempt._id, outcomeAt: null }, { $set: { outcomeAt: now, cancelled: true, remarks: 'Tapped by mistake', proofStatus: 'logged' } }, { returnDocument: 'after' })
  if (!claimed) throw new UserError('This tap is already saved')
  await logActivity(attempt.leadId, 'note_added', user.id, { text: `Tap on ${ATTEMPT_CHANNEL_META[attempt.channel as AttemptChannel].label} cancelled — tapped by mistake` })
  const lead = await Lead.findById(attempt.leadId).select('leadNo').lean()
  await notifyWatchers({ id: user.id, departmentId: user.departmentId }, 'tap_cancelled', { title: `${user.name} cancelled a tap (by mistake) · ${lead?.leadNo ?? ''}`, link: `/leads/${attempt.leadId}`, dedupeKey: `cancel:${attempt._id}` })
}

/**
 * Manager review of an attempt in the queue.
 * OK on a closed lead approves the close (won now counts in sales). Dispute on a closed lead re-opens it and gives it
 * to another agent.
 */
export async function reviewAttempt(attemptId: string, decision: 'reviewed' | 'disputed', note: string, user: SessionUser): Promise<void> {
  await connectDb()
  if (!isObjectId(attemptId)) throw new UserError('Not found')
  const attempt = await ContactAttempt.findById(attemptId)
  if (!attempt) throw new UserError('Not found')
  const lead = await Lead.findOne({ $and: [{ _id: attempt.leadId }, leadScope(user)] })
  if (!lead) throw new UserError('Not found')
  if (decision === 'disputed' && note.trim().length < 3) throw new UserError('Write why you dispute it')
  attempt.set({ review: { status: decision, by: oid(user.id), at: new Date(), note } })
  await attempt.save()
  await logActivity(lead._id, 'proof_reviewed', user.id, { attemptId, decision, note })
  if (!attempt.flags.includes('lead_closed') || lead.closeReview?.status !== 'pending') return
  if (decision === 'reviewed') {
    lead.set({ closeReview: { status: 'approved', by: oid(user.id), at: new Date() } })
    await lead.save()
    await logActivity(lead._id, 'status_changed', user.id, { status: lead.status, approved: true })
    return
  }
  // Disputed close → back to open, away from the agent who closed it.
  const formerAgent = String(attempt.agentId)
  lead.set({ status: 'open', stage: lead.stage === 'won' || lead.stage === 'lost' ? 'contacted' : lead.stage, closedAt: null, lostReason: null, wonValuePkr: null, noAnswerStreak: 0, closeReview: { status: 'rejected', by: oid(user.id), at: new Date() }, 'assignment.state': 'waiting', 'assignment.agentId': null })
  await lead.save()
  await logActivity(lead._id, 'status_changed', user.id, { status: 'open', reason: 'close disputed by manager', note })
  await notify({ userIds: [formerAgent], type: 'lead_reassigned', title: 'Your close was disputed by the manager', body: `${lead.leadNo}: ${note}`, link: `/leads/${lead._id}`, dedupeKey: `disputed:${attempt._id}` })
  await autoAssign(lead._id, [formerAgent])
}
