import { parsePhoneNumberFromString } from 'libphonenumber-js'

export const DEFAULT_COUNTRY = 'PK' as const
export const E164_PATTERN = /^\+[1-9]\d{7,14}$/

/** Normalise any input ("0300-1234567", "+92 300 1234567", "0092…") to E.164, or null if it is not a valid number. */
export function normalizePhone(input: string | null | undefined): string | null {
  const cleaned = input?.trim()
  if (!cleaned) return null
  const withPlus = cleaned.startsWith('00') ? `+${cleaned.slice(2)}` : cleaned
  const parsed = parsePhoneNumberFromString(withPlus, DEFAULT_COUNTRY)
  if (!parsed || !parsed.isValid()) return null
  return parsed.number
}

export function isE164(value: unknown): value is string {
  return typeof value === 'string' && E164_PATTERN.test(value)
}

/** "+923001234567" → "0300 1234567" for Pakistani numbers; international format otherwise. */
export function formatPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164)
  if (!parsed) return e164
  return parsed.country === DEFAULT_COUNTRY ? parsed.formatNational() : parsed.formatInternational()
}

/** "+923001234567" → "0300 •••• 567" (used when phone masking is on for agents). */
export function maskPhone(e164: string): string {
  const digits = formatPhone(e164).replace(/\D/g, '')
  if (digits.length < 7) return formatPhone(e164)
  return `${digits.slice(0, 4)} •••• ${digits.slice(-3)}`
}

/** Digits for wa.me / intent links: "+923001234567" → "923001234567". */
export function toWhatsAppDigits(e164: string): string {
  return e164.replace(/^\+/, '')
}
