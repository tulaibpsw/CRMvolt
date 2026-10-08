import 'server-only'
import { notify, UserError } from '@/server/services/common'
import { INSTALL_LOCATIONS, INSTALL_TIMELINES, SYSTEM_SIZE_RANGES, type Department, type SheetLeadField } from '@/domain/constants'
import {
  buildRowKey,
  detectColumns,
  keyColumnChange,
  mapSheetRow,
  nameBlankHeaders,
  parseFormAnswer,
  parseSheetDate,
  type ColumnDetection,
  type SheetSource,
  type SheetTabStatus,
} from '@/domain/sheet-columns'
import { connectDb } from '@/server/db/connection'
import { Department as DepartmentModel, Lead, Setting, SheetRow, User } from '@/server/db/models'
import { managersOf } from '@/server/services/assignment'
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
  if (!res.ok) throw new UserError(`Google Sheet tab "${tab}" could not be read (${res.status}). Share the Sheet as "Anyone with the link → Viewer".`)
  const text = await res.text()
  if (text.trimStart().startsWith('<')) throw new UserError('Google returned a login page — share the Sheet as "Anyone with the link → Viewer".')
  const [head = [], ...body] = parseCsv(text)
  const headers = nameBlankHeaders(head)
  const rows = body.map((cells) => Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? '').trim()])))
  return { headers, rows }
}

// ── Connected sheets (one or more per department) ──

/** All connected sheets. The old single-sheet setup is shown as one "Main sheet" per tab until it is edited. */
export async function getSheetSources(): Promise<SheetSource[]> {
  const config = await getSetting('sheet_config')
  if (Array.isArray(config.sources)) return config.sources
  if (!config.spreadsheetId) return []
  const routing = await getSetting('routing')
  const byDept = new Map<Department, string[]>()
  for (const tab of config.tabs) {
    const dept = tab.department ?? routing.fallback ?? 'INSTALLATION'
    byDept.set(dept, [...(byDept.get(dept) ?? []), tab.name])
  }
  return [...byDept.entries()].map(([department, tabs], i) => ({
    id: i === 0 ? 'legacy' : `legacy-${department.toLowerCase()}`,
    name: 'Main sheet',
    department,
    spreadsheetId: config.spreadsheetId,
    tabs,
    headerOverrides: config.headerOverrides ?? {},
    createdBy: null,
  }))
}

export async function saveSheetSources(sources: SheetSource[], actorId: string): Promise<void> {
  const config = await getSetting('sheet_config')
  await setSetting('sheet_config', { ...config, sources }, /^[a-f0-9]{24}$/.test(actorId) ? actorId : undefined)
}

/** Name stored on SheetRow.tab / lead.source.sheetTab (the old setup keeps the plain tab name so its rows stay known). */
export function rowTab(source: Pick<SheetSource, 'id'>, tab: string): string {
  return source.id.startsWith('legacy') ? tab : `${source.id}/${tab}`
}

/** Key in settings.sheet_status (no dots or $ — they are not allowed in MongoDB field names). */
export function statusKey(source: Pick<SheetSource, 'id'>, tab: string): string {
  return `${source.id}__${tab}`.replace(/[.$]/g, '_')
}

async function saveTabStatus(key: string, status: SheetTabStatus): Promise<void> {
  await Setting.updateOne({ key: 'sheet_status' }, { $set: { [`value.${key}`]: status } }, { upsert: true })
}

export interface PullResult {
  sourceId: string
  sourceName: string
  department: Department
  tab: string
  read: number
  created: number
  reinquiry: number
  skipped: number
  invalid: number
  failed: number
  missingRequired: string[]
  /** Live pull on a tab that was never started: nothing imported until someone picks "history" or "start from now". */
  needsStart: boolean
  /** Key columns changed: the pull is stopped for this tab (see keyColumnChange). */
  problem: string | null
  errors: string[]
}

const MAX_TRIES = 3
const FIELD_NAMES: Partial<Record<SheetLeadField, string>> = { name: 'customer name', city: 'city', campaignName: 'campaign' }

export interface PullFilter {
  sourceId?: string
  department?: Department
}

/**
 * Pull connected sheets. Rows are tracked by key in `sheetrows`, so deleted, sorted or late-filled rows never lose
 * leads, and one bad row never blocks the others (it is retried, then reported).
 * mode 'live'    → new rows go through round-robin assignment.
 * mode 'history' → import old rows quietly; the Sheet's "Call Agent" is matched to a CRM agent.
 * mode 'skip'    → mark every current row as handled and accept the current columns ("start / use new columns from now").
 */
export async function pullSheet(mode: 'live' | 'history' | 'skip' = 'live', filter: PullFilter = {}): Promise<PullResult[] | null> {
  return withLock('sheet-pull', 120_000, async () => {
    await connectDb()
    const sources = (await getSheetSources()).filter((s) => (!filter.sourceId || s.id === filter.sourceId) && (!filter.department || s.department === filter.department))
    if (!sources.length) return []
    const statuses = await getSetting('sheet_status')
    const agents = mode === 'history' ? await User.find({ role: 'agent', isActive: true, deletedAt: null }).select('_id name departmentId').lean() : []
    const results: PullResult[] = []

    for (const source of sources) {
      for (const tabName of source.tabs) {
        const tab = rowTab(source, tabName)
        const sKey = statusKey(source, tabName)
        const previous = statuses[sKey]
        const result: PullResult = { sourceId: source.id, sourceName: source.name, department: source.department, tab: tabName, read: 0, created: 0, reinquiry: 0, skipped: 0, invalid: 0, failed: 0, missingRequired: [], needsStart: false, problem: null, errors: [] }
        results.push(result)
        let headers: string[]
        let rows: Record<string, string>[]
        try {
          ;({ headers, rows } = await fetchTab(source.spreadsheetId, tabName))
        } catch (error) {
          result.problem = error instanceof Error ? error.message : 'The sheet could not be read'
          await recordProblem(source, tabName, sKey, previous, result.problem, 0)
          continue
        }
        const detection: ColumnDetection = detectColumns(headers, source.headerOverrides)
        const fieldHeaders = Object.fromEntries(Object.entries(detection.mapping).map(([h, f]) => [f, h])) as Partial<Record<SheetLeadField, string>>
        result.missingRequired = detection.missingRequired
        if (detection.missingRequired.length) {
          result.problem = 'No phone or WhatsApp column found — see the column guide under the Sheet link.'
          await recordProblem(source, tabName, sKey, previous, result.problem, rows.length)
          continue
        }
        // Key columns changed since the last good pull → stop (unless the user accepts the new columns).
        const change = mode === 'live' ? keyColumnChange(previous?.fieldHeaders, fieldHeaders) : null
        if (change) {
          result.problem = change
          await recordProblem(source, tabName, sKey, previous, change, rows.length)
          continue
        }
        const warnings = Object.entries(FIELD_NAMES)
          .filter(([f]) => previous?.fieldHeaders?.[f as SheetLeadField] && !fieldHeaders[f as SheetLeadField])
          .map(([f, label]) => `The ${label} column "${previous!.fieldHeaders[f as SheetLeadField]}" is missing — new leads will not have it.`)

        const known = new Map<string, { status: string; tries: number }>()
        for (const r of await SheetRow.find({ tab }).select('rowKey status tries').lean()) known.set(r.rowKey, { status: r.status, tries: r.tries })
        // Leads imported before row tracking existed also count as known.
        for (const l of await Lead.find({ 'source.sheetTab': tab, 'source.rowKey': { $ne: null } }).select('source.rowKey').lean()) {
          const key = l.source?.rowKey
          if (key && !known.has(key)) known.set(key, { status: 'ingested', tries: 0 })
        }
        if (mode === 'live' && known.size === 0 && rows.length > 0) {
          result.needsStart = true
          await saveTabStatus(sKey, { at: new Date().toISOString(), created: 0, failed: 0, rows: rows.length, problem: 'Not started — choose "Import ALL rows as history" or "Start from now" once.', warnings: [], fieldHeaders: previous?.fieldHeaders ?? {} })
          continue
        }

        for (let index = 0; index < rows.length; index++) {
          const mapped = mapSheetRow(rows[index], detection)
          if (!mapped.fields.phone && !mapped.fields.whatsapp) continue // empty row — picked up later when filled
          const rowKey = buildRowKey({ tab, metaLeadId: mapped.fields.metaLeadId, phone: mapped.phone, submittedAt: mapped.fields.submittedAt })
          const seen = known.get(rowKey)
          if (seen && (seen.status !== 'failed' || seen.tries >= MAX_TRIES)) continue
          if (mode === 'skip') {
            await SheetRow.updateOne({ rowKey }, { $set: { tab, status: 'skipped', sheetRow: index + 2 } }, { upsert: true })
            known.set(rowKey, { status: 'skipped', tries: 0 })
            result.skipped++
            continue
          }
          result.read++
          try {
            const outcome = await ingestRow(mapped, { source, tab, rowKey, index, mode, agents })
            if (outcome.status === 'created') result.created++
            else if (outcome.status === 'reinquiry') result.reinquiry++
            else if (outcome.status === 'invalid_phone') result.invalid++
            else result.skipped++
            await SheetRow.updateOne({ rowKey }, { $set: { tab, status: 'ingested', leadId: 'leadId' in outcome ? outcome.leadId : null, sheetRow: index + 2, error: null } }, { upsert: true })
            known.set(rowKey, { status: 'ingested', tries: 0 })
          } catch (error) {
            result.failed++
            const message = error instanceof Error ? error.message : String(error)
            if (result.errors.length < 5) result.errors.push(`Row ${index + 2}: ${message.slice(0, 120)}`)
            console.error('[sheet-pull]', tab, index + 2, message)
            await SheetRow.updateOne({ rowKey }, { $set: { tab, status: 'failed', error: message.slice(0, 300), sheetRow: index + 2 }, $inc: { tries: 1 } }, { upsert: true })
          }
        }
        await saveTabStatus(sKey, { at: new Date().toISOString(), created: result.created, failed: result.failed, rows: rows.length, problem: null, warnings, fieldHeaders })
      }
    }
    return results
  })
}

/** Save a blocking problem for a tab and tell the department's managers (once a day per problem). */
async function recordProblem(source: SheetSource, tab: string, key: string, previous: SheetTabStatus | undefined, problem: string, rows: number) {
  await saveTabStatus(key, { at: new Date().toISOString(), created: 0, failed: 0, rows, problem, warnings: previous?.warnings ?? [], fieldHeaders: previous?.fieldHeaders ?? {} })
  const dept = await DepartmentModel.findOne({ code: source.department }).select('_id').lean()
  const day = new Date().toISOString().slice(0, 10)
  await notify({
    userIds: await managersOf(dept?._id ?? null),
    type: 'sheet_problem',
    title: `Google Sheet "${source.name}" (${tab}) stopped`,
    body: problem.slice(0, 160),
    link: '/settings#google-sheets',
    dedupeKey: `sheet_problem:${key}:${day}:${problem.slice(0, 40)}`,
  })
}

type Mapped = ReturnType<typeof mapSheetRow>
interface RowContext {
  source: SheetSource
  tab: string
  rowKey: string
  index: number
  mode: 'live' | 'history'
  agents: { _id: unknown; name: string; departmentId?: unknown }[]
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
  const deptId = String((await DepartmentModel.findOne({ code: ctx.source.department }).select('_id').lean())?._id ?? '')
  const departmentAgents = ctx.agents.filter((a) => String(a.departmentId) === deptId)
  return ingestLead({
    name: mapped.fields.name ?? '',
    phone: mapped.phone ?? '',
    whatsapp: mapped.fields.whatsapp,
    altPhones: mapped.fields.altPhone ? [mapped.fields.altPhone] : [],
    email: mapped.fields.email,
    city: mapped.fields.city,
    area: mapped.fields.area,
    address: mapped.fields.address,
    // A sheet belongs to one department: its leads always go there.
    department: ctx.source.department,
    channel: 'sheet',
    source: {
      rowKey: ctx.rowKey,
      metaLeadId: mapped.fields.metaLeadId?.replace(/^l:/i, ''),
      submittedAt,
      campaignName: mapped.fields.campaignName,
      adsetName: mapped.fields.adsetName,
      adName: mapped.fields.adName,
      formName: mapped.fields.formName,
      sheetTab: ctx.tab,
      sheetRow: ctx.index + 2,
    },
    site,
    extra: { ...mapped.extra, ...unmatched, ...(mapped.fields.status ? { 'Lead Status (Sheet)': mapped.fields.status } : {}), ...(mapped.fields.agentName ? { 'Call Agent (Sheet)': mapped.fields.agentName } : {}) },
    notes: mapped.fields.notes,
    receivedAt: submittedAt,
    agentId: ctx.mode === 'history' ? matchAgent(mapped.fields.agentName, departmentAgents) : null,
    quiet: ctx.mode === 'history',
  })
}

/** For the settings screen: headers + how each column will be used, per tab of one sheet. */
export async function previewSheet(source: SheetSource): Promise<{ tab: string; detection: ColumnDetection; rows: number; error?: string }[]> {
  const out = []
  for (const tab of source.tabs) {
    try {
      const { headers, rows } = await fetchTab(source.spreadsheetId, tab)
      out.push({ tab, detection: detectColumns(headers, source.headerOverrides), rows: rows.length })
    } catch (error) {
      out.push({ tab, detection: { mapping: {}, dynamic: [], ignored: [], missingRequired: [] } as ColumnDetection, rows: 0, error: error instanceof Error ? error.message : 'Could not read' })
    }
  }
  return out
}
