/**
 * Pakistan-time helpers. Servers run in UTC — always format and bucket dates through these,
 * never with getHours()/toLocale*(). Output is identical on server and client (no hydration drift).
 */
import { PK_TIMEZONE } from '@/domain/constants'
import { en } from '@/i18n/en'

export interface PktParts {
  year: number
  month: number // 1-12
  day: number
  hour: number // 0-23
  minute: number
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: PK_TIMEZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
})

const pad = (n: number) => String(n).padStart(2, '0')

export function pktParts(date: Date): PktParts {
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).map((p) => [p.type, p.value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  }
}

/** Pakistan calendar date as YYYY-MM-DD (attendance key, progress folder names). */
export function pktDateKey(date: Date): string {
  const p = pktParts(date)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** "10:32 AM" */
export function formatPktTime(date: Date): string {
  const p = pktParts(date)
  const hour12 = p.hour % 12 || 12
  return `${hour12}:${pad(p.minute)} ${p.hour < 12 ? en.dates.am : en.dates.pm}`
}

/** "30 Sep 2026" */
export function formatPktDate(date: Date): string {
  const p = pktParts(date)
  return `${p.day} ${en.dates.monthsShort[p.month - 1]} ${p.year}`
}

/** "30 Sep, 10:32 AM" (PDF §6 style) */
export function formatPktDateTime(date: Date): string {
  const p = pktParts(date)
  return `${p.day} ${en.dates.monthsShort[p.month - 1]}, ${formatPktTime(date)}`
}
