/**
 * Demo data for the client demo and local development: 2 departments, 1 admin, 2 managers, 8 agents,
 * 60 leads with assignment history, attempts (proof), follow-ups, WhatsApp messages and timeline events.
 * Deterministic (seeded random) so every run produces the same data.
 */
import type { Types } from 'mongoose'
import {
  ATTEMPT_CHANNELS,
  CALL_RESULTS,
  MAX_FOLLOW_UPS,
  PIPELINES,
  type ActivityType,
  type AttemptChannel,
  type CallResult,
  type Department as DepartmentCode,
  type LeadChannel,
  type Stage,
} from '@/domain/constants'
import { COUNTERS, formatLeadNo } from '@/domain/numbering'
import { hashPassword } from '@/server/auth/password'
import { pktDateKey } from '@/lib/dates-pkt'
import {
  ALL_MODELS,
  Activity,
  Attendance,
  Contact,
  ContactAttempt,
  Counter,
  Department,
  FollowUp,
  Lead,
  LeadAssignment,
  Message,
  Team,
  User,
  WhatsAppNumber,
  Visit,
} from '@/server/db/models'

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST = ['Muhammad', 'Ali', 'Ayesha', 'Fatima', 'Usman', 'Bilal', 'Sana', 'Hira', 'Zain', 'Omar', 'Hamza', 'Maryam', 'Imran', 'Nadia', 'Kashif', 'Saad', 'Rabia', 'Adeel', 'Mehwish', 'Tariq']
const LAST = ['Khan', 'Ahmed', 'Raza', 'Malik', 'Iqbal', 'Siddiqui', 'Butt', 'Chaudhry', 'Qureshi', 'Sheikh', 'Shah', 'Mirza', 'Hussain', 'Javed']
const CITIES = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Gujranwala', 'Sialkot', 'Peshawar']
const CAMPAIGNS: Record<DepartmentCode, string[]> = {
  INSTALLATION: ['Solar Home Oct', 'Zero Bill Homes', 'Net Metering Promo'],
  TRADING: ['Panels Wholesale', 'Inverter Deals', 'Dealer Network'],
}

export interface SeedSummary {
  departments: number
  users: number
  leads: number
  attempts: number
  followUps: number
  messages: number
  activities: number
}

/** Wipes every collection, then inserts demo data. Only call on a dev/demo database. */
/** Demo sign-in password for every seeded user (change after the demo). */
export const DEMO_PASSWORD = 'volton@123'

/** Field (outdoor visit) agents from the client's Excel Config tab. */
const FIELD_AGENTS = [
  { name: 'Hassan', phone: '+923357227349' },
  { name: 'Waji Field', phone: '+923140002209' },
  { name: 'Faisal', phone: '+923059119330' },
  { name: 'Mushab', phone: '+923299299809' },
  { name: 'Usaid', phone: '+923131021000' },
  { name: 'Rehman', phone: '+923166556685' },
]

export async function seedDemoData(now: Date = new Date()): Promise<SeedSummary> {
  const passwordHash = await hashPassword(DEMO_PASSWORD)
  const rand = mulberry32(20261004)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000)
  let phoneSeq = 1_000_000

  const phone = () => `+92300${String(phoneSeq++).padStart(7, '0')}`

  // Raw collection wipe on purpose: bypasses the insert-only guards, which only protect normal app code.
  await Promise.all(ALL_MODELS.map((model) => model.collection.deleteMany({})))

  // ── Departments, users, teams ──
  const [trading, installation] = await Department.create([
    { code: 'TRADING', name: 'Trading', stages: PIPELINES.TRADING, routingKeywords: ['panel', 'inverter', 'battery', 'wholesale', 'dealer'] },
    { code: 'INSTALLATION', name: 'Installation', stages: PIPELINES.INSTALLATION, routingKeywords: ['install', 'home', 'net metering', 'system'] },
  ])
  const departmentId: Record<DepartmentCode, Types.ObjectId> = { TRADING: trading._id, INSTALLATION: installation._id }

  await User.create({ name: 'Volt On Admin', email: 'admin@volton.test', username: 'admin', phone: phone(), role: 'admin', passwordHash })
  const managers = {
    INSTALLATION: await User.create({ name: 'Bilal Ahmed', email: 'bilal@volton.test', username: 'bilal', phone: phone(), role: 'manager', departmentId: installation._id, passwordHash }),
    TRADING: await User.create({ name: 'Sana Iqbal', email: 'sana@volton.test', username: 'sana', phone: phone(), role: 'manager', departmentId: trading._id, passwordHash }),
  }
  const agentNames: Record<DepartmentCode, string[]> = {
    INSTALLATION: ['Talha Khan', 'Waji Ahmed', 'Musbah Ali', 'Irfan Shah'],
    TRADING: ['Fatima Noor', 'Hira Khan', 'Ali Hassan', 'Omar Farooq'],
  }
  const agents = {} as Record<DepartmentCode, InstanceType<typeof User>[]>
  for (const dept of ['INSTALLATION', 'TRADING'] as const) {
    agents[dept] = await User.create(
      agentNames[dept].map((name) => {
        const handle = name.split(' ')[0].toLowerCase()
        return { name, email: `${handle}@volton.test`, username: handle, phone: phone(), role: 'agent', departmentId: departmentId[dept], managerId: managers[dept]._id, passwordHash }
      }),
    )
  }
  const teams = {
    INSTALLATION: await Team.create({ departmentId: installation._id, managerId: managers.INSTALLATION._id, name: 'Installation team', memberOrder: agents.INSTALLATION.map((a) => a._id) }),
    TRADING: await Team.create({ departmentId: trading._id, managerId: managers.TRADING._id, name: 'Trading team', memberOrder: agents.TRADING.map((a) => a._id) }),
  }

  // Attendance today: first three agents checked in, the fourth on a break.
  const today = pktDateKey(now)
  await Attendance.create(
    (['INSTALLATION', 'TRADING'] as const).flatMap((dept) =>
      agents[dept].map((agent, i) => ({
        userId: agent._id,
        date: today,
        status: i === 3 ? 'on_break' : 'checked_in',
        checkInAt: minutesAgo(240 - i * 10),
        breaks: i === 3 ? [{ startAt: minutesAgo(15) }] : [],
      })),
    ),
  )

  // Manager's WhatsApp ad number (phase 2 adds one per agent).
  const adNumber = await WhatsAppNumber.create({
    phoneNumberId: 'demo-phone-number-id',
    number: phone(),
    displayName: 'Volt On Solar',
    ownerType: 'department',
    departmentId: installation._id,
    status: 'connected',
    connectedAt: minutesAgo(60 * 24 * 7),
  })

  // ── Leads ──
  const counts = { leads: 0, attempts: 0, followUps: 0, messages: 0, activities: 0 }
  const activities: Record<string, unknown>[] = []
  const rr: Record<DepartmentCode, number> = { INSTALLATION: 0, TRADING: 0 }

  for (let i = 0; i < 60; i++) {
    const dept: DepartmentCode = i < 36 ? 'INSTALLATION' : 'TRADING'
    const pipeline = PIPELINES[dept].filter((s) => s !== 'lost')
    const roll = rand()
    const channel: LeadChannel = roll < 0.6 ? 'sheet' : roll < 0.85 ? 'whatsapp' : roll < 0.93 ? 'website' : 'manual'
    const receivedAt = minutesAgo(Math.floor(rand() * 60 * 24 * 14) + 5)
    const isLost = rand() < 0.12
    const stage: Stage = isLost ? 'lost' : pipeline[Math.min(pipeline.length - 1, Math.floor(rand() * rand() * pipeline.length))]
    const status = stage === 'won' ? 'won' : stage === 'lost' ? 'lost' : 'open'
    const unassigned = stage === 'new' && rand() < 0.3
    const agent = unassigned ? null : agents[dept][rr[dept]++ % agents[dept].length]
    const name = `${pick(FIRST)} ${pick(LAST)}`
    const city = pick(CITIES)
    const campaign = pick(CAMPAIGNS[dept])

    const contact = await Contact.create({ name, phones: [phone()], city })
    contact.whatsappE164 = contact.phones[0]
    await contact.save()

    const attemptTotal = stage === 'new' ? 0 : Math.min(MAX_FOLLOW_UPS, 1 + Math.floor(rand() * MAX_FOLLOW_UPS))
    const assignedAt = new Date(receivedAt.getTime() + 3 * 60_000)
    const lead = await Lead.create({
      leadNo: formatLeadNo(i + 1),
      contactId: contact._id,
      departmentId: departmentId[dept],
      teamId: teams[dept]._id,
      stage,
      stageChangedAt: new Date(receivedAt.getTime() + 60 * 60_000),
      status,
      closedAt: status === 'open' ? null : minutesAgo(30),
      lostReason: stage === 'lost' ? 'price' : null,
      wonValuePkr: stage === 'won' ? (dept === 'INSTALLATION' ? 1_750_000 : 420_000) : null,
      receivedAt,
      assignableAt: receivedAt,
      source: {
        channel,
        rowKey: channel === 'sheet' ? `demo-row-${i + 1}` : undefined,
        metaLeadId: channel === 'sheet' ? `demo-meta-${i + 1}` : undefined,
        submittedAt: channel === 'sheet' ? receivedAt : undefined,
        campaignName: channel === 'sheet' || channel === 'whatsapp' ? campaign : undefined,
        formName: channel === 'sheet' ? `${campaign} form` : undefined,
        platform: channel === 'sheet' ? (rand() < 0.7 ? 'facebook' : 'instagram') : channel === 'whatsapp' ? 'whatsapp' : undefined,
        ctwa: channel === 'whatsapp' ? { sourceId: `demo-ad-${i}`, sourceType: 'ad', headline: `${campaign} — message us on WhatsApp`, ctwaClid: `demo-clid-${i}` } : undefined,
      },
      assignment: agent
        ? { agentId: agent._id, state: 'accepted', assignedAt, method: 'auto', acceptedAt: new Date(assignedAt.getTime() + 2 * 60_000) }
        : { state: 'waiting' },
      attemptCount: attemptTotal,
      firstContactAt: attemptTotal ? new Date(assignedAt.getTime() + 8 * 60_000) : null,
      lastContactAt: attemptTotal ? minutesAgo(60 * 3) : null,
      nextFollowUpAt: status === 'open' && attemptTotal ? new Date(now.getTime() + (rand() < 0.25 ? -45 : 90) * 60_000) : null,
      site: dept === 'INSTALLATION' ? { propertyType: 'house', monthlyBillPkr: 20_000 + Math.floor(rand() * 60) * 1000, roofType: pick(['rcc_slab', 'metal_sheet'] as const), shading: pick(['none', 'partial'] as const), targetKw: pick([5, 8, 10, 12, 15]), batteryRequired: rand() < 0.4 } : undefined,
      trading: dept === 'TRADING' ? { customerType: pick(['end_user', 'installer', 'dealer'] as const), products: [pick(['585W mono panels', 'Hybrid inverter 6 kW', 'Lithium battery 5 kWh'])], quantity: 1 + Math.floor(rand() * 40), deliveryCity: city } : undefined,
      createdBy: null,
    })
    counts.leads++

    const event = (type: ActivityType, at: Date, actorId: Types.ObjectId | null, data: Record<string, unknown> = {}) =>
      activities.push({ leadId: lead._id, type, at, actorId, data })
    event('lead_created', receivedAt, null, { channel })

    if (!agent) continue

    const assignment = await LeadAssignment.create({ leadId: lead._id, agentId: agent._id, method: 'auto', assignedAt, acceptedAt: new Date(assignedAt.getTime() + 2 * 60_000) })
    event('assigned', assignedAt, null, { agentId: agent._id, assignmentId: assignment._id })
    event('accepted', new Date(assignedAt.getTime() + 2 * 60_000), agent._id)

    for (let n = 1; n <= attemptTotal; n++) {
      const tappedAt = new Date(assignedAt.getTime() + (8 + (n - 1) * 60 * 24) * 60_000)
      const channelUsed: AttemptChannel = pick(ATTEMPT_CHANNELS)
      const result: CallResult = n === attemptTotal && stage !== 'new' && stage !== 'contacted' ? 'connected' : pick(CALL_RESULTS.filter((r) => r !== 'connected'))
      const flagged = rand() < 0.08
      await ContactAttempt.create({
        leadId: lead._id,
        agentId: agent._id,
        channel: channelUsed,
        followUpNo: n,
        serverTapAt: tappedAt,
        leftAt: flagged ? null : new Date(tappedAt.getTime() + 5_000),
        returnedAt: flagged ? null : new Date(tappedAt.getTime() + (result === 'connected' ? 240_000 : 40_000)),
        outcomeAt: new Date(tappedAt.getTime() + (flagged ? 4_000 : 260_000)),
        result,
        response: result === 'connected' ? (status === 'lost' ? 'not_interested' : 'interested') : null,
        remarks: result === 'connected' ? 'Discussed requirements and next steps.' : null,
        proofStatus: flagged ? 'flagged' : channelUsed === 'whatsapp_chat' ? 'verified' : rand() < 0.5 ? 'evidenced' : 'logged',
        flags: flagged ? ['never_left_app', 'too_fast'] : [],
      })
      counts.attempts++
      event('attempt_logged', tappedAt, agent._id, { channel: channelUsed, result, followUpNo: n })
    }

    if (status === 'open' && attemptTotal < MAX_FOLLOW_UPS) {
      await FollowUp.create({ leadId: lead._id, agentId: agent._id, number: attemptTotal + 1, dueAt: lead.nextFollowUpAt ?? new Date(now.getTime() + 90 * 60_000) })
      counts.followUps++
      event('follow_up_scheduled', minutesAgo(60 * 3), agent._id, { number: attemptTotal + 1 })
    }

    if (channel === 'whatsapp') {
      const first = new Date(receivedAt.getTime())
      await Message.create([
        { waMessageId: `demo-wamid-${i}-1`, contactId: contact._id, leadId: lead._id, numberId: adNumber._id, direction: 'in', type: 'text', text: 'Assalam o Alaikum, I saw your ad. Please share details.', sentFrom: 'customer', status: 'received', at: first },
        { waMessageId: `demo-wamid-${i}-2`, contactId: contact._id, leadId: lead._id, numberId: adNumber._id, direction: 'out', type: 'text', text: `Walaikum Assalam! I am ${agent.name} from Volt On Solar.`, sentFrom: 'app', sentByUserId: agent._id, status: 'read', at: new Date(first.getTime() + 9 * 60_000) },
      ])
      counts.messages += 2
      event('message_in', first, null)
      event('message_out', new Date(first.getTime() + 9 * 60_000), agent._id)
    }
  }

  await Activity.insertMany(activities)
  counts.activities = activities.length
  await Counter.create({ _id: COUNTERS.lead, seq: counts.leads })

  // Field agents + a few site visits, balanced by kW (Excel Visits logic).
  const field = await User.create(FIELD_AGENTS.map((a) => ({ name: a.name, email: `${a.name.split(' ')[0].toLowerCase()}.field@volton.test`, username: a.name.toLowerCase().replace(/s+/g, '.'), phone: a.phone, role: 'field_agent', departmentId: installation._id, passwordHash })))
  const visitLeads = await Lead.find({ stage: { $in: ['site_survey', 'quotation_pending'] } }).limit(6).lean()
  const load = new Map<string, number>(field.map((f: { _id: unknown }) => [String(f._id), 0]))
  for (const [i, l] of visitLeads.entries()) {
    const c = await Contact.findById(l.contactId).lean()
    const kw = [5, 10, 16, 8, 12, 25][i % 6]
    const agentId = [...load.entries()].sort((a, b) => a[1] - b[1])[0][0]
    load.set(agentId, (load.get(agentId) ?? 0) + kw)
    await Visit.create({ leadId: l._id, contactId: l.contactId, customerName: c?.name ?? 'Customer', phone: c?.phones[0] ?? '+923000000000', address: `${c?.city ?? 'Lahore'}`, kw, scheduledAt: new Date(now.getTime() + (i + 1) * 86_400_000), agentId, status: 'assigned', assignedAt: now })
  }

  return { departments: 2, users: 1 + 2 + 8 + field.length, ...counts }
}

