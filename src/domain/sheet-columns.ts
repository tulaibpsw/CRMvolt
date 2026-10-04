/**
 * Google Sheet → lead mapping. Works with ANY Sheet layout:
 *  1. Admin overrides (Settings → sheet_config.headerOverrides) win: header → field, or 'ignore'.
 *  2. Otherwise headers are auto-detected from common spellings (incl. Meta Lead Ads export headers
 *     and Meta form questions like "what_is_your_monthly_electricity_bill?").
 *  3. Every other column is kept as-is in lead.extra (dynamic columns) — nothing is lost.
 * Pure functions: no I/O, used by the Sheet pull (M3) and the column-mapping screen.
 */
import { createHash } from 'node:crypto'
import { SHEET_LEAD_FIELDS, type Department, type SheetLeadField } from '@/domain/constants'
import { normalizePhone } from '@/lib/phone'

export type SheetRow = Record<string, string | number | boolean | null | undefined>
export type HeaderOverride = SheetLeadField | 'ignore'

/** Lowercase, keep letters/digits only: "Phone Number" / "phone_number" / "Phone-No." → "phonenumber". */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Exact (normalised) header spellings per field. Add spellings here when a client Sheet uses a new one. */
const EXACT: Record<SheetLeadField, string[]> = {
  metaLeadId: ['id', 'leadid', 'metaleadid', 'fbleadid', 'facebookleadid'],
  submittedAt: ['createdtime', 'createdat', 'created', 'date', 'datetime', 'timestamp', 'submittedat', 'submittedon', 'leaddate', 'time'],
  name: ['fullname', 'name', 'customername', 'clientname', 'leadname', 'firstname'],
  phone: ['phonenumber', 'phone', 'phoneno', 'mobile', 'mobilenumber', 'mobileno', 'contact', 'contactnumber', 'contactno', 'cell', 'cellnumber', 'number'],
  altPhone: ['alternatephone', 'alternatenumber', 'otherphone', 'phone2', 'secondaryphone', 'altphone'],
  whatsapp: ['whatsapp', 'whatsappnumber', 'whatsappno'],
  email: ['email', 'emailaddress', 'mail'],
  city: ['city', 'location', 'citylocation', 'yourcity'],
  area: ['area', 'town', 'sector', 'society', 'locality'],
  address: ['address', 'streetaddress', 'fulladdress', 'siteaddress'],
  department: ['department', 'dept', 'leadtype', 'category', 'service', 'interest'],
  campaignId: ['campaignid'],
  campaignName: ['campaignname', 'campaign'],
  adsetId: ['adsetid'],
  adsetName: ['adsetname', 'adset'],
  adId: ['adid'],
  adName: ['adname', 'ad'],
  formId: ['formid'],
  formName: ['formname', 'form'],
  platform: ['platform', 'source', 'leadsource'],
  isOrganic: ['isorganic', 'organic'],
  monthlyBillPkr: ['monthlybill', 'electricitybill', 'bill', 'averagebill', 'monthlyelectricitybill'],
  monthlyUnits: ['monthlyunits', 'units', 'unitsconsumed'],
  targetKw: ['systemsize', 'requiredsystemsize', 'kw', 'systemsizekw', 'capacity'],
  propertyType: ['propertytype', 'property', 'buildingtype'],
  notes: ['notes', 'note', 'remark', 'message', 'comments', 'comment', 'remarks', 'requirement', 'requirements', 'details'],
  agentName: ['agent', 'agentname', 'callagent', 'assignedto', 'salesperson', 'calledby'],
  status: ['status', 'leadstatus', 'callstatus', 'response'],
  systemSizeRange: ['systemsizerange', 'solarsize', 'whatsizesolarsystemareyouplanningtoinstall'],
  installLocation: ['installlocation', 'wheredoyouwanttoinstallasolarsystem'],
  installTimeline: ['installtimeline', 'whendoyouplantoinstallthesolarsystem'],
}

/** Fallback for long Meta form questions: header contains ALL words of one rule. Checked in order. */
const CONTAINS: [SheetLeadField, string[]][] = [
  ['systemSizeRange', ['size', 'solar']],
  ['installLocation', ['where', 'install']],
  ['installTimeline', ['when', 'install']],
  ['monthlyBillPkr', ['bill']],
  ['monthlyUnits', ['unit']],
  ['targetKw', ['kw']],
  ['targetKw', ['system', 'size']],
  ['whatsapp', ['whatsapp']],
  ['phone', ['phone']],
  ['phone', ['mobile']],
  ['city', ['city']],
  ['email', ['email']],
  ['propertyType', ['property']],
  ['name', ['name']],
]

const exactLookup = new Map<string, SheetLeadField>(
  SHEET_LEAD_FIELDS.flatMap((field) => EXACT[field].map((spelling): [string, SheetLeadField] => [spelling, field])),
)

export interface ColumnDetection {
  /** header (as written in the Sheet) → field */
  mapping: Record<string, SheetLeadField>
  /** headers kept in lead.extra */
  dynamic: string[]
  ignored: string[]
  /** required fields with no column — the import cannot run until fixed */
  missingRequired: SheetLeadField[]
}


/** Spreadsheet column letter: 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/**
 * Make every header unique and non-empty: blank → 'Column A' / 'Column AB' (by position),
 * repeated → 'Comment', 'Comment (2)', 'Comment (3)' — so no column overwrites another.
 */
export function nameBlankHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>()
  return headers.map((h, i) => {
    const base = h.trim() ? h.trim() : `Column ${columnLetter(i)}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base} (${n})`
  })
}

/** 'Column A' is the date in the client's Leads tab. */
export const DEFAULT_HEADER_OVERRIDES: Record<string, HeaderOverride> = { 'Column A': 'submittedAt' }

export function detectColumns(headers: string[], overrides: Record<string, HeaderOverride> = {}): ColumnDetection {
  const mapping: Record<string, SheetLeadField> = {}
  const taken = new Set<SheetLeadField>()
  const dynamic: string[] = []
  const ignored: string[] = []

  // Pass 1: overrides and exact matches. Pass 2: "contains" rules for whatever is left.
  const pending: string[] = []
  for (const header of headers) {
    if (!header.trim()) continue
    const override = overrides[header]
    if (override === 'ignore') {
      ignored.push(header)
      continue
    }
    const field = override ?? DEFAULT_HEADER_OVERRIDES[header] ?? exactLookup.get(normalizeHeader(header))
    if (field && !taken.has(field)) {
      mapping[header] = field
      taken.add(field)
    } else pending.push(header)
  }
  for (const header of pending) {
    const words = header.toLowerCase()
    const rule = CONTAINS.find(([field, parts]) => !taken.has(field) && parts.every((p) => words.includes(p)))
    if (rule) {
      mapping[header] = rule[0]
      taken.add(rule[0])
    } else dynamic.push(header)
  }
  return { mapping, dynamic, ignored, missingRequired: taken.has('phone') || taken.has('whatsapp') ? [] : ['phone'] }
}

export interface MappedSheetRow {
  fields: Partial<Record<SheetLeadField, string>>
  /** normalised E.164 phone, or null when the row has no valid phone */
  phone: string | null
  /** dynamic columns, by original header */
  extra: Record<string, string>
}

const clean = (value: SheetRow[string]): string => (value === null || value === undefined ? '' : String(value).trim())

export function mapSheetRow(row: SheetRow, detection: ColumnDetection): MappedSheetRow {
  const fields: Partial<Record<SheetLeadField, string>> = {}
  for (const [header, field] of Object.entries(detection.mapping)) {
    const value = clean(row[header])
    if (value) fields[field] = value
  }
  const extra: Record<string, string> = {}
  for (const header of detection.dynamic) {
    const value = clean(row[header])
    if (value) extra[header] = value
  }
  // Meta exports phones like "p:+923001234567".
  const phone = normalizePhone((fields.phone ?? fields.whatsapp)?.replace(/^p:/i, '') ?? null)
  return { fields, phone, extra }
}

/** Pick the department from a Sheet value or campaign/form/ad names using each department's routing keywords. */
export function routeDepartment(
  fields: Partial<Record<SheetLeadField, string>>,
  keywords: Record<Department, string[]>,
  tabDepartment?: Department,
): Department | null {
  if (tabDepartment) return tabDepartment
  const haystack = [fields.department, fields.campaignName, fields.formName, fields.adName, fields.adsetName, fields.notes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  if (!haystack) return null
  for (const [department, words] of Object.entries(keywords) as [Department, string[]][]) {
    if (department.toLowerCase() === (fields.department ?? '').toLowerCase()) return department
    if (words.some((word) => haystack.includes(word.toLowerCase()))) return department
  }
  return null
}

/** Unique, stable key per Sheet row (the real duplicate guard): Meta lead ID, else hash of tab + phone + time. */
export function buildRowKey(input: { tab: string; metaLeadId?: string; phone: string | null; submittedAt?: string }): string {
  if (input.metaLeadId) return `meta:${input.metaLeadId.replace(/^l:/i, '')}`
  const raw = [input.tab, input.phone ?? '', input.submittedAt ?? ''].join('|')
  return `row:${createHash('sha256').update(raw).digest('hex').slice(0, 32)}`
}

/** Shape of settings.sheet_config (edited on the admin Sheet screen in M3). */
export interface SheetConfig {
  spreadsheetId: string
  tabs: { name: string; department?: Department }[]
  headerOverrides: Record<string, HeaderOverride>
  /** last processed row per tab */
  cursor: Record<string, number>
}

/** Map a Meta form answer to our enum (tolerant of typos like "within_a_monthwithin_7_to_15_days"). */
export function parseFormAnswer<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  if (!value) return undefined
  const v = value.toLowerCase().replace(/\s+/g, '_')
  if ((allowed as readonly string[]).includes(v)) return v as T
  if (v.startsWith('commercial')) return allowed.find((a) => a === 'commercial')
  return allowed.find((a) => v.includes(a))
}

/** Sheet dates: "10/3/26" (month/day/year, Google) or "27/08/2026" (day > 12 → day/month/year) or ISO. Times in PKT. */
export function parseSheetDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?)?$/i.exec(value.trim())
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    const [month, day] = a > 12 ? [b, a] : [a, b]
    let hour = m[4] ? Number(m[4]) : 12
    if (m[6]?.toLowerCase() === 'pm' && hour < 12) hour += 12
    if (m[6]?.toLowerCase() === 'am' && hour === 12) hour = 0
    const date = new Date(Date.UTC(year, month - 1, day, hour - 5, m[5] ? Number(m[5]) : 0))
    return Number.isNaN(date.getTime()) ? undefined : date
  }
  const iso = new Date(value)
  return Number.isNaN(iso.getTime()) ? undefined : iso
}
