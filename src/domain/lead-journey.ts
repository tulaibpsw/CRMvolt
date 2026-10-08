/**
 * The steps every lead goes through, and what the agent should do NOW. Pure — used by the lead page and tests.
 *   Accept → Try 1 → Try 2 (next day) → Try 3 (3 days later) → Close (Deal done / Not interested / Dead) → Manager check
 */
import { MAX_FOLLOW_UPS, type AssignmentState, type CallResult, type CustomerResponse, type LeadStatus } from '@/domain/constants'

export type StepState = 'done' | 'current' | 'upcoming' | 'skipped'

export interface JourneyStep {
  key: string
  title: string
  /** Short line under the title: what happened / when it is due. */
  detail?: string
  state: StepState
}

export interface JourneyAttempt {
  tappedAt: string
  loggedAt?: string
  result?: CallResult
  response?: CustomerResponse
  cancelled?: boolean
}

export interface JourneyInput {
  assignmentState: AssignmentState
  status: LeadStatus
  closeReview: string
  /** Oldest first. */
  attempts: JourneyAttempt[]
  nextFollowUpAt?: string
  assignedAt?: string
  acceptWithinMin: number
  agentName?: string
  /** Labels so this file stays free of UI maps. */
  label: { result: (r: CallResult) => string; response: (r: CustomerResponse) => string; when: (iso: string) => string }
  now?: Date
}

export interface NextStep {
  tone: 'info' | 'warning' | 'success' | 'danger'
  title: string
  text: string
}

const counted = (a: JourneyAttempt) => !!a.loggedAt && !a.cancelled && !!a.result && a.result !== 'could_not_call'

export function leadJourney(input: JourneyInput): { steps: JourneyStep[]; next: NextStep; tryNumber: number; triesDone: number } {
  const now = input.now ?? new Date()
  const tries = input.attempts.filter(counted)
  const closed = input.status !== 'open'
  const accepted = input.assignmentState === 'accepted' || tries.length > 0 || closed
  const tryNumber = Math.min(tries.length + 1, MAX_FOLLOW_UPS)
  const describe = (a: JourneyAttempt) => [input.label.result(a.result!), a.response ? input.label.response(a.response) : null, input.label.when(a.loggedAt ?? a.tappedAt)].filter(Boolean).join(' · ')

  const steps: JourneyStep[] = [
    { key: 'accept', title: 'Accept the lead', state: accepted ? 'done' : 'current', detail: accepted ? 'Accepted' : 'Waiting for the agent' },
  ]
  for (let i = 0; i < MAX_FOLLOW_UPS; i++) {
    const t = tries[i]
    const plan = i === 0 ? 'First call / WhatsApp' : i === 1 ? 'Next day' : '3 days later'
    let state: StepState = 'upcoming'
    let detail: string = plan
    if (t) {
      state = 'done'
      detail = describe(t)
    } else if (closed) {
      state = 'skipped'
      detail = 'Not needed'
    } else if (accepted && i === tries.length) {
      state = 'current'
      detail = input.nextFollowUpAt && i > 0 ? `${plan} · due ${input.label.when(input.nextFollowUpAt)}` : plan
    }
    steps.push({ key: `try${i + 1}`, title: `Try ${i + 1} of ${MAX_FOLLOW_UPS}`, detail, state })
  }
  // More than 3 tries (customer asked to call again): show them as done extra tries on the last step's detail.
  if (tries.length > MAX_FOLLOW_UPS) steps[MAX_FOLLOW_UPS].detail = `${describe(tries[tries.length - 1])} (+${tries.length - MAX_FOLLOW_UPS} extra)`
  const closeDetail = input.status === 'won' ? 'Deal done' : input.status === 'lost' ? 'Not interested / lost' : input.status === 'unreachable' ? 'Dead — 3 no-answers' : input.status === 'junk' ? 'Wrong number' : 'Deal done or Not interested'
  steps.push({ key: 'close', title: 'Close the lead', detail: closeDetail, state: closed ? 'done' : tries.length >= MAX_FOLLOW_UPS ? 'current' : 'upcoming' })
  steps.push({
    key: 'check',
    title: 'Manager check',
    detail: input.closeReview === 'approved' ? 'Approved' : input.closeReview === 'pending' ? 'Waiting for the manager' : input.closeReview === 'rejected' ? 'Disputed — re-opened' : 'After the close',
    state: input.closeReview === 'approved' ? 'done' : input.closeReview === 'pending' ? 'current' : 'upcoming',
  })

  return { steps, next: nextStep(input, tries.length, closed, accepted, now), tryNumber, triesDone: tries.length }
}

function nextStep(input: JourneyInput, done: number, closed: boolean, accepted: boolean, now: Date): NextStep {
  const who = input.agentName ?? 'The agent'
  if (closed) {
    if (input.closeReview === 'pending') return { tone: 'warning', title: 'Waiting for the manager', text: 'The lead is closed. The manager checks it in Proof review — OK keeps it closed, Dispute re-opens it.' }
    return { tone: 'success', title: 'Finished', text: input.status === 'won' ? 'Deal done. Nothing more to do on this lead.' : 'This lead is closed. A manager can re-open it if needed.' }
  }
  if (!accepted) {
    if (input.assignmentState === 'assigned' && input.assignedAt) {
      const due = new Date(new Date(input.assignedAt).getTime() + input.acceptWithinMin * 60_000)
      return { tone: 'warning', title: 'Step 1 · Accept this lead', text: `${who} must tap "Accept" by ${input.label.when(due.toISOString())}. Then the customer's number appears and you can call.` }
    }
    return { tone: 'info', title: 'Waiting for an agent', text: 'This lead is in the queue. It goes to the next checked-in agent in the team order (or a manager assigns it).' }
  }
  if (done === 0) return { tone: 'info', title: 'Step 2 · First contact (try 1 of 3)', text: 'Tap WhatsApp to chat, WA call, or Call. When you come back to the app it asks what happened — that is your proof for the manager.' }
  if (done >= MAX_FOLLOW_UPS) return { tone: 'warning', title: 'Step 5 · Close the lead', text: '3 tries are done. On your next call save "Deal done" or "Not interested" — or set a new follow-up only if the customer asked for it.' }
  const due = input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null
  const label = `Try ${done + 1} of ${MAX_FOLLOW_UPS}`
  if (!due || due.getTime() <= now.getTime()) return { tone: 'warning', title: `${label} is due now`, text: `Call or WhatsApp the customer now.${done + 1 === MAX_FOLLOW_UPS ? ' This is the last try — if there is no answer again the lead is marked Dead.' : ''}` }
  return { tone: 'info', title: `${label} · ${input.label.when(due.toISOString())}`, text: 'Nothing to do now — you will get a reminder. If the customer asked you to call earlier, you can call now.' }
}
