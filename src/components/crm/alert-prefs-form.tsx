import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/common/action-form'
import { AGENT_ACTIVITY_EVENTS, type AgentActivityEvent, type AlertScope } from '@/domain/constants'
import { en } from '@/i18n/en'
import { saveAlertPrefsAction } from '@/server/actions'

/** Settings → My alerts: which employee actions this manager hears about, for all employees or only the ticked ones. */
export function AlertPrefsForm({ prefs, employees }: { prefs: { events: AgentActivityEvent[]; scope: AlertScope; agentIds: string[] }; employees: { id: string; name: string; role: string }[] }) {
  return (
    <ActionForm action={saveAlertPrefsAction}>
      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-semibold">Alert me when an employee…</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {AGENT_ACTIVITY_EVENTS.map((e) => (
            <label key={e} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted/50">
              <input type="checkbox" name="events" value={e} defaultChecked={prefs.events.includes(e)} className="size-5 accent-primary" />
              {en.agentActivity[e]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-semibold">For which employees?</legend>
        {(['all', 'selected'] as const).map((s) => (
          <label key={s} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted/50">
            <input type="radio" name="scope" value={s} defaultChecked={prefs.scope === s} className="size-5 accent-primary" />
            {en.alertScope[s]}
          </label>
        ))}
        {employees.length ? (
          <div className="grid gap-1 ps-8 sm:grid-cols-2">
            {employees.map((u) => (
              <label key={u.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted/50">
                <input type="checkbox" name="agentIds" value={u.id} defaultChecked={prefs.agentIds.includes(u.id)} className="size-5 accent-primary" />
                {u.name} <span className="text-xs text-muted-foreground">({en.role[u.role as keyof typeof en.role] ?? u.role})</span>
              </label>
            ))}
          </div>
        ) : null}
      </fieldset>
      <p className="text-xs text-muted-foreground">Alerts appear in the bell (top right). Closes, missed accepts and Sheet problems always come to managers.</p>
      <Button type="submit" size="touch">
        Save my alerts
      </Button>
    </ActionForm>
  )
}
