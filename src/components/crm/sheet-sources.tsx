import { AlertTriangle, CheckCircle2, ExternalLink, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/common/action-form'
import { SelectField, TextAreaField, TextField } from '@/components/common/fields'
import { StatusBadge } from '@/components/common/status-badge'
import { DEPARTMENTS, type Department } from '@/domain/constants'
import { SHEET_COLUMN_GUIDE, type SheetSource, type SheetTabStatus } from '@/domain/sheet-columns'
import { DEPARTMENT_META } from '@/domain/ui-maps'
import { en } from '@/i18n/en'
import { formatPktDateTime } from '@/lib/dates-pkt'
import { pullSheetAction, removeSheetSourceAction, saveSheetSourceAction } from '@/server/actions'

/** What the CRM reads from a Sheet, and the rules that keep the import working. Shown under every Sheet link field. */
export function SheetColumnGuide() {
  return (
    <div className="space-y-2 rounded-xl bg-tone-info-soft p-3 text-sm text-tone-info-soft-foreground">
      <p className="font-medium">Column guide — row 1 of the tab must be the column names</p>
      <ul className="space-y-1">
        {SHEET_COLUMN_GUIDE.map((c) => (
          <li key={c.field}>
            <span className="font-medium">{c.field}</span>
            {c.required ? ' (required)' : ''}: {c.examples.map((e) => `“${e}”`).join(', ')}
          </li>
        ))}
      </ul>
      <p className="font-medium">Rules</p>
      <ol className="list-decimal space-y-1 ps-5">
        <li>Do not rename or delete these columns after connecting. If the phone, date or lead-id column changes, syncing stops and the manager gets an alert.</li>
        <li>Add new columns at the end — any extra column is kept and shown on the lead under “Sheet details”.</li>
        <li>One header row only, no merged cells, no empty rows on top.</li>
        <li>Share the Sheet as “Anyone with the link → Viewer” and keep the link private (it shows customer phones).</li>
        <li>If you really must rename a column, press “Use new columns from now” after renaming (old rows are not imported again).</li>
      </ol>
    </div>
  )
}

function TabStatus({ tab, status }: { tab: string; status?: SheetTabStatus }) {
  if (!status) return <p className="text-sm text-muted-foreground">Tab “{tab}”: not synced yet.</p>
  return (
    <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
      <p className="flex flex-wrap items-center gap-2 font-medium">
        {status.problem ? <AlertTriangle className="size-4 text-tone-danger" aria-hidden /> : <CheckCircle2 className="size-4 text-tone-success" aria-hidden />}
        Tab “{tab}” · {status.rows} rows · last sync {formatPktDateTime(new Date(status.at))}
        {status.created ? ` · ${status.created} new` : ''}
        {status.failed ? ` · ${status.failed} failed` : ''}
      </p>
      {status.problem ? <p className="rounded-md bg-tone-danger-soft px-2 py-1 text-tone-danger-soft-foreground">{status.problem}</p> : null}
      {status.warnings.map((w) => (
        <p key={w} className="rounded-md bg-tone-warning-soft px-2 py-1 text-tone-warning-soft-foreground">
          {w}
        </p>
      ))}
      {Object.keys(status.fieldHeaders).length ? (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(status.fieldHeaders).map(([field, header]) => (
            <StatusBadge key={field} label={`${header} → ${en.sheetField[field as keyof typeof en.sheetField] ?? field}`} tone="success" size="sm" />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function SourceForm({ source, isAdmin, defaultDepartment }: { source?: SheetSource; isAdmin: boolean; defaultDepartment: Department | null }) {
  return (
    <ActionForm action={saveSheetSourceAction} resetOnSuccess={!source}>
      {source ? <input type="hidden" name="sourceId" value={source.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Name (for you)" name="name" defaultValue={source?.name ?? ''} placeholder="e.g. Facebook leads Oct" required maxLength={60} />
        {isAdmin ? (
          <SelectField label="Department (leads go here)" name="department" defaultValue={source?.department ?? defaultDepartment ?? 'INSTALLATION'} options={DEPARTMENTS.map((d) => ({ value: d, label: DEPARTMENT_META[d].label }))} />
        ) : (
          <p className="self-end text-sm text-muted-foreground">Leads go to your department.</p>
        )}
      </div>
      <TextField label="Google Sheet link" name="spreadsheet" defaultValue={source ? `https://docs.google.com/spreadsheets/d/${source.spreadsheetId}` : ''} placeholder="https://docs.google.com/spreadsheets/d/…" required />
      <SheetColumnGuide />
      <TextField label="Tab name(s) — bottom of the Sheet, comma separated" name="tabs" defaultValue={source?.tabs.join(', ') ?? 'Leads'} required />
      <details>
        <summary className="flex min-h-11 cursor-pointer items-center text-sm text-muted-foreground">Advanced: my column has an unusual name</summary>
        <TextAreaField label='Column overrides (JSON), e.g. {"Client Contact": "phone", "Junk": "ignore"}' name="headerOverrides" rows={3} defaultValue={JSON.stringify(source?.headerOverrides ?? {})} />
      </details>
      <Button type="submit" size="touch" className="w-full sm:w-auto">
        {source ? 'Save changes' : 'Connect this Sheet'}
      </Button>
    </ActionForm>
  )
}

/** Settings → Google Sheets. Managers see and change only their department's sheets. */
export function SheetSources({ sources, statusOf, isAdmin, defaultDepartment }: { sources: SheetSource[]; /** sourceId → tab → last sync */ statusOf: Record<string, Record<string, SheetTabStatus | undefined>>; isAdmin: boolean; defaultDepartment: Department | null }) {
  return (
    <div className="space-y-4">
      {sources.length === 0 ? <p className="text-sm text-muted-foreground">No Sheet connected yet. Add your leads Sheet below.</p> : null}
      {sources.map((s) => {
        const tabStatuses = s.tabs.map((t) => ({ tab: t, status: statusOf[s.id]?.[t] }))
        const blocked = tabStatuses.some((t) => t.status?.problem)
        return (
          <article key={s.id} className="space-y-3 rounded-xl p-4 ring-1 ring-foreground/10">
            <div className="flex flex-wrap items-center gap-2">
              <FileSpreadsheet className="size-5 text-tone-success" aria-hidden />
              <h3 className="font-heading font-semibold">{s.name}</h3>
              <StatusBadge {...DEPARTMENT_META[s.department]} size="sm" />
              <a href={`https://docs.google.com/spreadsheets/d/${s.spreadsheetId}`} target="_blank" rel="noreferrer" className="ms-auto inline-flex min-h-11 items-center gap-1 text-sm underline">
                Open Sheet <ExternalLink className="size-4" aria-hidden />
              </a>
            </div>
            {tabStatuses.map((t) => (
              <TabStatus key={t.tab} tab={t.tab} status={t.status} />
            ))}
            <ActionForm action={pullSheetAction}>
              <input type="hidden" name="sourceId" value={s.id} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" name="mode" value="live" size="touch">
                  Sync now
                </Button>
                <Button type="submit" name="mode" value="skip" variant={blocked ? 'secondary' : 'outline'} size="touch">
                  {blocked ? 'Use new columns from now' : 'Start from now'}
                </Button>
                <Button type="submit" name="mode" value="history" variant="outline" size="touch">
                  Import ALL rows as history
                </Button>
              </div>
            </ActionForm>
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center text-sm text-muted-foreground">Edit / remove this Sheet…</summary>
              <div className="space-y-4 pt-2">
                <SourceForm source={s} isAdmin={isAdmin} defaultDepartment={defaultDepartment} />
                <ActionForm action={removeSheetSourceAction}>
                  <input type="hidden" name="sourceId" value={s.id} />
                  <div className="flex gap-2">
                    <input name="confirm" required aria-label="Type remove to confirm" placeholder='Type "remove"' autoComplete="off" className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-3" />
                    <Button type="submit" variant="destructive" size="touch">
                      Remove Sheet
                    </Button>
                  </div>
                </ActionForm>
              </div>
            </details>
          </article>
        )
      })}
      <details className="rounded-xl p-4 ring-1 ring-foreground/10" open={sources.length === 0}>
        <summary className="flex min-h-11 cursor-pointer items-center font-medium">+ Connect a Google Sheet</summary>
        <div className="pt-3">
          <SourceForm isAdmin={isAdmin} defaultDepartment={defaultDepartment} />
        </div>
      </details>
    </div>
  )
}
