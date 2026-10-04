import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/common/action-form'
import { SelectField, TextAreaField, TextField } from '@/components/common/fields'
import { PageHeader } from '@/components/common/page-header'
import { SectionCard } from '@/components/common/section-card'
import { StatusBadge } from '@/components/common/status-badge'
import { ROLES } from '@/domain/constants'
import { ROLE_META } from '@/domain/ui-maps'
import { en } from '@/i18n/en'
import { requireRole } from '@/server/auth/session'
import { createUserAction, pullSheetAction, resetPasswordAction, saveSheetConfigAction, saveWorkingHoursAction, setUserActiveAction } from '@/server/actions'
import { listDepartments, listUsers } from '@/server/services/queries'
import { getSetting } from '@/server/services/settings'
import { previewSheet } from '@/server/services/sheet'

export const metadata = { title: 'Settings' }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default async function SettingsPage() {
  const user = await requireRole('admin', 'manager')
  const [users, departments, sheet, hours] = await Promise.all([listUsers(user), listDepartments(), getSetting('sheet_config'), getSetting('working_hours')])
  const preview = user.role === 'admin' && sheet.spreadsheetId ? await previewSheet().catch((e: Error) => e.message) : null
  const roleOptions = ROLES.filter((r) => user.role === 'admin' || r === 'agent' || r === 'field_agent').map((r) => ({ value: r, label: en.role[r] }))

  return (
    <>
      <PageHeader title="Settings" />

      <SectionCard title="Users" description="Call agents are added to their department's assignment order automatically.">
        <div className="grid gap-6 lg:grid-cols-2">
          <ul className="divide-y divide-border">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {u.name} <span className="text-xs text-muted-foreground">@{u.username}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{[u.department, u.phone].filter(Boolean).join(' · ')}</p>
                </div>
                <StatusBadge {...ROLE_META[u.role]} size="sm" />
                {!u.isActive ? <StatusBadge label="Inactive" tone="neutral" size="sm" /> : null}
                {u.id !== user.id ? (
                  <form action={setUserActiveAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="active" value={String(!u.isActive)} />
                    <Button type="submit" variant="ghost" size="touch">
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </form>
                ) : null}
                {user.role === 'admin' ? (
                  <details className="w-full">
                    <summary className="cursor-pointer text-xs text-muted-foreground">Reset password</summary>
                    <ActionForm action={resetPasswordAction} className="mt-2 flex gap-2 space-y-0">
                      <input type="hidden" name="userId" value={u.id} />
                      <div className="flex gap-2">
                        <input name="password" type="password" minLength={8} aria-label="New password" placeholder="New password" className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-3" />
                        <Button type="submit" variant="outline" size="touch">
                          Set
                        </Button>
                      </div>
                    </ActionForm>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
          <ActionForm action={createUserAction} resetOnSuccess>
            <p className="font-medium">Add a user</p>
            <TextField label="Full name" name="name" required />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Username (for sign in)" name="username" required autoCapitalize="none" />
              <TextField label="Password (8+)" name="password" type="password" minLength={8} required />
              <TextField label="Phone" name="phone" inputMode="tel" />
              <TextField label="Email (optional)" name="email" type="email" />
              <SelectField label="Role" name="role" defaultValue="agent" options={roleOptions} />
              {user.role === 'admin' ? <SelectField label="Department" name="departmentId" placeholder="—" options={departments.map((d) => ({ value: d.id, label: d.name }))} /> : null}
            </div>
            <Button type="submit" size="touch" className="w-full">
              Add user
            </Button>
          </ActionForm>
        </div>
      </SectionCard>

      {user.role === 'admin' ? (
        <>
          <SectionCard title="Google Sheet" description='Share the Sheet as "Anyone with the link → Viewer". The CRM reads new rows every minute.'>
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
                      { value: 'history', label: 'Import ALL rows as history (match Call Agent names, no alerts)' },
                      { value: 'skip', label: 'Skip existing rows — start from now' },
                    ]}
                  />
                  <Button type="submit" variant="secondary" size="touch" className="w-full">
                    Run
                  </Button>
                </ActionForm>
                <p className="text-xs text-muted-foreground">Rows read so far: {Object.entries(sheet.cursor).map(([t, n]) => `${t}: ${n}`).join(' · ') || 'none'}</p>
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

          <SectionCard title="Working hours (Pakistan time)" description="Night and holiday leads wait for the morning. Agents are checked out automatically after closing.">
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
