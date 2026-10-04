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
  notes: ['notes', 'note', 'message', 'comments', 'comment', 'remarks', 'requirement', 'requirements', 'details'],
  agentName: ['agent', 'agentname', 'assignedto', 'salesperson', 'calledby'],
  status: ['status', 'leadstatus', 'callstatus', 'response'],
}

/** Fallback for long Meta form questions: header contains ALL words of one rule. Checked in order. */
const CONTAINS: [SheetLeadField, string[]][] = [
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

export const REQUIRED_SHEET_FIELDS: readonly SheetLeadField[] = ['phone']

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
    const field = override ?? exactLookup.get(normalizeHeader(header))
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
  return { mapping, dynamic, ignored, missingRequired: REQUIRED_SHEET_FIELDS.filter((f) => !taken.has(f)) }
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
  const phone = normalizePhone(fields.phone?.replace(/^p:/i, '') ?? null)
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
