import mongoose from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { Activity, ALL_MODELS, Department as DepartmentModel, Contact, Lead, Message, Notification, Attendance, Team, User, Job, nextSequence, IngestEvent } from '@/server/db/models'
import { withTransaction } from '@/server/db/transaction'
import { seedDemoData } from '@/server/db/seed/build-seed'
import { PIPELINES, type Department } from '@/domain/constants'

beforeAll(async () => {
  await mongoose.connect(inject('mongoUri'), { dbName: 'volton_models_test' })
  await Promise.all(ALL_MODELS.map((model) => model.syncIndexes()))
})
afterAll(async () => {
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
})
beforeEach(async () => {
  await Promise.all(ALL_MODELS.map((model) => model.collection.deleteMany({})))
})

const contact = (phone = '+923001234567') => Contact.create({ name: 'Ali Khan', phones: [phone] })
const lead = (contactId: mongoose.Types.ObjectId, extra: Record<string, unknown> = {}) =>
  Lead.create({ leadNo: `VL-${Math.random()}`, contactId, receivedAt: new Date(), assignableAt: new Date(), source: { channel: 'manual' }, ...extra })

describe('validation', () => {
  it('rejects non-E.164 phones and unknown enum values', async () => {
    await expect(Contact.create({ name: 'X', phones: ['0300 1234567'] })).rejects.toThrow(/E\.164/)
    const c = await contact()
    await expect(lead(c._id, { stage: 'bogus' })).rejects.toThrow(/stage/)
  })

  it('applies defaults from constants', async () => {
    const team = await Team.create({ departmentId: new mongoose.Types.ObjectId(), managerId: new mongoose.Types.ObjectId(), name: 'T' })
    expect(team.managerWindowMin).toBe(5)
    const user = await User.create({ name: 'Ahmed', email: 'AHMED@VOLTON.TEST' })
    expect(user.role).toBe('agent')
    expect(user.email).toBe('ahmed@volton.test')
  })
})

describe('unique and partial indexes', () => {
  it('one contact per phone', async () => {
    await contact()
    await expect(contact()).rejects.toThrow(/duplicate key/)
  })

  it('only one OPEN lead per contact and department; closed leads do not block', async () => {
    const c = await contact()
    const dept = new mongoose.Types.ObjectId()
    const first = await lead(c._id, { departmentId: dept })
    await expect(lead(c._id, { departmentId: dept })).rejects.toThrow(/duplicate key/)
    await Lead.updateOne({ _id: first._id }, { status: 'lost' })
    await expect(lead(c._id, { departmentId: dept })).resolves.toBeTruthy()
  })

  it('metaLeadId is unique when present, many leads may have none', async () => {
    const a = await contact('+923001111111')
    const b = await contact('+923002222222')
    const c = await contact('+923003333333')
    await lead(a._id)
    await lead(b._id)
    await lead(c._id, { source: { channel: 'sheet', metaLeadId: 'm-1' } })
    const d = await contact('+923004444444')
    await expect(lead(d._id, { source: { channel: 'sheet', metaLeadId: 'm-1' } })).rejects.toThrow(/duplicate key/)
  })

  it('attendance once per user per day; notification and message keys are unique', async () => {
    const userId = new mongoose.Types.ObjectId()
    await Attendance.create({ userId, date: '2026-10-04', status: 'checked_in', checkInAt: new Date() })
    await expect(Attendance.create({ userId, date: '2026-10-04', status: 'checked_in', checkInAt: new Date() })).rejects.toThrow(/duplicate key/)
    await Notification.create({ userId, type: 'new_lead', title: 'x', dedupeKey: 'k1' })
    await expect(Notification.create({ userId, type: 'new_lead', title: 'x', dedupeKey: 'k1' })).rejects.toThrow(/duplicate key/)
    const m = { contactId: userId, numberId: userId, direction: 'in', type: 'text', sentFrom: 'customer', status: 'received', at: new Date() }
    await Message.create({ ...m, waMessageId: 'w1' })
    await expect(Message.create({ ...m, waMessageId: 'w1' })).rejects.toThrow(/duplicate key/)
    await Job.create({ kind: 'accept_due', dueAt: new Date() })
    await Job.create({ kind: 'accept_due', dueAt: new Date() })
    await Job.create({ kind: 'accept_due', dueAt: new Date(), dedupeKey: 'j1' })
    await expect(Job.create({ kind: 'accept_due', dueAt: new Date(), dedupeKey: 'j1' })).rejects.toThrow(/duplicate key/)
  })

  it('ingest events expire after 30 days', async () => {
    const indexes = await IngestEvent.collection.indexes()
    expect(indexes.find((i) => i.expireAfterSeconds)?.expireAfterSeconds).toBe(30 * 86_400)
  })
})

describe('behaviour', () => {
  it('activities are insert-only', async () => {
    const a = await Activity.create({ leadId: new mongoose.Types.ObjectId(), type: 'note_added' })
    await expect(Activity.updateOne({ _id: a._id }, { type: 'accepted' })).rejects.toThrow(/insert-only/)
    await expect(Activity.deleteOne({ _id: a._id })).rejects.toThrow(/insert-only/)
  })

  it('nextSequence is atomic under concurrency', async () => {
    const values = await Promise.all(Array.from({ length: 20 }, () => nextSequence('lead')))
    expect([...values].sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  })

  it('withTransaction commits both writes or neither', async () => {
    await withTransaction(async (session) => {
      await Contact.create([{ name: 'A', phones: ['+923005555555'] }], { session })
      await Contact.create([{ name: 'B', phones: ['+923006666666'] }], { session })
    })
    expect(await Contact.countDocuments()).toBe(2)
    await expect(
      withTransaction(async (session) => {
        await Contact.create([{ name: 'C', phones: ['+923007777777'] }], { session })
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await Contact.countDocuments()).toBe(2)
  })
})

describe('seed', () => {
  it('builds consistent demo data', async () => {
    const summary = await seedDemoData(new Date('2026-10-04T05:00:00Z'))
    expect(summary).toMatchObject({ departments: 2, users: 17, leads: 60 })
    expect(summary.attempts).toBeGreaterThan(0)
    expect(summary.messages).toBeGreaterThan(0)

    const departments = await DepartmentModel.find().lean()
    const codeById = new Map(departments.map((d) => [String(d._id), d.code as Department]))
    for (const l of await Lead.find().lean()) expect(PIPELINES[codeById.get(String(l.departmentId))!]).toContain(l.stage)

    const agents = await User.find({ role: 'agent' }).lean()
    const agentDept = new Map(agents.map((a) => [String(a._id), String(a.departmentId)]))
    for (const l of await Lead.find({ 'assignment.agentId': { $ne: null } }).lean()) {
      expect(agentDept.get(String(l.assignment?.agentId))).toBe(String(l.departmentId))
    }
  })
})
