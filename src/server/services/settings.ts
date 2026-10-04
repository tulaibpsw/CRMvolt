import 'server-only'
import { DEPARTMENTS, type Department, type SettingKey } from '@/domain/constants'
import type { SheetConfig } from '@/domain/sheet-columns'
import { pktParts } from '@/lib/dates-pkt'
import { connectDb } from '@/server/db/connection'
import { Setting } from '@/server/db/models'

export interface WorkingHours {
  start: string // "10:00" PKT
  end: string // "19:00" PKT
  days: number[] // 0 = Sunday
}

export interface RoutingConfig {
  keywords: Record<Department, string[]>
  /** Where leads go when nothing matches (null = admin "Unrouted" queue). */
  fallback: Department | null
}

interface SettingTypes {
  working_hours: WorkingHours
  sheet_config: SheetConfig
  routing: RoutingConfig
}

const DEFAULTS: SettingTypes = {
  working_hours: { start: '10:00', end: '19:00', days: [1, 2, 3, 4, 5, 6] },
  sheet_config: { spreadsheetId: '', tabs: [{ name: 'Leads', department: 'INSTALLATION' }], headerOverrides: {}, cursor: {} },
  routing: {
    keywords: { INSTALLATION: ['install', 'home', 'net metering', 'video', 'kw'], TRADING: ['panel', 'inverter', 'battery', 'wholesale', 'dealer'] },
    fallback: 'INSTALLATION',
  },
}

export async function getSetting<K extends keyof SettingTypes>(key: K): Promise<SettingTypes[K]> {
  await connectDb()
  const doc = await Setting.findOne({ key }).lean()
  return { ...DEFAULTS[key], ...((doc?.value as object) ?? {}) } as SettingTypes[K]
}

export async function setSetting(key: SettingKey, value: unknown, userId?: string): Promise<void> {
  await connectDb()
  await Setting.updateOne({ key }, { $set: { value, updatedBy: userId ?? null } }, { upsert: true })
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Is the office open at this instant (Pakistan time)? */
export function isOpen(date: Date, hours: WorkingHours): boolean {
  const p = pktParts(date)
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
  const minutes = p.hour * 60 + p.minute
  return hours.days.includes(weekday) && minutes >= toMinutes(hours.start) && minutes < toMinutes(hours.end)
}

/** Now if open, otherwise the next opening time (night/holiday leads wait for the morning). */
export function nextOpening(date: Date, hours: WorkingHours): Date {
  if (isOpen(date, hours)) return date
  for (let d = 0; d < 8; d++) {
    const p = pktParts(new Date(date.getTime() + d * 86_400_000))
    const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
    if (!hours.days.includes(weekday)) continue
    const start = toMinutes(hours.start)
    const opening = new Date(Date.UTC(p.year, p.month - 1, p.day, Math.floor(start / 60) - 5, start % 60))
    if (opening > date) return opening
  }
  return date
}

export const ALL_DEPARTMENTS = DEPARTMENTS
