import 'server-only'
import type { Department, Role } from '@/domain/constants'
import { pktDateKey } from '@/lib/dates-pkt'
import { getServerEnv } from '@/lib/env'
import { connectDb } from '@/server/db/connection'
import { Attendance, AuditLog, Department as DepartmentModel, Job, Lead, SheetRow, Team, User } from '@/server/db/models'
import { getSetting } from '@/server/services/settings'

/** Company-wide numbers + system health for the admin / super-admin dashboard. */
export async function getAdminOverview() {
  await connectDb()
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const [departments, teams, users, present, openByDept, wonByDept, pendingCloses, sheet, sheetLast, sheetFailed, overdueJobs, failedJobs, audit] = await Promise.all([
    DepartmentModel.find().lean(),
    Team.find().lean(),
    User.find({ deletedAt: null }).select('name role departmentId isActive lastLoginAt').lean(),
    Attendance.find({ date: pktDateKey(now), status: { $in: ['checked_in', 'on_break'] } }).select('userId').lean(),
    Lead.aggregate<{ _id: unknown; n: number }>([{ $match: { status: 'open', deletedAt: null } }, { $group: { _id: '$departmentId', n: { $sum: 1 } } }]),
    Lead.aggregate<{ _id: unknown; n: number; v: number }>([
      { $match: { status: 'won', 'closeReview.status': { $ne: 'pending' }, closedAt: { $gte: monthStart }, deletedAt: null } },
      { $group: { _id: '$departmentId', n: { $sum: 1 }, v: { $sum: { $ifNull: ['$wonValuePkr', 0] } } } },
    ]),
    Lead.countDocuments({ 'closeReview.status': 'pending', deletedAt: null }),
    getSetting('sheet_config'),
    SheetRow.findOne().sort({ updatedAt: -1 }).select('updatedAt').lean(),
    SheetRow.countDocuments({ status: 'failed', tries: { $gte: 3 } }),
    // Timers more than 10 minutes late mean the cron (cron-job.org) is not calling /api/cron/tick.
    Job.countDocuments({ status: 'pending', dueAt: { $lt: new Date(now.getTime() - 10 * 60_000) } }),
    Job.countDocuments({ status: 'failed' }),
    AuditLog.find().sort({ at: -1 }).limit(25).lean(),
  ])
  const presentSet = new Set(present.map((a) => String(a.userId)))
  const name = new Map(users.map((u) => [String(u._id), u.name]))
  const env = getServerEnv()
  return {
    counts: {
      activeUsers: users.filter((u) => u.isActive).length,
      managers: users.filter((u) => u.role === 'manager' && u.isActive).length,
      checkedIn: presentSet.size,
      openLeads: openByDept.reduce((s, r) => s + r.n, 0),
      pendingCloses,
    },
    departments: departments.map((d) => {
      const members = users.filter((u) => String(u.departmentId) === String(d._id) && u.isActive)
      const team = teams.find((t) => String(t.departmentId) === String(d._id))
      const won = wonByDept.find((r) => String(r._id) === String(d._id))
      return {
        id: String(d._id),
        code: d.code as Department,
        name: d.name,
        managers: members.filter((u) => u.role === 'manager').map((u) => u.name),
        agents: members.filter((u) => u.role === 'agent').length,
        fieldAgents: members.filter((u) => u.role === 'field_agent').length,
        checkedIn: members.filter((u) => presentSet.has(String(u._id))).length,
        openLeads: openByDept.find((r) => String(r._id) === String(d._id))?.n ?? 0,
        wonThisMonth: won?.n ?? 0,
        wonValueThisMonth: won?.v ?? 0,
        paused: !!team?.paused,
      }
    }),
    health: {
      sheetConfigured: !!sheet.spreadsheetId,
      sheetLastActivity: sheetLast?.updatedAt?.toISOString() ?? null,
      sheetFailedRows: sheetFailed,
      cronLate: overdueJobs,
      failedJobs,
      whatsapp: !!(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_APP_SECRET && env.WHATSAPP_VERIFY_TOKEN),
      cloudinary: !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET),
      cronSecret: !!env.CRON_SECRET,
    },
    audit: audit.map((a) => ({
      id: String(a._id),
      at: a.at.toISOString(),
      actor: a.actorId ? (name.get(String(a.actorId)) ?? '—') : 'System',
      entity: a.entity,
      target: a.entityId ? (name.get(String(a.entityId)) ?? '') : '',
      action: a.action,
      after: a.after as Record<string, unknown> | null,
    })),
    managersAndAdmins: users
      .filter((u) => ['admin', 'manager', 'super_admin'].includes(u.role))
      .map((u) => ({ id: String(u._id), name: u.name, role: u.role as Role, isActive: u.isActive, departmentId: u.departmentId ? String(u.departmentId) : null, lastLoginAt: u.lastLoginAt?.toISOString() ?? null })),
  }
}
