import { describe, expect, it } from 'vitest'
import { attemptOutcomeInput, contactInput, stageChangeInput, teamOrderInput, userCreateInput } from '@/domain/schemas'

const id = 'a'.repeat(24)
const id2 = 'b'.repeat(24)

describe('contactInput', () => {
  it('normalises phones to E.164', () => {
    const parsed = contactInput.parse({ name: 'Ali Khan', phone: '0300-1234567' })
    expect(parsed.phone).toBe('+923001234567')
    expect(parsed.type).toBe('individual')
  })
  it('rejects invalid phones', () => {
    expect(contactInput.safeParse({ name: 'Ali Khan', phone: '12345' }).success).toBe(false)
  })
})

describe('attemptOutcomeInput (PDF §9 two-step)', () => {
  const base = { attemptId: id, nextFollowUpAt: new Date(Date.now() + 86_400_000) }
  it('needs a response only when connected', () => {
    expect(attemptOutcomeInput.safeParse({ ...base, result: 'connected' }).success).toBe(false)
    expect(attemptOutcomeInput.safeParse({ ...base, result: 'connected', response: 'interested' }).success).toBe(true)
    expect(attemptOutcomeInput.safeParse({ ...base, result: 'no_answer', response: 'interested' }).success).toBe(false)
  })
  it('follow-up is optional (automatic plan) but must be within the next 30 days', () => {
    expect(attemptOutcomeInput.safeParse({ attemptId: id, result: 'no_answer' }).success).toBe(true)
    expect(attemptOutcomeInput.safeParse({ attemptId: id, result: 'no_answer', nextFollowUpAt: new Date(Date.now() + 40 * 86_400_000) }).success).toBe(false)
    expect(attemptOutcomeInput.safeParse({ attemptId: id, result: 'no_answer', nextFollowUpAt: new Date(Date.now() - 86_400_000) }).success).toBe(false)
  })
  it('closing a lead needs what the customer said; a sale needs its value', () => {
    expect(attemptOutcomeInput.safeParse({ attemptId: id, result: 'wrong_number' }).success).toBe(false)
    expect(attemptOutcomeInput.safeParse({ attemptId: id, result: 'wrong_number', remarks: 'number belongs to someone else' }).success).toBe(true)
    expect(attemptOutcomeInput.safeParse({ attemptId: id, result: 'connected', response: 'deal_won', remarks: 'agreed 10 kW' }).success).toBe(false)
    expect(attemptOutcomeInput.safeParse({ attemptId: id, result: 'connected', response: 'deal_won', remarks: 'agreed 10 kW', wonValuePkr: 1_500_000 }).success).toBe(true)
  })
})

describe('other inputs', () => {
  it('lost needs a reason', () => {
    expect(stageChangeInput.safeParse({ leadId: id, stage: 'lost' }).success).toBe(false)
    expect(stageChangeInput.safeParse({ leadId: id, stage: 'lost', lostReason: 'price' }).success).toBe(true)
  })
  it('team order cannot repeat an agent', () => {
    expect(teamOrderInput.safeParse({ teamId: id, memberOrder: [id2, id2] }).success).toBe(false)
  })
  it('agents need a department and a manager', () => {
    expect(userCreateInput.safeParse({ name: 'Ahmed Raza', email: 'a@b.co', role: 'agent' }).success).toBe(false)
    expect(userCreateInput.safeParse({ name: 'Ahmed Raza', email: 'a@b.co', role: 'agent', departmentId: id, managerId: id2 }).success).toBe(true)
    expect(userCreateInput.safeParse({ name: 'Owner', email: 'o@b.co', role: 'admin' }).success).toBe(true)
  })
})
