import 'server-only'
import { UserError } from '@/server/services/common'
import { INSTALL_LOCATIONS, INSTALL_TIMELINES, SYSTEM_SIZE_RANGES, type Department } from '@/domain/constants'
import {
  buildRowKey,
  detectColumns,
  mapSheetRow,
  nameBlankHeaders,
  parseFormAnswer,
  parseSheetDate,
  routeDepartment,
  type ColumnDetection,
  type SheetConfig,
} from '@/domain/sheet-columns'
import { connectDb } from '@/server/db/connection'
import { Lead, SheetRow, User } from '@/server/db/models'
import { ingestLead } from '@/server/services/ingest'
import { withLock } from '@/server/services/jobs'
import { getSetting, type RoutingConfig } from '@/server/services/settings'

/** Small RFC-4180 CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

/** Extract the spreadsheet id from a full Google Sheets link, or accept a bare id. */
export function spreadsheetIdFrom(input: string): string {
  return /\/d\/([a-zA-Z0-9-_]+)/.exec(input)?.[1] ?? input.trim()
}

/**
 * Reads a tab as CSV. Works when the Sheet is shared "Anyone with the link → Viewer" (no Google keys needed).
 * headers=1 stops Google from merging the first rows into the header.
 */
export async function fetchTab(spreadsheetId: string, tab: string): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new UserError(`Google Sheet tab "${tab}" could not be read (${res.status}). Share the Sheet as "Anyone with the link → Viewer".`)
  const text = await res.text()
  if (text.trimStart().startsWith('<')) throw new UserError('Google returned a login page — share the Sheet as "Anyone with the link → Viewer".')
  const [head = [], ...body] = parseCsv(text)
  const headers = nameBlankHeaders(head)
  const rows = body.map((cells) => Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? '').trim()])))
  return { headers, rows }
}

export interface PullResult {
  tab: string
  read: number
  created: number
  reinquiry: number
  skipped: number
  invalid: number
  failed: number
  missingRequired: string[]
  /** Live pull on a tab that was never started: nothing imported until an admin picks "history" or "start from now". */
  needsStart: boolean
  errors: string[]
}

const MAX_TRIES = 3

/**
 * Pull every configured tab. Rows are tracked by rowKey in `sheetrows`, so deleted, sorted or late-filled rows never
 * lose leads, and one bad row never blocks the others (it is retried, then reported).
 * mode 'live'    → new rows go through round-robin assignment.
 * mode 'history' → import old rows quietly; the Sheet's "Call Agent" is matched to a CRM agent.
 * mode 'skip'    → mark every current row as handled (start fresh from now).
 */
export async function pullSheet(mode: 'live' | 'history' | 'skip' = 'live'): Promise<PullResult[] | null> {
  return withLock('sheet-pull', 120_000, async () => {
    await connectDb()
    const config = await getSetting('sheet_config')
    if (!config.spreadsheetId) return []
    const routing = await getSetting('routing')
    const agents = mode === 'history' ? await User.find({ role: 'agent', isActive: true, deletedAt: null }).select('_id name').lean() : []
    const results: PullResult[] = []

    for (const tab of config.tabs) {
      const { headers, rows } = await fetchTab(config.spreadsheetId, tab.name)
      const detection: ColumnDetection = detectColumns(headers, config.headerOverrides)
      const result: PullResult = { tab: tab.name, read: 0, created: 0, reinquiry: 0, skipped: 0, invalid: 0, failed: 0, missingRequired: detection.missingRequired, needsStart: false, errors: [] }
      results.push(result)
      if (detection.missingRequired.length) continue

      const known = new Map<string, { status: string; tries: number }>()
      for (const r of await SheetRow.find({ tab: tab.name }).select('rowKey status tries').lean()) known.set(r.rowKey, { status: r.status, tries: r.tries })
      // Leads imported before row tracking existed also count as known.
      for (const l of await Lead.find({ 'source.sheetTab': tab.name, 'source.rowKey': { $ne: null } }).select('source.rowKey').lean()) {
        const key = l.source?.rowKey
        if (key && !known.has(key)) known.set(key, { status: 'ingested', tries: 0 })
      }
      if (mode === 'live' && known.size === 0 && rows.length > 0) {
        result.needsStart = true
        continue
      }

      for (let index = 0; index < rows.length; index++) {
        const mapped = mapSheetRow(rows[index], detection)
        if (!mapped.fields.phone && !mapped.fields.whatsapp) continue // empty row — picked up later when filled
        const rowKey = buildRowKey({ tab: tab.name, metaLeadId: mapped.fields.metaLeadId, phone: mapped.phone, submittedAt: mapped.fields.submittedAt })
        const seen = known.get(rowKey)
        if (seen && (seen.status !== 'failed' || seen.tries >= MAX_TRIES)) continue
        if (mode === 'skip') {
          await SheetRow.updateOne({ rowKey }, { $set: { tab: tab.name, status: 'skipped', sheetRow: index + 2 } }, { upsert: true })
          known.set(rowKey, { status: 'skipped', tries: 0 })
          result.skipped++
          continue
        }
        result.read++
        try {
          const outcome = await ingestRow(mapped, { tab, rowKey, index, mode, routing, agents })
          if (outcome.status === 'created') result.created++
          else if (outcome.status === 'reinquiry') result.reinquiry++
          else if (outcome.status === 'invalid_phone') result.invalid++
          else result.skipped++
          await SheetRow.updateOne({ rowKey }, { $set: { tab: tab.name, status: 'ingested', leadId: 'leadId' in outcome ? outcome.leadId : null, sheetRow: index + 2, error: null } }, { upsert: true })
          known.set(rowKey, { status: 'ingested', tries: 0 })
        } catch (error) {
          result.failed++
          const message = error instanceof Error ? error.message : String(error)
          if (result.errors.length < 5) result.errors.push(`Row ${index + 2}: ${message.slice(0, 120)}`)
          console.error('[sheet-pull]', tab.name, index + 2, message)
          await SheetRow.updateOne({ rowKey }, { $set: { tab: tab.name, status: 'failed', error: message.slice(0, 300), sheetRow: index + 2 }, $inc: { tries: 1 } }, { upsert: true })
        }
      }
    }
    return results
  })
}

type Mapped = ReturnType<typeof mapSheetRow>
interface RowContext {
  tab: SheetConfig['tabs'][number]
  rowKey: string
  index: number
  mode: 'live' | 'history'
  routing: RoutingConfig
  agents: { _id: unknown; name: string }[]
}

/** History import: full name first, then first name only when exactly one active agent has it. */
export function matchAgent(sheetName: string | undefined, agents: { _id: unknown; name: string }[]): string | null {
  const clean = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ')
  const name = clean(sheetName ?? '')
  if (!name) return null
  const full = agents.filter((a) => clean(a.name) === name)
  if (full.length === 1) return String(full[0]._id)
  const first = name.split(' ')[0]
  const byFirst = agents.filter((a) => clean(a.name).split(' ')[0] === first)
  return byFirst.length === 1 ? String(byFirst[0]._id) : null
}

async function ingestRow(mapped: Mapped, ctx: RowContext) {
  const submittedAt = parseSheetDate(mapped.fields.submittedAt)
  const department: Department | null = routeDepartment(mapped.fields, ctx.routing.keywords, ctx.tab.department) ?? ctx.routing.fallback
  const site = {
    systemSizeRange: parseFormAnswer(mapped.fields.systemSizeRange, SYSTEM_SIZE_RANGES),
    installLocation: parseFormAnswer(mapped.fields.installLocation, INSTALL_LOCATIONS),
    installTimeline: parseFormAnswer(mapped.fields.installTimeline, INSTALL_TIMELINES),
  }
  // A form answer we do not recognise is kept as text, never dropped.
  const unmatched: Record<string, string> = {}
  for (const key of ['systemSizeRange', 'installLocation', 'installTimeline'] as const) {
    const raw = mapped.fields[key]
    if (raw && !site[key]) unmatched[`${key} (Sheet)`] = raw
  }
  return ingestLead({
    name: mapped.fields.name ?? '',
    phone: mapped.phone ?? '',
    whatsapp: mapped.fields.whatsapp,
    altPhones: mapped.fields.altPhone ? [mapped.fields.altPhone] : [],
    email: mapped.fields.email,
    city: mapped.fields.city,
    area: mapped.fields.area,
    address: mapped.fields.address,
    department,
    channel: 'sheet',
    source: {
      rowKey: ctx.rowKey,
      metaLeadId: mapped.fields.metaLeadId?.replace(/^l:/i, ''),
      submittedAt,
      campaignName: mapped.fields.campaignName,
      adsetName: mapped.fields.adsetName,
      adName: mapped.fields.adName,
      formName: mapped.fields.formName,
      sheetTab: ctx.tab.name,
      sheetRow: ctx.index + 2,
    },
    site,
    extra: { ...mapped.extra, ...unmatched, ...(mapped.fields.status ? { 'Lead Status (Sheet)': mapped.fields.status } : {}), ...(mapped.fields.agentName ? { 'Call Agent (Sheet)': mapped.fields.agentName } : {}) },
    notes: mapped.fields.notes,
    receivedAt: submittedAt,
    agentId: ctx.mode === 'history' ? matchAgent(mapped.fields.agentName, ctx.agents) : null,
    quiet: ctx.mode === 'history',
  })
}

/** For the settings screen: headers + how each column will be used. */
export async function previewSheet(): Promise<{ tab: string; detection: ColumnDetection; sample: Record<string, string>[]; rows: number }[]> {
  const config = await getSetting('sheet_config')
  if (!config.spreadsheetId) return []
  const out = []
  for (const tab of config.tabs) {
    const { headers, rows } = await fetchTab(config.spreadsheetId, tab.name)
    out.push({ tab: tab.name, detection: detectColumns(headers, config.headerOverrides), sample: rows.slice(0, 3), rows: rows.length })
  }
  return out
}
