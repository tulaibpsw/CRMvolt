import { MapPin, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/common/action-form'
import { SelectField, TextAreaField, TextField } from '@/components/common/fields'
import { PageHeader } from '@/components/common/page-header'
import { SectionCard } from '@/components/common/section-card'
import { EmptyState } from '@/components/common/states'
import { StatusBadge } from '@/components/common/status-badge'
import { VISIT_STATUSES } from '@/domain/constants'
import { VISIT_STATUS_META } from '@/domain/ui-maps'
import { formatPktDateTime } from '@/lib/dates-pkt'
import { formatPhone } from '@/lib/phone'
import { requireRole } from '@/server/auth/session'
import { createVisitAction, updateVisitAction } from '@/server/actions'
import { getTeamBoard, listVisits } from '@/server/services/queries'
import { FIELD_AGENT_VISIT_STATUSES, fieldAgentLoad } from '@/server/services/visits'

export const metadata = { title: 'Site visits' }

/** Excel "Visits" tab: each visit goes to the field agent with the least active kW; "Not interested" → next agent. */
export default async function VisitsPage() {
  const user = await requireRole('admin', 'manager', 'field_agent')
  const visits = await listVisits(user)
  const fieldAgents = user.role === 'field_agent' ? [] : (await getTeamBoard({ ...user, role: 'admin' })).filter((m) => m.role === 'field_agent')
  const load = user.role === 'field_agent' ? new Map() : await fieldAgentLoad()
  return (
    <>
      <PageHeader title="Site visits" description="Load-balanced by kW across the field agents." />

      {user.role !== 'field_agent' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Field agents — active kW">
            {fieldAgents.length === 0 ? (
              <EmptyState title="No field agents" description="Add them in Settings → Users with role Field agent." />
            ) : (
              <ul className="divide-y divide-border">
                {fieldAgents
                  .map((a) => ({ ...a, ...(load.get(a.id) ?? { kw: 0, visits: 0 }) }))
                  .sort((a, b) => a.kw - b.kw)
                  .map((a) => (
                    <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="font-medium">{a.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {a.kw} kW · {a.visits} visits
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="New visit (without a lead)">
            <ActionForm action={createVisitAction} resetOnSuccess>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Customer name" name="customerName" required />
                <TextField label="Phone" name="phone" required inputMode="tel" />
                <TextField label="System size (kW)" name="kw" type="number" min={1} step="0.5" required />
                <TextField label="Visit date & time" name="scheduledAt" type="datetime-local" />
              </div>
              <TextField label="Address" name="address" required />
              <TextField label="Location link (https://…)" name="locationUrl" type="url" />
              <TextAreaField label="Requirement" name="requirement" rows={2} />
              <Button type="submit" size="touch" className="w-full">
                Create & assign
              </Button>
            </ActionForm>
          </SectionCard>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {visits.length === 0 ? <EmptyState title="No visits yet" /> : null}
        {visits.map((v) => (
          <article key={v.id} className="space-y-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {v.customerName} · {v.kw} kW
                </p>
                <p className="text-sm text-muted-foreground">{v.address}</p>
                <p className="text-xs text-muted-foreground">
                  {v.scheduledAt ? formatPktDateTime(new Date(v.scheduledAt)) : 'No time set'} · {v.agent?.name ?? 'Unassigned'}
                  {v.tried.length ? ` · tried: ${v.tried.join(', ')}` : ''}
                </p>
              </div>
              <StatusBadge {...VISIT_STATUS_META[v.status]} size="sm" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="touch">
                <a href={`tel:${v.phone}`}>
                  <Phone data-icon="inline-start" />
                  {formatPhone(v.phone)}
                </a>
              </Button>
              {/^https:\/\//i.test(v.locationUrl) ? (
                <Button asChild variant="outline" size="touch">
                  <a href={v.locationUrl} target="_blank" rel="noreferrer">
                    <MapPin data-icon="inline-start" />
                    Map
                  </a>
                </Button>
              ) : null}
            </div>
            {v.feedback ? <p className="text-sm">{v.feedback}</p> : null}
            {v.status === 'assigned' || v.status === 'rescheduled' || user.role !== 'field_agent' ? (
              <ActionForm action={updateVisitAction}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="visitId" value={v.id} />
                  <SelectField
                    label="Status"
                    name="status"
                    defaultValue={user.role === 'field_agent' ? 'completed' : v.status}
                    options={(user.role === 'field_agent' ? FIELD_AGENT_VISIT_STATUSES : VISIT_STATUSES).map((s) => ({ value: s, label: VISIT_STATUS_META[s].label }))}
                  />
                  <TextField label="New time (if rescheduled)" name="scheduledAt" type="datetime-local" />
                  <TextAreaField label="What happened? (required)" name="feedback" rows={2} className="sm:col-span-2" required minLength={5} />
                  <Button type="submit" variant="secondary" size="xl" className="sm:col-span-2">
                    Update visit
                  </Button>
                </div>
              </ActionForm>
            ) : null}
          </article>
        ))}
      </div>
    </>
  )
}
