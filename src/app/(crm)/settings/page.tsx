import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/common/action-form'
import { SelectField, TextField } from '@/components/common/fields'
import { UsernameField } from '@/components/common/username-field'
import { SheetSources } from '@/components/crm/sheet-sources'
import { AlertPrefsForm } from '@/components/crm/alert-prefs-form'
import { User } from '@/server/db/models'
import { prefsOf } from '@/server/services/watch'
import { PageHeader } from '@/components/common/page-header'
import { SectionCard } from '@/components/common/section-card'
import { UserAdminList } from '@/components/crm/user-admin-list'
import type { Role } from '@/domain/constants'
import { en } from '@/i18n/en'
import { requireRole } from '@/server/auth/session'
import { isAdminRole } from '@/server/auth/scope'
import { connectDb } from '@/server/db/connection'
import { createUserAction, saveThemeAction, saveWorkingHoursAction } from '@/server/actions'
import { listDepartments, listUsers } from '@/server/services/queries'
import { getSetting } from '@/server/services/settings'
import { getSheetSources, statusKey } from '@/server/services/sheet'
import type { SheetTabStatus } from '@/domain/sheet-columns'
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
  const [users, departments, allSheets, sheetStatus, hours, theme] = await Promise.all([listUsers(user), listDepartments(), getSheetSources(), getSetting('sheet_status'), getSetting('working_hours'), getSetting('theme')])
  const me = await User.findById(user.id).select('role alertPrefs').lean()
  const myAlerts = prefsOf(me ?? { role: user.role })
  const employees = users.filter((u) => (u.role === 'agent' || u.role === 'field_agent') && u.isActive).map((u) => ({ id: u.id, name: u.name, role: u.role }))
  // Managers see and manage only their department's sheets.
  const sheets = admin ? allSheets : allSheets.filter((s) => s.department === user.departmentCode)
  const statusOf: Record<string, Record<string, SheetTabStatus | undefined>> = Object.fromEntries(sheets.map((s) => [s.id, Object.fromEntries(s.tabs.map((t) => [t, sheetStatus[statusKey(s, t)]]))]))
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
              <UsernameField />
              <TextField label="Temporary password" name="password" type="text" minLength={8} required autoComplete="off" hint="At least 8 characters, not 12345678. They choose their own at first sign-in." />
              <TextField label="Phone (optional)" name="phone" inputMode="tel" placeholder="0300 1234567" hint="03XX XXXXXXX or +92…" />
              <TextField label="Email (optional)" name="email" type="email" hint="Leave empty if they have none" />
              <SelectField label="Role" name="role" defaultValue="agent" options={roleOptions} />
              {admin ? <SelectField label="Department" name="departmentId" placeholder="—" options={departments.map((d) => ({ value: d.id, label: d.name }))} /> : null}
            </div>
            <Button type="submit" size="touch" className="w-full">
              Add user
            </Button>
          </ActionForm>
        </div>
      </SectionCard>

      <section id="my-alerts" className="scroll-mt-20">
        <SectionCard title="My alerts" description="Choose what your employees do that you want to hear about — for everyone, or only some people.">
          <AlertPrefsForm prefs={myAlerts} employees={employees} />
        </SectionCard>
      </section>

      <section id="google-sheets" className="scroll-mt-20">
        <SectionCard title="Google Sheets" description={admin ? 'Every connected Sheet, by department. New rows are synced every minute.' : 'Connect your department\'s leads Sheet. New rows are synced every minute and go to your team.'}>
          <SheetSources sources={sheets} statusOf={statusOf} isAdmin={admin} defaultDepartment={user.departmentCode} />
        </SectionCard>
      </section>

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
