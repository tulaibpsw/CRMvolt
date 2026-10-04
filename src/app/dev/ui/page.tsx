import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Phone, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/common/status-badge'
import { KpiTile } from '@/components/common/kpi-tile'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states'
import { PageHeader } from '@/components/common/page-header'
import { SectionCard } from '@/components/common/section-card'
import { FilterBar, FilterChip } from '@/components/common/filter-bar'
import { SearchBox } from '@/components/common/search-box'
import { DataTable, type Column } from '@/components/common/data-table'
import { Timeline, TimelineItem } from '@/components/common/timeline'
import { CountdownTimer } from '@/components/common/countdown-timer'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { LeadCard } from '@/components/crm/lead-card'
import { LeadHeader } from '@/components/crm/lead-header'
import { AttemptCard } from '@/components/crm/attempt-card'
import { FollowUpItem } from '@/components/crm/follow-up-item'
import { CheckInCard } from '@/components/crm/check-in-card'
import { TeamMemberRow } from '@/components/crm/team-member-row'
import { MessageBubble } from '@/components/crm/message-bubble'
import { KpiGrid } from '@/components/crm/kpi-grid'
import { StageBadge, DepartmentBadge } from '@/components/crm/badges'
import { ROLES, TONES } from '@/domain/constants'
import { ACTIVITY_TYPE_META, ENUM_UI_MAPS } from '@/domain/ui-maps'
import type { LeadSummary } from '@/domain/view-models'
import { makeFixtures } from '@/dev/fixtures'
import { en } from '@/i18n/en'
import { isCatalogEnabled } from '@/lib/env'
import { formatPktDateTime } from '@/lib/dates-pkt'
import { formatPhone } from '@/lib/phone'

export const metadata = { title: en.catalog.title }

const SWATCHES = [
  ['background', 'bg-background'],
  ['card', 'bg-card'],
  ['primary', 'bg-primary'],
  ['secondary', 'bg-secondary'],
  ['muted', 'bg-muted'],
  ['accent', 'bg-accent'],
  ['destructive', 'bg-destructive'],
  ['border', 'bg-border'],
  ['sidebar', 'bg-sidebar'],
  ['chart-1', 'bg-chart-1'],
  ['chart-3', 'bg-chart-3'],
  ['chart-4', 'bg-chart-4'],
] as const

async function noop() {
  'use server'
}

export default async function CatalogPage() {
  await connection()
  if (!isCatalogEnabled()) notFound()

  const now = new Date()
  const fx = makeFixtures(now)
  const columns: Column<LeadSummary>[] = [
    { key: 'name', header: 'Name', sortable: true, cell: (l) => <span className="font-medium">{l.name}</span> },
    { key: 'phone', header: 'Phone', cell: (l) => formatPhone(l.phone) },
    { key: 'stage', header: 'Stage', sortable: true, cell: (l) => <StageBadge stage={l.stage} size="sm" /> },
    { key: 'department', header: 'Department', cell: (l) => <DepartmentBadge department={l.department} size="sm" /> },
    { key: 'attempts', header: 'Attempts', align: 'end', sortable: true, cell: (l) => l.attemptCount },
  ]

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 py-8 md:px-6">
      <PageHeader title={en.catalog.title} description={en.catalog.description} backHref="/" />

      <Section title={en.catalog.tokens}>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {SWATCHES.map(([name, className]) => (
            <div key={name} className="space-y-1">
              <div className={`h-12 rounded-lg ring-1 ring-foreground/10 ${className}`} />
              <p className="text-xs text-muted-foreground">{name}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title={en.catalog.tones}>
        <div className="space-y-2">
          {TONES.map((tone) => (
            <div key={tone} className="flex flex-wrap items-center gap-2">
              <span className="w-24 text-sm text-muted-foreground">{tone}</span>
              <StatusBadge label={`${tone} soft`} tone={tone} />
              <StatusBadge label={`${tone} solid`} tone={tone} variant="solid" />
            </div>
          ))}
        </div>
      </Section>

      <Section title={en.catalog.typography}>
        <div className="space-y-2">
          <p className="font-heading text-3xl font-semibold">Heading 3xl</p>
          <p className="font-heading text-xl font-semibold">Heading xl</p>
          <p>{en.catalog.sampleText}</p>
          <p className="text-sm text-muted-foreground">{en.catalog.sampleText}</p>
          <p className="font-heading text-2xl font-semibold tabular-nums">1,234,567</p>
        </div>
      </Section>

      <Section title={en.catalog.buttons}>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="touch">
            <Phone data-icon="inline-start" />
            Call (touch)
          </Button>
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title={en.catalog.statusMaps}>
        <div className="space-y-3">
          {Object.entries(ENUM_UI_MAPS).map(([name, [values, map]]) => (
            <div key={name} className="flex flex-wrap items-center gap-1.5">
              <span className="w-full text-xs font-medium text-muted-foreground md:w-56">{name}</span>
              {values.map((value) => (
                <StatusBadge key={value} {...(map as Record<string, (typeof ACTIVITY_TYPE_META)['accepted']>)[value]} size="sm" />
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title={en.catalog.patterns}>
        <div className="grid gap-4 md:grid-cols-2">
          <SectionCard title="KpiTile" description="Value, hint and 'coming in phase'">
            <div className="grid grid-cols-2 gap-3">
              <KpiTile label={en.kpi.totalLeads} value={125} icon={Users} tone="info" />
              <KpiTile label={en.kpi.commission} value={0} comingIn={4} />
            </div>
          </SectionCard>
          <SectionCard title="FilterBar + SearchBox" description="URL-driven">
            <div className="space-y-3">
              <Suspense>
                <SearchBox />
              </Suspense>
              <FilterBar>
                <FilterChip label="All" href="/dev/ui" active count={125} />
                <FilterChip label="New" href="/dev/ui?view=new" count={9} />
                <FilterChip label="Unassigned" href="/dev/ui?view=unassigned" count={2} />
                <FilterChip label="Follow-ups" href="/dev/ui?view=followups" count={27} />
              </FilterBar>
            </div>
          </SectionCard>
          <SectionCard title="Timeline" description="Lead activity, PDF §18">
            <Timeline>
              {(['lead_created', 'assigned', 'accepted', 'attempt_logged', 'stage_changed'] as const).map((type, index) => (
                <TimelineItem key={type} {...ACTIVITY_TYPE_META[type]} title={ACTIVITY_TYPE_META[type].label} time={formatPktDateTime(new Date(now.getTime() - (5 - index) * 600_000))} />
              ))}
            </Timeline>
          </SectionCard>
          <SectionCard title="CountdownTimer + ConfirmDialog">
            <div className="flex flex-wrap items-center gap-3">
              <CountdownTimer deadline={new Date(now.getTime() + 12 * 60_000).toISOString()} className="font-medium tabular-nums" />
              <ConfirmDialog
                trigger={
                  <Button variant="destructive" size="touch">
                    <Trash2 data-icon="inline-start" />
                    Mark as junk
                  </Button>
                }
                title="Mark this lead as junk?"
                description="It will leave the pipeline. You can restore it later."
                destructive
                onConfirm={noop}
              />
            </div>
          </SectionCard>
        </div>
        <div className="mt-4">
          <DataTable columns={columns} rows={fx.leads} getRowKey={(l) => l.id} sort={{ key: 'name', direction: 'asc' }} sortHref={(key, dir) => `/dev/ui?sort=${key}&dir=${dir}`} caption="Leads" />
        </div>
      </Section>

      <Section title={en.catalog.states}>
        <div className="grid gap-4 md:grid-cols-3">
          <LoadingState rows={3} />
          <EmptyState description="New leads from the Sheet will appear here." />
          <ErrorState action={<Button variant="outline">{en.common.retry}</Button>} />
        </div>
      </Section>

      <Section title={en.catalog.crm}>
        <div className="space-y-6">
          <KpiGrid items={fx.kpis} />
          <LeadHeader lead={fx.lead} actions={<Button size="touch"><Phone data-icon="inline-start" />Call</Button>} />
          <div className="grid gap-3 md:grid-cols-2">
            {fx.leads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} href="/dev/ui" />
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {fx.attempts.map((attempt) => (
              <AttemptCard key={attempt.id} attempt={attempt} />
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <CheckInCard status="checked_out" />
            <CheckInCard status="checked_in" since={fx.team[0].since} />
            <CheckInCard status="on_break" since={fx.team[1].since} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title={en.nav.followUps}>
              {fx.followUps.map((followUp) => (
                <FollowUpItem key={followUp.id} followUp={followUp} href="/dev/ui" />
              ))}
            </SectionCard>
            <SectionCard title={en.nav.team}>
              {fx.team.map((member) => (
                <TeamMemberRow key={member.id} member={member} now={now} />
              ))}
            </SectionCard>
          </div>
          <SectionCard title="WhatsApp">
            <div className="space-y-2">
              {fx.messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          </SectionCard>
        </div>
      </Section>

      <Section title={en.catalog.shell}>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((role) => (
            <Button key={role} variant="outline" size="touch" asChild>
              <Link href={`/dev/ui/shell?role=${role}`}>{en.catalog.shellLink(en.role[role])}</Link>
            </Button>
          ))}
        </div>
      </Section>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="border-b border-border pb-2 font-heading text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}
