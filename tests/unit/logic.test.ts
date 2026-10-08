import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { columnLetter, nameBlankHeaders, parseFormAnswer, parseSheetDate } from '@/domain/sheet-columns'
import { INSTALL_LOCATIONS, INSTALL_TIMELINES, SYSTEM_SIZE_RANGES } from '@/domain/constants'
import { pickNext } from '@/server/services/assignment'
import { pickFieldAgent } from '@/server/services/visits'
import { parseCsv, spreadsheetIdFrom } from '@/server/services/sheet'
import { verifySignature } from '@/server/services/whatsapp'
import { signParams } from '@/server/services/cloudinary'
import { contactHref } from '@/server/services/attempts'
import { isOpen, nextOpening } from '@/server/services/settings'

describe('pickNext (fixed-order round-robin)', () => {
  const order = ['u1', 'u2', 'u3', 'u4']
  const all = new Set(order)
  it('goes 1 → 2 → 3 → 4 → 1', () => {
    let rr = { lastUid: null as string | null, lastPos: -1 }
    const got: string[] = []
    for (let i = 0; i < 5; i++) {
      const next = pickNext(order, rr, all)!
      got.push(next.uid)
      rr = { lastUid: next.uid, lastPos: next.pos }
    }
    expect(got).toEqual(['u1', 'u2', 'u3', 'u4', 'u1'])
  })
  it('skips agents who are not checked in, and excluded agents', () => {
    expect(pickNext(order, { lastUid: 'u2', lastPos: 1 }, new Set(['u1', 'u2', 'u4']))?.uid).toBe('u4')
    expect(pickNext(order, { lastUid: 'u3', lastPos: 2 }, all, new Set(['u4']))?.uid).toBe('u1')
  })
  it('continues from the slot when the last agent was removed from the order', () => {
    expect(pickNext(['u1', 'u3', 'u4'], { lastUid: 'u2', lastPos: 1 }, all)?.uid).toBe('u4')
  })
  it('returns null when nobody is eligible', () => {
    expect(pickNext(order, { lastUid: null, lastPos: -1 }, new Set())).toBeNull()
  })
})

describe('pickFieldAgent (least active kW, never a previous agent)', () => {
  const agents = [
    { id: 'hassan', name: 'Hassan' },
    { id: 'faisal', name: 'Faisal' },
    { id: 'usaid', name: 'Usaid' },
  ]
  it('gives the visit to the agent with the least kW (Hassan 48 kW waits)', () => {
    const load = new Map([
      ['hassan', { kw: 48, visits: 3 }],
      ['faisal', { kw: 10, visits: 1 }],
      ['usaid', { kw: 10, visits: 2 }],
    ])
    expect(pickFieldAgent(agents, load, new Set())).toBe('faisal')
  })
  it('skips agents who already tried this customer', () => {
    expect(pickFieldAgent(agents, new Map(), new Set(['faisal', 'hassan']))).toBe('usaid')
    expect(pickFieldAgent(agents, new Map(), new Set(['faisal', 'hassan', 'usaid']))).toBeNull()
  })
})

describe('Sheet parsing', () => {
  it('parses CSV with quotes, commas and newlines', () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi"""\r\n1,2')).toEqual([['a', 'b'], ['x, y', 'he said "hi"'], ['1', '2']])
  })
  it('names blank and repeated headers without collisions', () => {
    expect(columnLetter(0)).toBe('A')
    expect(columnLetter(26)).toBe('AA')
    expect(nameBlankHeaders(['', 'Comment', 'Comment', ' '])).toEqual(['Column A', 'Comment', 'Comment (2)', 'Column D'])
  })
  it('reads the client Sheet dates (month/day/yy) and visit dates (day/month/yyyy) in PKT', () => {
    expect(parseSheetDate('10/3/26')?.toISOString()).toBe('2026-10-03T07:00:00.000Z')
    expect(parseSheetDate('27/08/2026')?.toISOString()).toBe('2026-08-27T07:00:00.000Z')
    expect(parseSheetDate('')).toBeUndefined()
  })
  it('maps Meta form answers, tolerating typos', () => {
    expect(parseFormAnswer('5_to_15_kw', SYSTEM_SIZE_RANGES)).toBe('5_to_15_kw')
    expect(parseFormAnswer('commercial_(office_/_shop_/_factory)', INSTALL_LOCATIONS)).toBe('commercial')
    expect(parseFormAnswer('within_a_monthwithin_7_to_15_days', INSTALL_TIMELINES)).toBe('within_7_to_15_days')
    expect(parseFormAnswer('syed', INSTALL_TIMELINES)).toBeUndefined()
  })
  it('extracts the spreadsheet id from a link', () => {
    expect(spreadsheetIdFrom('https://docs.google.com/spreadsheets/d/1Dg0Mw_x-y/edit?gid=1')).toBe('1Dg0Mw_x-y')
  })
})

describe('integrations', () => {
  it('verifies the Meta webhook signature over the raw body', () => {
    const body = '{"entry":[]}'
    const sig = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`
    expect(verifySignature(body, sig, 'secret')).toBe(true)
    expect(verifySignature(body, sig, 'other')).toBe(false)
    expect(verifySignature(body, null, 'secret')).toBe(false)
  })
  it('signs Cloudinary params in sorted order', () => {
    expect(signParams({ timestamp: 1, folder: 'x' }, 's')).toBe(signParams({ folder: 'x', timestamp: 1 }, 's'))
    expect(signParams({ folder: 'x', timestamp: 1 }, 's')).toMatch(/^[a-f0-9]{40}$/)
  })
  it('builds WhatsApp and dialer links', () => {
    expect(contactHref('phone_call', '+923001234567', 'hi')).toBe('tel:+923001234567')
    expect(contactHref('whatsapp_chat', '+923001234567', 'hi there')).toBe('https://wa.me/923001234567?text=hi%20there')
  })
})

describe('office hours (PKT)', () => {
  const hours = { start: '10:00', end: '19:00', days: [1, 2, 3, 4, 5, 6] }
  it('knows when the office is open', () => {
    expect(isOpen(new Date('2026-10-05T06:00:00Z'), hours)).toBe(true) // Mon 11:00 PKT
    expect(isOpen(new Date('2026-10-05T16:00:00Z'), hours)).toBe(false) // Mon 21:00 PKT
    expect(isOpen(new Date('2026-10-04T06:00:00Z'), hours)).toBe(false) // Sunday
  })
  it('night leads wait for the next morning', () => {
    expect(nextOpening(new Date('2026-10-05T16:00:00Z'), hours).toISOString()).toBe('2026-10-06T05:00:00.000Z')
    expect(nextOpening(new Date('2026-10-04T06:00:00Z'), hours).toISOString()).toBe('2026-10-05T05:00:00.000Z')
  })
})

describe('usernames are cleaned, not rejected', () => {
  it('turns what people type into a valid sign-in name', async () => {
    const { normalizeUsername, usernameProblem } = await import('@/lib/username')
    expect(normalizeUsername('Talha Khan')).toBe('talha.khan')
    expect(normalizeUsername('  WAJI_Ahmed ')).toBe('waji_ahmed')
    expect(normalizeUsername('Ali@123')).toBe('ali123')
    expect(normalizeUsername('..Sana..  Iqbal--')).toBe('sana.iqbal')
    expect(normalizeUsername('Muhammad Abdul Rehman Siddiqui Khan')).toHaveLength(30)
    expect(usernameProblem(normalizeUsername('a!'))).toMatch(/at least 3/)
    expect(usernameProblem('talha.khan')).toBeNull()
  })
})

describe('Sheet column-change guard', () => {
  it('stops only when a key column (phone / date / lead id) appears or disappears', async () => {
    const { keyColumnChange } = await import('@/domain/sheet-columns')
    const before = { phone: 'phone_number', submittedAt: 'created_time', name: 'full_name' }
    expect(keyColumnChange(undefined, { phone: 'x' })).toBeNull() // first sync
    expect(keyColumnChange(before, { phone: 'Phone Number', submittedAt: 'Date', name: 'Name' })).toBeNull() // renamed but still recognised
    expect(keyColumnChange(before, { phone: 'phone_number', submittedAt: 'created_time' })).toBeNull() // name lost: warning only
    expect(keyColumnChange(before, { phone: 'phone_number' })).toMatch(/"created_time" \(date\) is missing/)
    expect(keyColumnChange(before, { phone: 'phone_number', submittedAt: 'created_time', metaLeadId: 'id' })).toMatch(/new column "id"/)
  })
})

describe('lead journey (steps + what to do now)', () => {
  const label = { result: (r: string) => r, response: (r: string) => r, when: (iso: string) => iso.slice(0, 10) }
  it('walks Accept → Try 1–3 → Close → Manager check', async () => {
    const { leadJourney } = await import('@/domain/lead-journey')
    const base = { status: 'open' as const, closeReview: 'none', acceptWithinMin: 5, label: label as never }
    const notAccepted = leadJourney({ ...base, assignmentState: 'assigned', attempts: [], assignedAt: '2026-10-08T06:00:00Z' })
    expect(notAccepted.steps[0].state).toBe('current')
    expect(notAccepted.next.title).toMatch(/Accept this lead/)
    const first = leadJourney({ ...base, assignmentState: 'accepted', attempts: [] })
    expect(first.next.title).toMatch(/First contact/)
    expect(first.steps[1].state).toBe('current')
    const tries = [
      { tappedAt: '2026-10-06T06:00:00Z', loggedAt: '2026-10-06T06:01:00Z', result: 'no_answer' as const },
      { tappedAt: '2026-10-07T06:00:00Z', loggedAt: '2026-10-07T06:01:00Z', result: 'could_not_call' as const }, // not a try
      { tappedAt: '2026-10-07T07:00:00Z', loggedAt: '2026-10-07T07:01:00Z', cancelled: true }, // mistake, not a try
    ]
    const due = leadJourney({ ...base, assignmentState: 'accepted', attempts: tries, nextFollowUpAt: '2026-10-07T06:00:00Z', now: new Date('2026-10-08T06:00:00Z') })
    expect(due.tryNumber).toBe(2)
    expect(due.next.title).toMatch(/Try 2 of 3 is due now/)
    const later = leadJourney({ ...base, assignmentState: 'accepted', attempts: tries, nextFollowUpAt: '2026-10-10T06:00:00Z', now: new Date('2026-10-08T06:00:00Z') })
    expect(later.next.text).toMatch(/Nothing to do now/)
    const won = leadJourney({ ...base, status: 'won', closeReview: 'pending', assignmentState: 'accepted', attempts: tries })
    expect(won.steps.find((s) => s.key === 'close')?.state).toBe('done')
    expect(won.steps.find((s) => s.key === 'check')?.state).toBe('current')
    expect(won.next.title).toMatch(/Waiting for the manager/)
  })
})
