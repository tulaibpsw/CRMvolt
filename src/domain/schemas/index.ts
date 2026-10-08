/**
 * Zod input schemas — validate every Server Action / form / webhook input with these.
 * Enum values come from constants.ts; phones are normalised to E.164 here.
 */
import { z } from 'zod'
import {
  ATTEMPT_CHANNELS,
  CALL_RESULTS,
  CONTACT_TYPES,
  CUSTOMER_RESPONSES,
  DEFAULT_CONTACT_TYPE,
  DEPARTMENTS,
  LEAD_CHANNELS,
  LOST_REASONS,
  PROPERTY_TYPES,
  ROLES,
  ROOF_TYPES,
  SHADING_LEVELS,
  STAGES,
  TRADING_CUSTOMER_TYPES,
} from '@/domain/constants'
import { normalizePhone } from '@/lib/phone'

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')

/** Accepts any Pakistani/international format and outputs E.164. */
export const phoneInput = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const e164 = normalizePhone(value)
    if (!e164) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number, e.g. 0300 1234567' })
      return z.NEVER
    }
    return e164
  })

const optionalText = (max: number) => z.string().trim().max(max).optional()

export const contactInput = z.object({
  name: z.string().trim().min(2).max(80),
  phone: phoneInput,
  altPhones: z.array(phoneInput).max(3).default([]),
  whatsapp: phoneInput.optional(),
  email: z.email().optional(),
  city: optionalText(60),
  area: optionalText(80),
  address: optionalText(200),
  type: z.enum(CONTACT_TYPES).default(DEFAULT_CONTACT_TYPE),
})

export const leadQuickAddInput = contactInput.extend({
  department: z.enum(DEPARTMENTS),
  channel: z.enum(LEAD_CHANNELS).default('manual'),
  sourceDetail: optionalText(120),
  notes: optionalText(1000),
})

export const siteBasicsInput = z.object({
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  monthlyBillPkr: z.number().int().min(0).max(10_000_000).optional(),
  monthlyUnits: z.number().int().min(0).max(1_000_000).optional(),
  roofType: z.enum(ROOF_TYPES).optional(),
  shading: z.enum(SHADING_LEVELS).optional(),
  targetKw: z.number().min(0).max(1000).optional(),
  batteryRequired: z.boolean().optional(),
  netMeteringRequired: z.boolean().optional(),
})

export const tradingBasicsInput = z.object({
  customerType: z.enum(TRADING_CUSTOMER_TYPES).optional(),
  products: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
  quantity: z.number().int().min(0).max(100_000).optional(),
  deliveryCity: optionalText(60),
})

export const stageChangeInput = z
  .object({ leadId: objectId, stage: z.enum(STAGES), lostReason: z.enum(LOST_REASONS).optional() })
  .refine((v) => v.stage !== 'lost' || v.lostReason, { message: 'Choose why the lead was lost', path: ['lostReason'] })

export const attemptTapInput = z.object({ leadId: objectId, channel: z.enum(ATTEMPT_CHANNELS) })

/** PDF §9 two-step outcome: call result, then (only if connected) the customer's response. */
export const attemptOutcomeInput = z
  .object({
    attemptId: objectId,
    result: z.enum(CALL_RESULTS),
    response: z.enum(CUSTOMER_RESPONSES).optional(),
    remarks: optionalText(2000),
    /** Optional: empty = the automatic plan (1st call → +1 day → +3 days). Must be in the next 30 days. */
    nextFollowUpAt: z.coerce.date().optional(),
    durationSec: z.number().int().min(0).max(36_000).optional(),
    closeLead: z.boolean().default(false),
    /** Sale value when the customer said YES (deal_won). */
    wonValuePkr: z.number().int().min(1, 'Enter the sale value').max(1_000_000_000).optional(),
    leftAt: z.coerce.date().optional(),
    returnedAt: z.coerce.date().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.result === 'connected' && !v.response) ctx.addIssue({ code: 'custom', path: ['response'], message: 'What did the customer say?' })
    if (v.result !== 'connected' && v.response) ctx.addIssue({ code: 'custom', path: ['response'], message: 'Only for connected calls' })
    if (v.response === 'deal_won' && !v.wonValuePkr) ctx.addIssue({ code: 'custom', path: ['wonValuePkr'], message: 'Enter the sale value (PKR)' })
    const closing = v.closeLead || v.response === 'not_interested' || v.response === 'already_has_solar' || v.response === 'deal_won' || v.result === 'wrong_number'
    if (closing && (v.remarks ?? '').trim().length < 5) ctx.addIssue({ code: 'custom', path: ['remarks'], message: 'Write what the customer said (at least a few words)' })
    if (v.nextFollowUpAt) {
      const ms = v.nextFollowUpAt.getTime() - Date.now()
      if (ms < -5 * 60_000) ctx.addIssue({ code: 'custom', path: ['nextFollowUpAt'], message: 'The follow-up time is in the past' })
      if (ms > 30 * 86_400_000) ctx.addIssue({ code: 'custom', path: ['nextFollowUpAt'], message: 'Follow up within 30 days' })
    }
  })

export const followUpInput = z.object({ leadId: objectId, dueAt: z.coerce.date(), note: optionalText(500) })

export const teamSettingsInput = z.object({
  managerWindowMin: z.number().int().min(0).max(60),
  acceptWithinMin: z.number().int().min(1).max(120),
  contactWithinMin: z.number().int().min(5).max(240),
  maxPendingAccept: z.number().int().min(1).max(20),
  autoMoveOnAcceptTimeout: z.boolean(),
  paused: z.boolean(),
  requireCheckIn: z.boolean(),
  assignOutsideHours: z.boolean(),
})

export const teamOrderInput = z
  .object({ teamId: objectId, memberOrder: z.array(objectId).min(1) })
  .refine((v) => new Set(v.memberOrder).size === v.memberOrder.length, { message: 'An agent appears twice', path: ['memberOrder'] })

export const userCreateInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.email(),
    username: z.string().regex(/^[a-z0-9._-]{3,30}$/, 'Use 3–30 lowercase letters, numbers, . _ -').optional(),
    phone: phoneInput.optional(),
    role: z.enum(ROLES),
    departmentId: objectId.optional(),
    managerId: objectId.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role !== 'admin' && !v.departmentId) ctx.addIssue({ code: 'custom', path: ['departmentId'], message: 'Pick a department' })
    if (v.role === 'agent' && !v.managerId) ctx.addIssue({ code: 'custom', path: ['managerId'], message: 'Pick the manager' })
  })

export type ContactInput = z.infer<typeof contactInput>
export type LeadQuickAddInput = z.infer<typeof leadQuickAddInput>
export type SiteBasicsInput = z.infer<typeof siteBasicsInput>
export type TradingBasicsInput = z.infer<typeof tradingBasicsInput>
export type AttemptOutcomeInput = z.infer<typeof attemptOutcomeInput>
export type TeamSettingsInput = z.infer<typeof teamSettingsInput>
export type UserCreateInput = z.infer<typeof userCreateInput>
