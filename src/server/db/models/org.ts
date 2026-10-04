/** Organisation: departments, teams (the round-robin order), users, attendance. */
import { Schema, type InferSchemaType } from 'mongoose'
import { ATTENDANCE_STATUSES, DEFAULT_ROLE, DEPARTMENTS, ROLES, STAGES, TEAM_DEFAULTS } from '@/domain/constants'
import { isE164 } from '@/lib/phone'
import { auditFields, defineModel, softDelete } from '@/server/db/plugins'

const { ObjectId } = Schema.Types

const departmentSchema = new Schema(
  {
    code: { type: String, enum: DEPARTMENTS, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    stages: [{ type: String, enum: STAGES }],
    routingKeywords: { type: [String], default: [] },
    workingHours: {
      start: { type: String, default: '10:00', match: /^\d{2}:\d{2}$/ },
      end: { type: String, default: '19:00', match: /^\d{2}:\d{2}$/ },
      /** 0 = Sunday … 6 = Saturday (Pakistan time) */
      days: { type: [Number], default: [1, 2, 3, 4, 5, 6] },
    },
  },
  { timestamps: true },
)
departmentSchema.plugin(auditFields)

const teamSchema = new Schema(
  {
    departmentId: { type: ObjectId, ref: 'Department', required: true, index: true },
    managerId: { type: ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    /** THE assignment order (User1 → User2 → …). The only place order lives. */
    memberOrder: [{ type: ObjectId, ref: 'User' }],
    /** Round-robin pointer: who got the last lead and at which slot. */
    rr: {
      lastUid: { type: ObjectId, ref: 'User', default: null },
      lastPos: { type: Number, default: -1 },
    },
    version: { type: Number, default: 0 },
    managerWindowMin: { type: Number, default: TEAM_DEFAULTS.managerWindowMin, min: 0, max: 60 },
    paused: { type: Boolean, default: TEAM_DEFAULTS.paused },
    acceptWithinMin: { type: Number, default: TEAM_DEFAULTS.acceptWithinMin, min: 1, max: 120 },
    contactWithinMin: { type: Number, default: TEAM_DEFAULTS.contactWithinMin, min: 5, max: 240 },
    maxPendingAccept: { type: Number, default: TEAM_DEFAULTS.maxPendingAccept, min: 1, max: 20 },
    autoMoveOnAcceptTimeout: { type: Boolean, default: TEAM_DEFAULTS.autoMoveOnAcceptTimeout },
  },
  { timestamps: true },
)
teamSchema.plugin(auditFields)

/** Collection name `user` matches Better Auth's default so auth (M1) and the CRM share one user record. */
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    emailVerified: { type: Boolean, default: false },
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    phone: { type: String, validate: { validator: (v: string) => isE164(v), message: 'phone must be E.164 (+92…)' } },
    image: String,
    /** scrypt hash 'salt:hash' (src/server/auth/password.ts). Never selected by default. */
    passwordHash: { type: String, select: false },
    role: { type: String, enum: ROLES, required: true, default: DEFAULT_ROLE },
    departmentId: { type: ObjectId, ref: 'Department', default: null },
    managerId: { type: ObjectId, ref: 'User', default: null },
    isActive: { type: Boolean, default: true },
    autoPausedAt: { type: Date, default: null },
    /** Set when an admin/manager chose the password — the user must pick their own at next sign-in. */
    mustChangePassword: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'user' },
)
userSchema.index({ departmentId: 1, role: 1, isActive: 1 })
userSchema.plugin(auditFields)
userSchema.plugin(softDelete)

const attendanceSchema = new Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true },
    /** Pakistan calendar date, YYYY-MM-DD (src/lib/dates-pkt.ts → pktDateKey). */
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    status: { type: String, enum: ATTENDANCE_STATUSES, required: true },
    checkInAt: { type: Date, required: true },
    /** Latest (re-)check-in today — used for the auto check-out grace period. */
    lastCheckInAt: { type: Date, default: null },
    checkOutAt: { type: Date, default: null },
    breaks: [{ _id: false, startAt: { type: Date, required: true }, endAt: { type: Date, default: null } }],
    location: { type: new Schema({ lat: Number, lng: Number }, { _id: false }), default: undefined },
  },
  { timestamps: true },
)
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true })
attendanceSchema.index({ date: 1, status: 1 })

/** Signed-in sessions. Cookie holds a random token; we store only its SHA-256 hash. Expires via TTL. */
const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: ObjectId, ref: 'User', required: true, index: true },
    expiresAt: { type: Date, required: true },
    userAgent: String,
  },
  { timestamps: true },
)
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const Session = defineModel('Session', sessionSchema)
export const Department = defineModel('Department', departmentSchema)
export const Team = defineModel('Team', teamSchema)
export const User = defineModel('User', userSchema)
export const Attendance = defineModel('Attendance', attendanceSchema)

export type DepartmentDoc = InferSchemaType<typeof departmentSchema>
export type TeamDoc = InferSchemaType<typeof teamSchema>
export type UserDoc = InferSchemaType<typeof userSchema>
export type AttendanceDoc = InferSchemaType<typeof attendanceSchema>
