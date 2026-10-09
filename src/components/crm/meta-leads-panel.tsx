import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/common/action-form'
import { DEPARTMENTS } from '@/domain/constants'
import { DEPARTMENT_META } from '@/domain/ui-maps'
import { formatPktDateTime } from '@/lib/dates-pkt'
import { connectMetaPageAction, saveMetaFormsAction, syncMetaLeadsAction } from '@/server/actions'
import type { MetaLeadsState } from '@/server/services/settings'

/** Settings → Meta lead forms: connection status, which department each form feeds, and "Fetch from Meta". */
export function MetaLeadsPanel({ missing, webhookUrl, state, leadCount }: { missing: string[]; webhookUrl: string; state: MetaLeadsState; leadCount: number }) {
  const connected = !missing.includes('META_PAGE_ID') && !missing.includes('META_PAGE_ACCESS_TOKEN')
  const forms = Object.entries(state.forms ?? {}).sort((a, b) => (b[1].lastLeadAt ?? '').localeCompare(a[1].lastLeadAt ?? ''))
  return (
    <div className="space-y-4">
      <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ${missing.length ? 'bg-tone-warning-soft text-tone-warning-soft-foreground' : 'bg-tone-success-soft text-tone-success-soft-foreground'}`}>
        {missing.length ? <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />}
        <div className="space-y-1">
          <p className="font-medium">{missing.length ? `Not connected yet — add in Vercel: ${missing.join(', ')}` : 'Connected to Meta'}</p>
          <p>
            Webhook URL for Meta (Page → field <span className="font-mono">leadgen</span>): <span className="break-all font-mono">{webhookUrl}</span>
          </p>
          <p>
            {leadCount} lead(s) came from Meta so far
            {state.lastWebhookAt ? ` · last live lead ${formatPktDateTime(new Date(state.lastWebhookAt))}` : ''}
            {state.lastSyncAt ? ` · last check ${formatPktDateTime(new Date(state.lastSyncAt))}` : ''}
          </p>
          {state.lastError ? <p className="rounded-md bg-tone-danger-soft px-2 py-1 text-tone-danger-soft-foreground">Last problem: {state.lastError}</p> : null}
        </div>
      </div>

      <ActionForm action={connectMetaPageAction} className="rounded-xl p-3 ring-1 ring-foreground/10">
        <p className="font-medium">Live leads</p>
        <p className="text-sm text-muted-foreground">
          {state.subscribedAt
            ? `Turned on ${formatPktDateTime(new Date(state.subscribedAt))}. Press again only if Meta was reconnected or the token changed.`
            : 'Press once after the keys are in Vercel and the webhook is saved in Meta. Meta will then send every new form lead here.'}
        </p>
        <Button type="submit" size="touch" disabled={!connected}>
          Turn on live leads
        </Button>
      </ActionForm>

      {forms.length ? (
        <ActionForm action={saveMetaFormsAction} className="rounded-xl p-3 ring-1 ring-foreground/10">
          <p className="font-medium">Lead forms → department</p>
          <ul className="divide-y divide-border">
            {forms.map(([id, f]) => (
              <li key={id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{f.name || id}</span>
                  <span className="block text-xs text-muted-foreground">
                    {f.leads ?? 0} lead(s){f.status && f.status !== 'ACTIVE' ? ` · ${f.status.toLowerCase()}` : ''}
                    {f.lastLeadAt ? ` · last ${formatPktDateTime(new Date(f.lastLeadAt))}` : ''}
                  </span>
                </span>
                <select key={`${id}:${f.department ?? ''}`} name={`form:${id}`} defaultValue={f.department ?? ''} aria-label={`Department for ${f.name}`} className="h-11 rounded-lg border border-input bg-card px-3">
                  <option value="">Auto (campaign keywords)</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {DEPARTMENT_META[d].label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <Button type="submit" size="touch">
            Save departments
          </Button>
        </ActionForm>
      ) : (
        <p className="text-sm text-muted-foreground">No lead forms seen yet. They appear here after the first lead or after “Fetch leads from Meta”.</p>
      )}

      <ActionForm action={syncMetaLeadsAction} className="rounded-xl p-3 ring-1 ring-foreground/10">
        <p className="font-medium">Fetch leads from Meta</p>
        <p className="text-sm text-muted-foreground">
          New leads arrive by themselves within seconds. The CRM also checks Meta every 15 minutes. Use this for older leads (Meta keeps 90 days). Customers already in the CRM (e.g. from the Google Sheet) are skipped, so nothing is doubled.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">From the last</span>
            <select name="days" defaultValue="2" className="h-11 rounded-lg border border-input bg-card px-3">
              <option value="1">1 day</option>
              <option value="2">2 days</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
          </label>
          <Button type="submit" size="touch" disabled={!connected}>
            Fetch leads from Meta
          </Button>
        </div>
      </ActionForm>
    </div>
  )
}
