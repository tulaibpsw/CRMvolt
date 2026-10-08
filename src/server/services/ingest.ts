import 'server-only'
import type { Types } from 'mongoose'
import type { AdPlatform, Department, InstallLocation, InstallTimeline, LeadChannel, SystemSizeRange } from '@/domain/constants'
import { formatLeadNo, COUNTERS } from '@/domain/numbering'
import { normalizePhone } from '@/lib/phone'
import { connectDb } from '@/server/db/connection'
import { Contact, Department as DepartmentModel, Lead, Team, nextSequence } from '@/server/db/models'
import { startAssignment } from '@/server/services/assignment'
import { isDuplicateKey, logActivity, notify, oid } from '@/server/services/common'
import { getSetting, nextOpening } from '@/server/services/settings'

export interface IngestInput {
  name: string
  phone: string
  altPhones?: string[]
  whatsapp?: string
  email?: string
  city?: string
  area?: string
  address?: string
  department: Department | null
  channel: LeadChannel
  source?: {
    rowKey?: string
    metaLeadId?: string
    submittedAt?: Date
    campaignName?: string
    adsetName?: string
    adName?: string
    formName?: string
    platform?: AdPlatform
    sheetTab?: string
    sheetRow?: number
    ctwa?: Record<string, string | undefined>
  }
  site?: { systemSizeRange?: SystemSizeRange; installLocation?: InstallLocation; installTimeline?: InstallTimeline; monthlyBillPkr?: number; targetKw?: number }
  extra?: Record<string, string>
  notes?: string
  actorId?: string | null
  /** Pre-assign (history import / quick-add by an agent): skips round-robin. */
  agentId?: string | null
  receivedAt?: Date
  /** History import: do not start assignment or send alerts. */
  quiet?: boolean
}

export type IngestResult =
  | { status: 'created'; leadId: string; leadNo: string }
  | { status: 'reinquiry'; leadId: string; leadNo: string }
  | { status: 'duplicate_row' }
  | { status: 'invalid_phone' }

/** The single entry point for every lead source (Sheet, WhatsApp, website, manual, CSV). */
export async function ingestLead(input: IngestInput): Promise<IngestResult> {
  await connectDb()
  const phone = normalizePhone(input.phone)
  if (!phone) return { status: 'invalid_phone' }
  if (input.source?.rowKey && (await Lead.exists({ 'source.rowKey': input.source.rowKey }))) return { status: 'duplicate_row' }

  const department = input.department ?? (await getSetting('routing')).fallback
  const dept = department ? await DepartmentModel.findOne({ code: department }).lean() : null
  const team = dept ? await Team.findOne({ departmentId: dept._id }).lean() : null

  const altCandidates = [...new Set((input.altPhones ?? []).map((p) => normalizePhone(p)).filter((p): p is string => !!p && p !== phone))]
  // A second number that already belongs to another customer is left off (it would clash with that contact).
  const taken = altCandidates.length ? new Set((await Contact.find({ phones: { $in: altCandidates } }).select('phones').lean()).flatMap((c) => c.phones)) : new Set<string>()
  const altPhones = altCandidates.filter((p) => !taken.has(p))
  const whatsapp = normalizePhone(input.whatsapp) ?? phone
  let contact = await Contact.findOne({ phones: phone })
  if (!contact) {
    try {
      contact = await Contact.create({ name: input.name || phone, phones: [phone, ...altPhones], whatsappE164: whatsapp, email: input.email, city: input.city, area: input.area, address: input.address, createdBy: input.actorId ?? null })
    } catch (error) {
      if (!isDuplicateKey(error)) throw error
      contact = await Contact.findOne({ phones: phone })
      if (!contact) throw error
    }
  }

  const open = await Lead.findOne({ contactId: contact._id, departmentId: dept?._id ?? null, status: 'open', deletedAt: null }).lean()
  if (open) {
    await logActivity(open._id, 'lead_reinquiry', input.actorId ?? null, { channel: input.channel, campaign: input.source?.campaignName })
    if (open.assignment?.agentId && !input.quiet) {
      await notify({ userIds: [open.assignment.agentId], type: 'new_lead', title: 'Your lead asked again', body: `${contact.name} · ${open.leadNo}`, link: `/leads/${open._id}`, dedupeKey: `reinquiry:${open._id}:${Date.now()}` })
    }
    return { status: 'reinquiry', leadId: String(open._id), leadNo: open.leadNo }
  }

  const receivedAt = input.receivedAt ?? new Date()
  const hours = await getSetting('working_hours')
  const leadNo = formatLeadNo(await nextSequence(COUNTERS.lead))
  let lead: { _id: Types.ObjectId; leadNo: string }
  try {
    lead = await Lead.create({
      leadNo,
      contactId: contact._id,
      departmentId: dept?._id ?? null,
      teamId: team?._id ?? null,
      receivedAt,
      assignableAt: team?.assignOutsideHours ? new Date() : nextOpening(new Date(), hours),
      source: { channel: input.channel, ...input.source },
      site: input.site,
      extra: input.extra && Object.keys(input.extra).length ? input.extra : undefined,
      assignment: input.agentId
        ? { agentId: oid(input.agentId), state: 'accepted', assignedAt: receivedAt, acceptedAt: receivedAt, method: 'manual', assignedBy: input.actorId ? oid(input.actorId) : null }
        : { state: 'unassigned' },
      createdBy: input.actorId ?? null,
    })
  } catch (error) {
    if (isDuplicateKey(error)) return { status: 'duplicate_row' }
    throw error
  }
  await logActivity(lead._id, 'lead_created', input.actorId ?? null, { channel: input.channel, campaign: input.source?.campaignName, notes: input.notes })
  if (input.notes) await logActivity(lead._id, 'note_added', input.actorId ?? null, { text: input.notes })
  if (input.agentId) await logActivity(lead._id, 'assigned', input.actorId ?? null, { agentId: input.agentId, method: 'manual' })
  else if (!input.quiet) await startAssignment(lead._id)
  return { status: 'created', leadId: String(lead._id), leadNo: lead.leadNo }
}
