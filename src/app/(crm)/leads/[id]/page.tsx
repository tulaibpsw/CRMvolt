import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ActionForm } from '@/components/common/action-form'
import { SubmitButton } from '@/components/common/submit-button'
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/common/fields'
import { PageHeader } from '@/components/common/page-header'
import { SectionCard } from '@/components/common/section-card'
import { EmptyState } from '@/components/common/states'
import { StatusBadge } from '@/components/common/status-badge'
import { Timeline, TimelineItem } from '@/components/common/timeline'
import { AttemptCard } from '@/components/crm/attempt-card'
import { ChatPanel } from '@/components/crm/chat-panel'
import { ContactActions } from '@/components/crm/contact-actions'
import { FollowUpItem } from '@/components/crm/follow-up-item'
import { LeadHeader } from '@/components/crm/lead-header'
import { LeadDetailsDialog } from '@/components/crm/lead-details-dialog'
import { DEPARTMENTS, LOST_REASONS, PIPELINES, PROPERTY_TYPES, ROOF_TYPES, SHADING_LEVELS, type ActivityType, type CallResult, type Stage, type VisitStatus } from '@/domain/constants'
import { ACTIVITY_TYPE_META, ATTEMPT_CHANNEL_META, CALL_RESULT_META, DEPARTMENT_META, STAGE_META, VISIT_STATUS_META, optionsFor } from '@/domain/ui-maps'
import { en } from '@/i18n/en'
import { formatPktDateTime } from '@/lib/dates-pkt'
import { requireUser } from '@/server/auth/session'
import { isManagerOrAdmin } from '@/server/auth/scope'
import { acceptLeadAction, addNoteAction, assignLeadAction, changeStageAction, createVisitAction, reopenLeadAction, saveSiteAction, transferDepartmentAction } from '@/server/actions'
import { getLeadDetail, getTeamBoard } from '@/server/services/queries'
import { AGENT_STAGES } from '@/server/services/leads'
import { formatPkrCompact } from '@/lib/money'

function describe(type: string, d: Record<string, unknown>): string {
  if (type === 'attempt_logged') {
    const channel = d.channel ? ATTEMPT_CHANNEL_META[d.channel as keyof typeof ATTEMPT_CHANNEL_META]?.label : ''
    const result = d.result ? CALL_RESULT_META[d.result as CallResult]?.label : ''
    return [channel, result, d.remarks].filter(Boolean).join(' · ')
  }
  if (type === 'stage_changed' && d.stage) return STAGE_META[d.stage as Stage]?.label ?? ''
  if (d.text) return String(d.text)
  if (d.status) return String(d.status)
  return ''
}

export default async function LeadPage(props: PageProps<'/leads/[id]'>) {
  const user = await requireUser()
  const { id } = await props.params
  const data = await getLeadDetail(id, user)
  if (!data) notFound()
  const { lead, raw, attempts, followUps, activities, messages, visits } = data
  const manager = isManagerOrAdmin(user)
  const mine = lead.agent?.id === user.id
  const agents = manager ? (await getTeamBoard(user)).filter((m) => m.role === 'agent') : []
  const site = raw.site as Record<string, string | number | boolean | undefined>
  const formAnswers = [
    site.systemSizeRange ? en.systemSizeRange[site.systemSizeRange as keyof typeof en.systemSizeRange] : null,
    site.installLocation ? en.installLocation[site.installLocation as keyof typeof en.installLocation] : null,
    site.installTimeline ? en.installTimeline[site.installTimeline as keyof typeof en.installTimeline] : null,
  ].filter(Boolean)

  return (
    <>
      <PageHeader title={lead.name} backHref="/leads" />
      <LeadHeader lead={lead} actions={user.role !== 'field_agent' ? <LeadDetailsDialog leadId={lead.id} label={`Sheet details${Object.keys(raw.extra).length && !lead.maskPhone ? ` (${Object.keys(raw.extra).length})` : ''}`} /> : null} />
      {raw.closeReview === 'pending' ? (
        <p role="status" className="rounded-xl bg-tone-warning-soft px-4 py-3 text-sm font-medium text-tone-warning-soft-foreground">
          {lead.status === 'won' ? `Marked WON (${formatPkrCompact(raw.wonValuePkr ?? 0)}) by the agent` : 'Closed by the agent'} — waiting for the manager to check it in Proof review.
        </p>
      ) : null}

      {lead.status === 'open' && (mine || manager) ? (
        <SectionCard title="Contact the customer" description="Every tap is saved as proof. After the call or chat, log what happened.">
          {mine && lead.assignmentState === 'assigned' ? (
            <form action={acceptLeadAction}>
              <input type="hidden" name="leadId" value={lead.id} />
              <SubmitButton size="xl" className="w-full" pendingText="Accepting…">
                Accept this lead
              </SubmitButton>
            </form>
          ) : (
            <div className="space-y-3">
              <ContactActions leadId={lead.id} pendingAttemptId={raw.pendingAttempt} attemptCount={lead.attemptCount} />
            </div>
          )}
        </SectionCard>
      ) : null}

      {manager ? (
        <SectionCard title="Manage">
          <div className="grid gap-4 md:grid-cols-3">
            <ActionForm action={assignLeadAction} className="space-y-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <SelectField
                label="Assign to"
                name="agentId"
                defaultValue={lead.agent?.id ?? ''}
                placeholder="Choose agent"
                options={[{ value: 'auto', label: 'Next in order (auto)' }, ...agents.map((a) => ({ value: a.id, label: `${a.name} · ${a.attendance === 'checked_in' ? 'in' : 'out'}` }))]}
              />
              <Button type="submit" variant="outline" size="touch" className="w-full">
                Assign
              </Button>
            </ActionForm>
            <ActionForm action={transferDepartmentAction} className="space-y-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <SelectField label="Move to department" name="department" defaultValue={DEPARTMENTS.find((d) => d !== lead.department)} options={DEPARTMENTS.filter((d) => d !== lead.department).map((d) => ({ value: d, label: DEPARTMENT_META[d].label }))} />
              <TextField label="Why?" name="reason" required minLength={3} placeholder="e.g. wants panels only" />
              <Button type="submit" variant="outline" size="touch" className="w-full">
                Move
              </Button>
            </ActionForm>
            {lead.status !== 'open' ? (
              <ActionForm action={reopenLeadAction} className="self-end">
                <input type="hidden" name="leadId" value={lead.id} />
                <Button type="submit" variant="outline" size="touch" className="w-full">
                  Reopen lead
                </Button>
              </ActionForm>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {manager ? (
        <SectionCard title="Stage">
          <ActionForm action={changeStageAction}>
            <div className="grid gap-3 md:grid-cols-4 md:items-end">
              <input type="hidden" name="leadId" value={lead.id} />
              <SelectField label="Stage" name="stage" defaultValue={lead.stage} options={PIPELINES[lead.department].map((s) => ({ value: s, label: STAGE_META[s].label }))} />
              <SelectField label="If lost — why" name="lostReason" placeholder="—" options={optionsFor(LOST_REASONS, en.lostReason)} />
              <TextField label="If won — value (PKR)" name="wonValuePkr" type="number" min={0} inputMode="numeric" />
              <Button type="submit" variant="secondary" size="touch">
                Update stage
              </Button>
            </div>
          </ActionForm>
        </SectionCard>
      ) : mine && lead.status === 'open' && lead.assignmentState === 'accepted' ? (
        <SectionCard title="Stage" description="For a sale (WON) or 'not interested', save it from the call result — your manager checks it.">
          <ActionForm action={changeStageAction}>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <input type="hidden" name="leadId" value={lead.id} />
              <SelectField label="Stage" name="stage" defaultValue={AGENT_STAGES.find((s) => s === lead.stage) ?? AGENT_STAGES[0]} options={AGENT_STAGES.map((s) => ({ value: s, label: STAGE_META[s].label }))} />
              <Button type="submit" variant="secondary" size="touch">
                Update stage
              </Button>
            </div>
          </ActionForm>
        </SectionCard>
      ) : null}

      <Tabs defaultValue="timeline">
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="proof">Proof ({attempts.length})</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp ({messages.length})</TabsTrigger>
          <TabsTrigger value="followups">Follow-ups</TabsTrigger>
          <TabsTrigger value="site">Site & visit</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-4 pt-4">
          {user.role !== 'field_agent' ? (
            <form action={addNoteAction} className="flex gap-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <input name="text" required maxLength={2000} aria-label="Add a note" placeholder="Add a note…" className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-base outline-none md:text-sm" />
              <SubmitButton variant="outline" size="touch" pendingText="…">
                Add
              </SubmitButton>
            </form>
          ) : null}
          {activities.length === 0 ? (
            <EmptyState />
          ) : (
            <Timeline>
              {activities.map((a) => {
                const meta = ACTIVITY_TYPE_META[a.type as ActivityType]
                const text = describe(a.type, a.data)
                return (
                  <TimelineItem key={a.id} icon={meta?.icon} tone={meta?.tone} title={`${meta?.label ?? a.type}${a.actor ? ` — ${a.actor}` : ''}`} time={formatPktDateTime(new Date(a.at))}>
                    {text ? <p className="text-muted-foreground">{text}</p> : null}
                  </TimelineItem>
                )
              })}
            </Timeline>
          )}

        </TabsContent>

        <TabsContent value="proof" className="grid gap-3 pt-4 md:grid-cols-2">
          {attempts.length === 0 ? <EmptyState title="No contact attempts yet" /> : attempts.map((a) => <AttemptCard key={a.id} attempt={a} />)}
        </TabsContent>

        <TabsContent value="whatsapp" className="pt-4">
          <ChatPanel leadId={lead.id} messages={messages} />
        </TabsContent>

        <TabsContent value="followups" className="pt-4">
          {followUps.length === 0 ? <EmptyState title="No follow-ups" /> : followUps.map((f) => <FollowUpItem key={f.id} followUp={f} />)}
        </TabsContent>

        <TabsContent value="site" className="grid gap-4 pt-4 lg:grid-cols-2">
          <SectionCard title="Site details" description={formAnswers.length ? `Meta form: ${formAnswers.join(' · ')}` : undefined}>
            <ActionForm action={saveSiteAction}>
              <input type="hidden" name="leadId" value={lead.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField label="Property" name="propertyType" placeholder="—" defaultValue={String(site.propertyType ?? '')} options={optionsFor(PROPERTY_TYPES, en.propertyType)} />
                <TextField label="Monthly bill (PKR)" name="monthlyBillPkr" type="number" min={0} defaultValue={site.monthlyBillPkr as number | undefined} />
                <TextField label="Monthly units (kWh)" name="monthlyUnits" type="number" min={0} defaultValue={site.monthlyUnits as number | undefined} hint="kW suggestion ≈ units ÷ 120" />
                <TextField label="Target size (kW)" name="targetKw" type="number" min={0} step="0.5" defaultValue={site.targetKw as number | undefined} />
                <SelectField label="Roof" name="roofType" placeholder="—" defaultValue={String(site.roofType ?? '')} options={optionsFor(ROOF_TYPES, en.roofType)} />
                <SelectField label="Shading" name="shading" placeholder="—" defaultValue={String(site.shading ?? '')} options={optionsFor(SHADING_LEVELS, en.shading)} />
              </div>
              <CheckboxField label="Battery required" name="batteryRequired" defaultChecked={!!site.batteryRequired} />
              <CheckboxField label="Net-metering required" name="netMeteringRequired" defaultChecked={!!site.netMeteringRequired} />
              <Button type="submit" size="touch">
                Save site details
              </Button>
            </ActionForm>
          </SectionCard>
          <SectionCard title="Site visit" description="Given automatically to the field agent with the least kW.">
            {visits.map((v) => (
              <div key={v.id} className="mb-3 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span>
                  {v.kw} kW {v.scheduledAt ? `· ${formatPktDateTime(new Date(v.scheduledAt))}` : ''}
                </span>
                <StatusBadge {...VISIT_STATUS_META[v.status as VisitStatus]} size="sm" />
              </div>
            ))}
            {manager || (mine && lead.assignmentState === 'accepted' && lead.status === 'open') ? (
              <ActionForm action={createVisitAction}>
                <input type="hidden" name="leadId" value={lead.id} />
                <input type="hidden" name="customerName" value={lead.name} />
                <input type="hidden" name="phone" value={lead.phone} />
                <TextField label="Address" name="address" required defaultValue={[lead.area, lead.city].filter(Boolean).join(', ')} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="System size (kW)" name="kw" type="number" min={1} step="0.5" required defaultValue={site.targetKw as number | undefined} />
                  <TextField label="Visit date & time" name="scheduledAt" type="datetime-local" />
                </div>
                <TextField label="Location link (optional)" name="locationUrl" type="url" />
                <TextAreaField label="Requirement" name="requirement" rows={2} />
                <Button type="submit" size="touch" className="w-full">
                  Book site visit
                </Button>
              </ActionForm>
            ) : null}
          </SectionCard>
        </TabsContent>
      </Tabs>
      {data.otherLeads.length ? (
        <p className="text-sm text-muted-foreground">
          Same customer:{' '}
          {data.otherLeads.map((o) => (
            <Link key={o.id} href={`/leads/${o.id}`} className="me-2 underline">
              {o.leadNo} ({o.status})
            </Link>
          ))}
        </p>
      ) : null}
    </>
  )
}
