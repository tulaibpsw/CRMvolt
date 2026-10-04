import 'server-only'
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
import { User } from '@/server/db/models'
import { ingestLead } from '@/server/services/ingest'
import { withLock } from '@/server/services/jobs'
import { getSetting, setSetting } from '@/server/services/settings'

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
  if (!res.ok) throw new Error(`Google Sheet tab "${tab}" could not be read (${res.status}). Share the Sheet as "Anyone with the link → Viewer".`)
  const text = await res.text()
  if (text.trimStart().startsWith('<')) throw new Error('Google returned a login page — share the Sheet as "Anyone with the link → Viewer".')
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
  missingRequired: string[]
}

/**
 * Pull new rows from every configured tab, from the saved cursor.
 * mode 'live'    → new leads go through round-robin assignment.
 * mode 'history' → import old rows quietly; the Sheet's "Call Agent" is matched to a CRM agent by first name.
 * mode 'skip'    → just move the cursor to the end (start fresh from now).
 */
export async function pullSheet(mode: 'live' | 'history' | 'skip' = 'live'): Promise<PullResult[] | null> {
  return withLock('sheet-pull', 120_000, async () => {
    await connectDb()
    const config = await getSetting('sheet_config')
    if (!config.spreadsheetId) return []
    const routing = await getSetting('routing')
    const agents = mode === 'history' ? await User.find({ role: 'agent', deletedAt: null }).select('_id name').lean() : []
    const agentByName = new Map(agents.map((a) => [a.name.split(' ')[0].toLowerCase(), String(a._id)]))
    const results: PullResult[] = []
    const cursor: SheetConfig['cursor'] = { ...config.cursor }

    for (const tab of config.tabs) {
      const { headers, rows } = await fetchTab(config.spreadsheetId, tab.name)
      const detection: ColumnDetection = detectColumns(headers, config.headerOverrides)
      const result: PullResult = { tab: tab.name, read: 0, created: 0, reinquiry: 0, skipped: 0, invalid: 0, missingRequired: detection.missingRequired }
      const start = mode === 'live' ? (cursor[tab.name] ?? 0) : 0
      if (mode === 'skip' || detection.missingRequired.length) {
        if (mode === 'skip') cursor[tab.name] = rows.length
        results.push(result)
        continue
      }
      for (let index = start; index < rows.length; index++) {
        const mapped = mapSheetRow(rows[index], detection)
        if (!mapped.fields.phone && !mapped.fields.whatsapp) continue // empty template row
        result.read++
        const submittedAt = parseSheetDate(mapped.fields.submittedAt)
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
        const department: Department | null = routeDepartment(mapped.fields, routing.keywords, tab.department) ?? routing.fallback
        const outcome = await ingestLead({
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
            rowKey: buildRowKey({ tab: tab.name, metaLeadId: mapped.fields.metaLeadId, phone: mapped.phone, submittedAt: mapped.fields.submittedAt }),
            metaLeadId: mapped.fields.metaLeadId?.replace(/^l:/i, ''),
            submittedAt,
            campaignName: mapped.fields.campaignName,
            adsetName: mapped.fields.adsetName,
            adName: mapped.fields.adName,
            formName: mapped.fields.formName,
            sheetTab: tab.name,
            sheetRow: index + 2,
          },
          site,
          extra: { ...mapped.extra, ...unmatched, ...(mapped.fields.status ? { 'Lead Status (Sheet)': mapped.fields.status } : {}), ...(mapped.fields.agentName ? { 'Call Agent (Sheet)': mapped.fields.agentName } : {}) },
          notes: mapped.fields.notes,
          receivedAt: submittedAt,
          agentId: mode === 'history' ? (agentByName.get((mapped.fields.agentName ?? '').trim().split(' ')[0].toLowerCase()) ?? null) : null,
          quiet: mode === 'history',
        })
        if (outcome.status === 'created') result.created++
        else if (outcome.status === 'reinquiry') result.reinquiry++
        else if (outcome.status === 'invalid_phone') result.invalid++
        else result.skipped++
      }
      cursor[tab.name] = rows.length
      results.push(result)
    }
    await setSetting('sheet_config', { ...config, cursor })
    return results
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
