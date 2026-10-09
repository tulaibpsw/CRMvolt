import 'server-only'
import { DEPARTMENTS, INSTALL_LOCATIONS, INSTALL_TIMELINES, SYSTEM_SIZE_RANGES, type AdPlatform, type Department } from '@/domain/constants'
import { buildRowKey, detectColumns, mapSheetRow, parseFormAnswer, routeDepartment } from '@/domain/sheet-columns'
import { normalizePhone } from '@/lib/phone'
import { connectDb } from '@/server/db/connection'
import { Contact, Lead, Setting } from '@/server/db/models'
import { UserError } from '@/server/services/common'
import { ingestLead, type IngestResult } from '@/server/services/ingest'
import { getSetting, type MetaLeadsState } from '@/server/services/settings'

/**
 * Facebook / Instagram Lead Ads → CRM directly (no Google Sheet).
 *  - Webhook: Meta calls /api/webhooks/meta-leads with only the lead id; we fetch the answers with the page token.
 *  - Sync: every 15 minutes (and the "Fetch from Meta" button) reads recent leads of every form, so a missed
 *    webhook never loses a lead. Each Meta lead id is imported once (also shared with Sheet rows that had the id).
 */
const GRAPH = 'https://graph.facebook.com/v23.0'
const LEAD_FIELDS = 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,is_organic'
const SYNC_EVERY_MS = 15 * 60_000

export function metaConfig() {
  return {
    pageId: process.env.META_PAGE_ID || undefined,
    token: process.env.META_PAGE_ACCESS_TOKEN || undefined,
    appSecret: process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET || undefined,
    verifyToken: process.env.META_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN || undefined,
  }
}

/** Plain-English list of what is still missing, for the settings screen. */
export function metaMissing(): string[] {
  const c = metaConfig()
  return [!c.pageId && 'META_PAGE_ID', !c.token && 'META_PAGE_ACCESS_TOKEN', !c.appSecret && 'META_APP_SECRET', !c.verifyToken && 'META_VERIFY_TOKEN'].filter((x): x is string => !!x)
}

export interface MetaLead {
  id: string
  created_time: string
  field_data?: { name: string; values?: string[] }[]
  ad_id?: string
  ad_name?: string
  adset_id?: string
  adset_name?: string
  campaign_id?: string
  campaign_name?: string
  form_id?: string
  platform?: string
  is_organic?: boolean
}

let pageTokenCache: { from: string; token: string; until: number } | null = null

/** A system-user token is swapped for the Page's own token (forms, leads and the page subscription need it). */
async function pageToken(): Promise<string> {
  const { token, pageId } = metaConfig()
  if (!token) throw new UserError('Meta is not connected yet — META_PAGE_ACCESS_TOKEN is missing in Vercel.')
  if (!pageId) return token
  if (pageTokenCache?.from === token && pageTokenCache.until > Date.now()) return pageTokenCache.token
  const url = new URL(`${GRAPH}/${pageId}`)
  url.searchParams.set('fields', 'access_token')
  url.searchParams.set('access_token', token)
  const body = (await fetch(url, { cache: 'no-store' })
    .then((r) => r.json())
    .catch(() => ({}))) as { access_token?: unknown }
  const own = typeof body.access_token === 'string' && body.access_token ? body.access_token : token
  pageTokenCache = { from: token, token: own, until: Date.now() + 3_600_000 }
  return own
}

async function graph<T>(path: string, params: Record<string, string> = {}, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const token = await pageToken()
  const url = path.startsWith('https://') ? new URL(path) : new URL(`${GRAPH}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  if (!url.searchParams.has('access_token')) url.searchParams.set('access_token', token)
  const res = await fetch(url, { method, cache: 'no-store' })
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } }
  if (!res.ok || body.error) {
    const msg = body.error?.message ?? `HTTP ${res.status}`
    // 190 = token expired / revoked, 10 / 200 = missing permission.
    if (body.error?.code === 190) throw new UserError(`Meta token is expired or was removed — make a new one (docs/meta-leads-setup.md). ${msg}`)
    throw new UserError(`Meta said: ${msg}`)
  }
  return body
}

/** "2026-10-09T10:15:30+0000" → Date (the +0000 form is not valid ISO everywhere). */
export function parseMetaTime(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const d = new Date(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
  return Number.isNaN(d.getTime()) ? undefined : d
}

const platformOf = (p?: string): AdPlatform => (p === 'fb' || p === 'facebook' ? 'facebook' : p === 'ig' || p === 'instagram' ? 'instagram' : 'unknown')

/** A Meta lead as a Sheet-like row, so the same column detection (full_name, phone_number, form questions…) is reused. */
export function metaLeadRow(lead: MetaLead, formName?: string): Record<string, string> {
  const row: Record<string, string> = {}
  for (const f of lead.field_data ?? []) row[f.name] = (f.values ?? []).join(', ')
  Object.assign(row, {
    id: lead.id,
    created_time: lead.created_time,
    ...(lead.campaign_name ? { campaign_name: lead.campaign_name } : {}),
    ...(lead.adset_name ? { adset_name: lead.adset_name } : {}),
    ...(lead.ad_name ? { ad_name: lead.ad_name } : {}),
    ...(formName ? { form_name: formName } : {}),
  })
  return row
}

async function saveForm(formId: string, patch: { name?: string; status?: string; counted?: boolean }) {
  const set: Record<string, unknown> = {}
  if (patch.name) set[`value.forms.${formId}.name`] = patch.name
  if (patch.status) set[`value.forms.${formId}.status`] = patch.status
  if (patch.counted) set[`value.forms.${formId}.lastLeadAt`] = new Date().toISOString()
  await Setting.updateOne({ key: 'meta_leads' }, { $set: set, ...(patch.counted ? { $inc: { [`value.forms.${formId}.leads`]: 1 } } : {}) }, { upsert: true })
}

async function setState(patch: Partial<Omit<MetaLeadsState, 'forms'>>) {
  await Setting.updateOne({ key: 'meta_leads' }, { $set: Object.fromEntries(Object.entries(patch).map(([k, v]) => [`value.${k}`, v])) }, { upsert: true })
}

export type MetaImport = IngestResult | { status: 'already_in_crm' }

/**
 * Import one Meta lead. `catchUp` (sync of older leads): a customer already in the CRM is skipped, so leads that
 * came earlier through the Google Sheet are not opened a second time.
 */
export async function importMetaLead(lead: MetaLead, opts: { catchUp?: boolean; state?: MetaLeadsState } = {}): Promise<MetaImport> {
  await connectDb()
  const rowKey = buildRowKey({ tab: 'meta', metaLeadId: lead.id, phone: null })
  if (await Lead.exists({ $or: [{ 'source.rowKey': rowKey }, { 'source.metaLeadId': lead.id }] })) return { status: 'duplicate_row' }

  const state = opts.state ?? (await getSetting('meta_leads'))
  const formId = lead.form_id ?? ''
  let formName = formId ? state.forms[formId]?.name : undefined
  if (formId && !formName) {
    formName = (await graph<{ name?: string }>(formId, { fields: 'name' }).catch(() => ({ name: undefined }))).name
    if (formName) {
      await saveForm(formId, { name: formName })
      state.forms[formId] = { ...(state.forms[formId] ?? { department: null, leads: 0 }), name: formName }
    }
  }

  const row = metaLeadRow(lead, formName)
  const mapped = mapSheetRow(row, detectColumns(Object.keys(row)))
  if (opts.catchUp && mapped.phone && (await Contact.exists({ phones: mapped.phone }))) return { status: 'already_in_crm' }

  const formDept = formId ? state.forms[formId]?.department : null
  const routing = await getSetting('routing')
  const department: Department | null = formDept && (DEPARTMENTS as readonly string[]).includes(formDept) ? formDept : routeDepartment(mapped.fields, routing.keywords)
  const site = {
    systemSizeRange: parseFormAnswer(mapped.fields.systemSizeRange, SYSTEM_SIZE_RANGES),
    installLocation: parseFormAnswer(mapped.fields.installLocation, INSTALL_LOCATIONS),
    installTimeline: parseFormAnswer(mapped.fields.installTimeline, INSTALL_TIMELINES),
  }
  const unmatched: Record<string, string> = {}
  for (const key of ['systemSizeRange', 'installLocation', 'installTimeline'] as const) {
    if (mapped.fields[key] && !site[key]) unmatched[`${key} (form)`] = mapped.fields[key]
  }
  const submittedAt = parseMetaTime(lead.created_time)
  const result = await ingestLead({
    name: mapped.fields.name ?? '',
    phone: mapped.phone ?? '',
    whatsapp: normalizePhone(mapped.fields.whatsapp?.replace(/^p:/i, '') ?? null) ?? undefined,
    email: mapped.fields.email,
    city: mapped.fields.city,
    area: mapped.fields.area,
    address: mapped.fields.address,
    department,
    channel: 'meta_webhook',
    source: {
      rowKey,
      metaLeadId: lead.id,
      submittedAt,
      campaignName: lead.campaign_name,
      adsetName: lead.adset_name,
      adName: lead.ad_name,
      formName,
      platform: platformOf(lead.platform),
    },
    site,
    extra: { ...mapped.extra, ...unmatched, ...(lead.is_organic ? { Organic: 'yes' } : {}) },
    notes: mapped.fields.notes,
    receivedAt: submittedAt,
  })
  if (formId && result.status !== 'duplicate_row') await saveForm(formId, { counted: true })
  return result
}

/** Webhook payload: { object: 'page', entry: [{ changes: [{ field: 'leadgen', value: { leadgen_id, form_id, page_id } }] }] } */
export async function processLeadgenWebhook(payload: { entry?: { changes?: { field: string; value?: { leadgen_id?: string; form_id?: string } }[] }[] }): Promise<void> {
  await connectDb()
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const id = change.field === 'leadgen' ? change.value?.leadgen_id : undefined
      if (!id) continue
      if (await Lead.exists({ 'source.metaLeadId': id })) continue
      const lead = await graph<MetaLead>(id, { fields: LEAD_FIELDS })
      await importMetaLead({ ...lead, form_id: lead.form_id ?? change.value?.form_id })
    }
  }
  await setState({ lastWebhookAt: new Date().toISOString() })
}

export interface MetaSyncResult {
  forms: number
  read: number
  created: number
  reinquiry: number
  alreadyInCrm: number
  skipped: number
  failed: number
  errors: string[]
}

/** Read the page's lead forms and their leads of the last `days` days (Meta keeps leads 90 days). */
export async function syncMetaLeads(days = 2): Promise<MetaSyncResult> {
  await connectDb()
  const { pageId } = metaConfig()
  if (!pageId) throw new UserError('META_PAGE_ID is missing in Vercel.')
  const result: MetaSyncResult = { forms: 0, read: 0, created: 0, reinquiry: 0, alreadyInCrm: 0, skipped: 0, failed: 0, errors: [] }
  try {
    const forms = await graph<{ data: { id: string; name: string; status?: string }[] }>(`${pageId}/leadgen_forms`, { fields: 'id,name,status', limit: '100' })
    const state = await getSetting('meta_leads')
    for (const f of forms.data ?? []) {
      if (state.forms[f.id]?.name !== f.name || state.forms[f.id]?.status !== f.status) await saveForm(f.id, { name: f.name, status: f.status })
      state.forms[f.id] = { ...(state.forms[f.id] ?? { department: null, leads: 0 }), name: f.name, status: f.status }
    }
    result.forms = forms.data?.length ?? 0
    const since = Math.floor((Date.now() - Math.min(Math.max(days, 1), 90) * 86_400_000) / 1000)
    const filtering = JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: since }])
    for (const f of forms.data ?? []) {
      let next: string | undefined
      let pages = 0
      do {
        const page: { data?: MetaLead[]; paging?: { next?: string } } = next ? await graph(next) : await graph(`${f.id}/leads`, { fields: LEAD_FIELDS, filtering, limit: '100' })
        for (const lead of page.data ?? []) {
          result.read++
          try {
            const r = await importMetaLead({ ...lead, form_id: lead.form_id ?? f.id }, { catchUp: true, state })
            if (r.status === 'created') result.created++
            else if (r.status === 'reinquiry') result.reinquiry++
            else if (r.status === 'already_in_crm') result.alreadyInCrm++
            else result.skipped++
          } catch (error) {
            result.failed++
            if (result.errors.length < 5) result.errors.push(`${f.name}: ${error instanceof Error ? error.message.slice(0, 120) : 'failed'}`)
          }
        }
        next = page.paging?.next
      } while (next && ++pages < 20)
    }
    await setState({ lastSyncAt: new Date().toISOString(), lastError: null })
    return result
  } catch (error) {
    await setState({ lastSyncAt: new Date().toISOString(), lastError: error instanceof Error ? error.message.slice(0, 300) : 'Sync failed' })
    throw error
  }
}

/** Cron tick: a safety-net sync every 15 minutes, only when Meta is connected. */
export async function syncMetaLeadsIfDue(): Promise<MetaSyncResult | null> {
  if (metaMissing().some((k) => k === 'META_PAGE_ID' || k === 'META_PAGE_ACCESS_TOKEN')) return null
  const state = await getSetting('meta_leads')
  if (state.lastSyncAt && Date.now() - new Date(state.lastSyncAt).getTime() < SYNC_EVERY_MS) return null
  await setState({ lastSyncAt: new Date().toISOString() }) // claim the slot first: a slow sync is not started twice
  return syncMetaLeads(1)
}

/** "Turn on live leads": subscribe the Page to this app's leadgen webhook (one time; Meta keeps it). */
export async function subscribeMetaPage(): Promise<void> {
  await connectDb()
  const { pageId } = metaConfig()
  if (!pageId) throw new UserError('META_PAGE_ID is missing in Vercel.')
  const r = await graph<{ success?: boolean }>(`${pageId}/subscribed_apps`, { subscribed_fields: 'leadgen' }, 'POST')
  if (!r.success) throw new UserError('Meta did not confirm the subscription — check the token has pages_manage_metadata.')
  await setState({ subscribedAt: new Date().toISOString(), lastError: null })
}

export async function saveMetaFormDepartments(map: Record<string, Department | null>): Promise<void> {
  await connectDb()
  const set = Object.fromEntries(Object.entries(map).filter(([id]) => /^\d{5,25}$/.test(id)).map(([id, d]) => [`value.forms.${id}.department`, d]))
  if (Object.keys(set).length) await Setting.updateOne({ key: 'meta_leads' }, { $set: set }, { upsert: true })
}
