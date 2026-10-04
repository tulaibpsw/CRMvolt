import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/common/action-form'
import { SelectField, TextAreaField, TextField } from '@/components/common/fields'
import { PageHeader } from '@/components/common/page-header'
import { SectionCard } from '@/components/common/section-card'
import { StatusBadge } from '@/components/common/status-badge'
import { UserAdminList } from '@/components/crm/user-admin-list'
import type { Role } from '@/domain/constants'
import { en } from '@/i18n/en'
import { requireRole } from '@/server/auth/session'
import { isAdminRole } from '@/server/auth/scope'
import { connectDb } from '@/server/db/connection'
import { SheetRow } from '@/server/db/models'
import { createUserAction, pullSheetAction, saveSheetConfigAction, saveThemeAction, saveWorkingHoursAction } from '@/server/actions'
import { listDepartments, listUsers } from '@/server/services/queries'
import { getSetting } from '@/server/services/settings'
import { previewSheet } from '@/server/services/sheet'
import { THEME_PRESETS } from '@/styles/runtime-theme'

export const metadata = { title: 'Settings' }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Roles each viewer may create (server rule in actions.ts → creatableRoles). */
function creatable(role: Role): Role[] {
  if (role === 'super_admin') return ['manager', 'agent', 'field_agent', 'admin']
  return ['agent', 'field_agent']
}

export default async function SettingsPage() {
  const user = await requireRole('admin', 'manager')
  const admin = isAdminRole(user.role)
  await connectDb()
  const [users, departments, sheet, hours, theme] = await Promise.all([listUsers(user), listDepartments(), getSetting('sheet_config'), getSetting('working_hours'), getSetting('theme')])
  const [preview, rowStats, failedRows] = admin
    ? await Promise.all([
        sheet.spreadsheetId ? previewSheet().catch((e: Error) => e.message) : Promise.resolve(null),
        SheetRow.aggregate<{ _id: string; n: number; last: Date }>([{ $group: { _id: '$status', n: { $sum: 1 }, last: { $max: '$updatedAt' } } }]),
        SheetRow.find({ status: 'failed' }).sort({ updatedAt: -1 }).limit(5).lean(),
      ])
    : [null, [], []]
  const roleOptions = creatable(user.role).map((r) => ({ value: r, label: en.role[r] }))

  return (
    <>
      <PageHeader title="Settings" description={user.role === 'manager' ? 'Add your call agents and field agents. New people choose their own password at first sign-in.' : undefined} />

      <SectionCard title="Users" description="New users must choose their own password at first sign-in. Call agents join their department's assignment order automatically.">
        <div className="grid gap-6 lg:grid-cols-2">
          <UserAdminList users={users} viewer={{ id: user.id, role: user.role }} />
          <ActionForm action={createUserAction} resetOnSuccess>
            <p className="font-medium">Add a user</p>
            <TextField label="Full name" name="name" required />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Username (for sign in)" name="username" required autoCapitalize="none" autoComplete="off" pattern="[a-z0-9._\-]{3,30}" />
              <TextField label="Temporary password (8+)" name="password" type="text" minLength={8} required autoComplete="off" hint="They change it at first sign-in" />
              <TextField label="Phone" name="phone" inputMode="tel" />
              <TextField label="Email (optional)" name="email" type="email" />
              <SelectField label="Role" name="role" defaultValue="agent" options={roleOptions} />
              {admin ? <SelectField label="Department" name="departmentId" placeholder="—" options={departments.map((d) => ({ value: d.id, label: d.name }))} /> : null}
            </div>
            <Button type="submit" size="touch" className="w-full">
              Add user
            </Button>
          </ActionForm>
        </div>
      </SectionCard>

      {admin ? (
        <>
          <SectionCard title="Appearance" description="Brand colours for everyone. Text colours are adjusted automatically so the app stays readable.">
            <ActionForm action={saveThemeAction}>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {THEME_PRESETS.map((p) => (
                  <label key={p.id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 border-border px-3 has-[:checked]:border-secondary">
                    <input type="radio" name="preset" value={p.id} className="size-5 accent-primary" defaultChecked={p.colors.brand === theme.brand && p.colors.ink === theme.ink} />
                    <span className="flex shrink-0 overflow-hidden rounded-md ring-1 ring-foreground/10" aria-hidden>
                      <span className="size-6" style={{ background: p.colors.brand }} />
                      <span className="size-6" style={{ background: p.colors.ink }} />
                    </span>
                    <span className="text-sm font-medium">{p.name}</span>
                  </label>
                ))}
                <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 border-border px-3 has-[:checked]:border-secondary">
                  <input type="radio" name="preset" value="custom" className="size-5 accent-primary" defaultChecked={!THEME_PRESETS.some((p) => p.colors.brand === theme.brand && p.colors.ink === theme.ink)} />
                  <span className="text-sm font-medium">Custom colours ↓</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-6">
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="color" name="brand" defaultValue={theme.brand} className="h-11 w-16 cursor-pointer rounded-lg border border-input bg-card" />
                  Brand colour (buttons, highlights)
                </label>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="color" name="ink" defaultValue={theme.ink} className="h-11 w-16 cursor-pointer rounded-lg border border-input bg-card" />
                  Dark colour (menu, dark buttons)
                </label>
              </div>
              <Button type="submit" size="touch">
                Save colours
              </Button>
            </ActionForm>
          </SectionCard>

          <SectionCard title="Google Sheet" description='Share the Sheet as "Anyone with the link → Viewer" and keep the link private (it shows customer phones). The CRM reads new rows every minute.'>
            <div className="grid gap-6 lg:grid-cols-2">
              <ActionForm action={saveSheetConfigAction}>
                <TextField label="Sheet link" name="spreadsheet" defaultValue={sheet.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}` : ''} required />
                <TextField label="Tabs to read (Tab:DEPARTMENT, comma separated)" name="tabs" defaultValue={sheet.tabs.map((t) => (t.department ? `${t.name}:${t.department}` : t.name)).join(', ')} hint="e.g. Leads:INSTALLATION — leave the department off to route by campaign keywords" />
                <TextAreaField label='Column overrides (JSON), e.g. {"Client Name": "name", "Junk": "ignore"}' name="headerOverrides" rows={3} defaultValue={JSON.stringify(sheet.headerOverrides)} />
                <Button type="submit" size="touch">
                  Save Sheet settings
                </Button>
              </ActionForm>
              <div className="space-y-3">
                <ActionForm action={pullSheetAction}>
                  <SelectField
                    label="Pull now"
                    name="mode"
                    defaultValue="live"
                    options={[
                      { value: 'live', label: 'New rows only (normal)' },
                      { value: 'history', label: 'First time: import ALL rows as history (match Call Agent names, no alerts)' },
                      { value: 'skip', label: 'First time: skip existing rows — start from now' },
                    ]}
                  />
                  <Button type="submit" variant="secondary" size="touch" className="w-full">
                    Run
                  </Button>
                </ActionForm>
                <p className="text-xs text-muted-foreground">
                  Rows handled:{' '}
                  {rowStats.length
                    ? rowStats.map((r) => `${r._id} ${r.n}`).join(' · ')
                    : 'none yet — choose a "First time" option once'}
                </p>
                {failedRows.length ? (
                  <div className="rounded-lg bg-tone-danger-soft p-3 text-xs text-tone-danger-soft-foreground">
                    <p className="font-medium">Rows that could not be imported (tried 3 times):</p>
                    <ul className="mt-1 list-disc ps-4">
                      {failedRows.map((r) => (
                        <li key={String(r._id)}>
                          Row {r.sheetRow}: {r.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
            {typeof preview === 'string' ? <p className="mt-3 text-sm text-destructive">{preview}</p> : null}
            {Array.isArray(preview)
              ? preview.map((p) => (
                  <div key={p.tab} className="mt-4 space-y-2 text-sm">
                    <p className="font-medium">
                      Tab “{p.tab}” — {p.rows} rows
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(p.detection.mapping).map(([h, f]) => (
                        <StatusBadge key={h} label={`${h} → ${en.sheetField[f]}`} tone="success" size="sm" />
                      ))}
                      {p.detection.dynamic.map((h) => (
                        <StatusBadge key={h} label={`${h} → kept as extra`} tone="neutral" size="sm" />
                      ))}
                      {p.detection.missingRequired.map((f) => (
                        <StatusBadge key={f} label={`Missing: ${en.sheetField[f]}`} tone="danger" size="sm" />
                      ))}
                    </div>
                  </div>
                ))
              : null}
          </SectionCard>

          <SectionCard title="Working hours (Pakistan time)" description="Night and holiday leads wait for the morning. Agents are checked out automatically 30 minutes after closing.">
            <ActionForm action={saveWorkingHoursAction}>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Opens" name="start" type="time" defaultValue={hours.start} />
                <TextField label="Closes" name="end" type="time" defaultValue={hours.end} />
              </div>
              <div className="flex flex-wrap gap-3">
                {DAYS.map((d, i) => (
                  <label key={d} className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" name="days" value={i} defaultChecked={hours.days.includes(i)} className="size-5 accent-primary" />
                    {d}
                  </label>
                ))}
              </div>
              <Button type="submit" size="touch">
                Save hours
              </Button>
            </ActionForm>
          </SectionCard>
        </>
      ) : null}
    </>
  )
}
