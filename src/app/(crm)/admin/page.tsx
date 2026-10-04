import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ClipboardCheck, Palette, Settings, ShieldCheck, UserCog, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/common/action-form'
import { ActionTile } from '@/components/common/action-tile'
import { SelectField, TextField } from '@/components/common/fields'
import { PageHeader } from '@/components/common/page-header'
import { SectionCard } from '@/components/common/section-card'
import { StatusBadge } from '@/components/common/status-badge'
import { UserAdminList } from '@/components/crm/user-admin-list'
import { DEPARTMENT_META } from '@/domain/ui-maps'
import { en } from '@/i18n/en'
import { formatPktDateTime } from '@/lib/dates-pkt'
import { formatPkrCompact } from '@/lib/money'
import { requireRole } from '@/server/auth/session'
import { createUserAction } from '@/server/actions'
import { getAdminOverview } from '@/server/services/admin'
import { listDepartments, listUsers } from '@/server/services/queries'

export const metadata = { title: 'Company admin' }

function Health({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-start gap-3 py-2">
      {ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-tone-success" aria-hidden /> : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-tone-warning" aria-hidden />}
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
    </li>
  )
}

/** Company-wide view for the owner (super admin) and admins. Only the super admin manages managers and admins. */
export default async function AdminPage() {
  const user = await requireRole('admin')
  const superAdmin = user.role === 'super_admin'
  const [data, users, departments] = await Promise.all([getAdminOverview(), listUsers(user), listDepartments()])
  const leaders = users.filter((u) => u.role === 'manager' || u.role === 'admin' || u.role === 'super_admin')
  const h = data.health

  return (
    <>
      <PageHeader title="Company admin" description={superAdmin ? 'You are the super admin: you can add and remove managers and admins, and change everything an admin can.' : 'Company overview. Managers and admins are managed by the super admin.'} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ActionTile href="/review" label="Closes waiting for approval" icon={ClipboardCheck} count={data.counts.pendingCloses} tone="warning" />
        <ActionTile href="/leads?view=all" label="Open leads" icon={Users} count={data.counts.openLeads} tone="info" />
        <ActionTile href="/team" label={`Checked in now (of ${data.counts.activeUsers} users)`} icon={UserCog} count={data.counts.checkedIn} tone="success" />
        <ActionTile href="/settings" label="Settings, users & colours" icon={Settings} tone="brand" />
      </div>

      <SectionCard title="Departments">
        <div className="grid gap-3 md:grid-cols-2">
          {data.departments.map((d) => (
            <div key={d.id} className="space-y-2 rounded-xl bg-muted/50 p-4">
              <div className="flex items-center justify-between gap-2">
                <StatusBadge {...DEPARTMENT_META[d.code]} />
                {d.paused ? <StatusBadge label="Auto-assign paused" tone="warning" size="sm" /> : null}
              </div>
              <p className="text-sm">
                Manager: <span className="font-medium">{d.managers.join(', ') || 'none — add one below'}</span>
              </p>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Call agents</dt>
                  <dd className="font-heading text-lg font-semibold tabular-nums">{d.agents}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Field agents</dt>
                  <dd className="font-heading text-lg font-semibold tabular-nums">{d.fieldAgents}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Checked in</dt>
                  <dd className="font-heading text-lg font-semibold tabular-nums">{d.checkedIn}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Open leads</dt>
                  <dd className="font-heading text-lg font-semibold tabular-nums">{d.openLeads}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Won this month (approved)</dt>
                  <dd className="font-heading text-lg font-semibold tabular-nums">
                    {d.wonThisMonth} · {formatPkrCompact(d.wonValueThisMonth)}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Managers & admins" description={superAdmin ? 'Add, deactivate or remove managers and admins. New people choose their own password at first sign-in.' : 'Only the super admin can change these.'}>
          <UserAdminList users={leaders} viewer={{ id: user.id, role: user.role }} />
          {superAdmin ? (
            <ActionForm action={createUserAction} resetOnSuccess className="mt-4 border-t border-border pt-4">
              <p className="font-medium">Add a manager or admin</p>
              <TextField label="Full name" name="name" required />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Username (for sign in)" name="username" required autoCapitalize="none" autoComplete="off" />
                <TextField label="Temporary password (8+)" name="password" type="text" minLength={8} required autoComplete="off" />
                <TextField label="Phone" name="phone" inputMode="tel" />
                <TextField label="Email (optional)" name="email" type="email" />
                <SelectField label="Role" name="role" defaultValue="manager" options={[{ value: 'manager', label: en.role.manager }, { value: 'admin', label: en.role.admin }]} />
                <SelectField label="Department (managers)" name="departmentId" placeholder="—" options={departments.map((d) => ({ value: d.id, label: d.name }))} />
              </div>
              <Button type="submit" size="touch" className="w-full">
                Add
              </Button>
            </ActionForm>
          ) : null}
        </SectionCard>

        <SectionCard title="System health">
          <ul className="divide-y divide-border">
            <Health ok={h.sheetConfigured && !!h.sheetLastActivity && h.sheetFailedRows === 0} label="Google Sheet import" hint={!h.sheetConfigured ? 'Not set up — Settings → Google Sheet.' : h.sheetFailedRows ? `${h.sheetFailedRows} rows could not be imported — see Settings.` : h.sheetLastActivity ? `Working · last row ${formatPktDateTime(new Date(h.sheetLastActivity))}` : 'Connected — in Settings → Google Sheet run a "First time" option once'} />
            <Health ok={h.cronSecret && h.cronLate === 0} label="Timers (cron every minute)" hint={!h.cronSecret ? 'CRON_SECRET is missing on the server.' : h.cronLate ? `${h.cronLate} timers are late — check cron-job.org is calling /api/cron/tick.` : 'On time'} />
            <Health ok={h.failedJobs === 0} label="Background jobs" hint={h.failedJobs ? `${h.failedJobs} jobs failed — tell the developer.` : 'No failures'} />
            <Health ok={h.whatsapp} label="WhatsApp API" hint={h.whatsapp ? 'Connected' : 'Not connected yet — see docs/whatsapp-setup.md'} />
            <Health ok={h.cloudinary} label="Screenshot storage (Cloudinary)" hint={h.cloudinary ? 'Ready' : 'Keys missing — agents cannot upload screenshots'} />
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild variant="outline" size="touch">
              <Link href="/settings">
                <Palette data-icon="inline-start" />
                Colours & settings
              </Link>
            </Button>
            <Button asChild variant="outline" size="touch">
              <Link href="/review">
                <ShieldCheck data-icon="inline-start" />
                Proof review
              </Link>
            </Button>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Recent admin activity" description="Who changed users, teams and settings.">
        {data.audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {data.audit.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{a.actor}</span> {a.action.replace('_', ' ')} {a.entity}
                  {a.target ? ` · ${a.target}` : ''}
                  {a.after && 'key' in a.after ? ` · ${String(a.after.key)}` : ''}
                </span>
                <span className="text-muted-foreground">{formatPktDateTime(new Date(a.at))}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  )
}
