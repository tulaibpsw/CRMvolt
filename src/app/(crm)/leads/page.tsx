import { Suspense } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/page-header'
import { FilterBar, FilterChip } from '@/components/common/filter-bar'
import { SearchBox } from '@/components/common/search-box'
import { DataTable, type Column } from '@/components/common/data-table'
import { EmptyState } from '@/components/common/states'
import { LeadCard } from '@/components/crm/lead-card'
import { LeadDetailsDialog } from '@/components/crm/lead-details-dialog'
import { AssignmentBadge, DepartmentBadge, SourceBadge, StageBadge } from '@/components/crm/badges'
import { QuickAddLead } from '@/components/crm/quick-add-lead'
import { ActionForm } from '@/components/common/action-form'
import { pullSheetAction } from '@/server/actions'
import type { LeadSummary } from '@/domain/view-models'
import { formatPktDateTime } from '@/lib/dates-pkt'
import { formatPhone, maskPhone } from '@/lib/phone'
import { requireUser } from '@/server/auth/session'
import { LEAD_VIEWS, PAGE_SIZE, getQueuePanels, listLeads, type LeadView } from '@/server/services/queries'
import { QueuePanel } from '@/components/crm/queue-panel'

export const metadata = { title: 'Leads' }

const VIEW_LABEL: Record<LeadView, string> = {
  all: 'All open',
  new: 'New',
  unassigned: 'Unassigned',
  mine: 'My leads',
  followups: 'Follow-ups',
  interested: 'Interested',
  lost: 'Lost',
  unreachable: 'Dead / junk',
}

export default async function LeadsPage(props: PageProps<'/leads'>) {
  const user = await requireUser()
  const sp = await props.searchParams
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined)
  const view = (LEAD_VIEWS as readonly string[]).includes(one('view') ?? '') ? (one('view') as LeadView) : user.role === 'agent' ? 'mine' : 'all'
  const page = Number(one('page') ?? 1)
  const { rows, total, counts } = await listLeads(user, { view, q: one('q'), page, sort: one('sort'), dir: one('dir') === 'asc' ? 'asc' : 'desc' })
  const views = LEAD_VIEWS.filter((v) => !(v === 'mine' && user.role !== 'agent') && !(v === 'unassigned' && user.role === 'agent'))
  const href = (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries({ view, q: one('q'), sort: one('sort'), dir: one('dir'), ...params })) if (v !== undefined && v !== '') q.set(k, String(v))
    return `/leads?${q}`
  }
  const columns: Column<LeadSummary>[] = [
    {
      key: 'name',
      header: 'Customer',
      cell: (l) => (
        <Link href={`/leads/${l.id}`} className="font-medium underline-offset-4 hover:underline">
          {l.name}
          <span className="block text-xs text-muted-foreground">
            {l.maskPhone ? maskPhone(l.phone) : formatPhone(l.phone)} · {l.leadNo}
          </span>
        </Link>
      ),
    },
    { key: 'stage', header: 'Stage', cell: (l) => <StageBadge stage={l.stage} size="sm" /> },
    { key: 'dept', header: 'Dept', cell: (l) => <DepartmentBadge department={l.department} size="sm" /> },
    { key: 'source', header: 'Source', cell: (l) => <SourceBadge channel={l.channel} detail={l.sourceDetail} size="sm" /> },
    { key: 'agent', header: 'Agent', cell: (l) => (l.agent ? l.agent.name : <AssignmentBadge state={l.assignmentState} size="sm" />) },
    { key: 'attempts', header: 'Attempts', sortable: true, align: 'end', cell: (l) => l.attemptCount },
    { key: 'followup', header: 'Next follow-up', sortable: true, cell: (l) => (l.nextFollowUpAt ? formatPktDateTime(new Date(l.nextFollowUpAt)) : '—') },
    { key: 'received', header: 'Received', sortable: true, cell: (l) => formatPktDateTime(new Date(l.receivedAt)) },
    { key: 'details', header: 'Details', cell: (l) => <LeadDetailsDialog leadId={l.id} compact /> },
  ]
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const queuePanels = view === 'unassigned' && user.role !== 'agent' ? await getQueuePanels(user) : []
  return (
    <>
      <PageHeader
        title="Leads"
        description={`${total} in this view`}
        actions={
          <div className="flex flex-wrap items-start gap-2">
            {user.role === 'manager' || user.role === 'admin' || user.role === 'super_admin' ? (
              <ActionForm action={pullSheetAction} className="space-y-2">
                <input type="hidden" name="mode" value="live" />
                <Button type="submit" variant="outline" size="touch">
                  Sync Google Sheet now
                </Button>
              </ActionForm>
            ) : null}
            <QuickAddLead defaultDepartment={user.departmentCode} />
          </div>
        }
      />
      <Suspense>
        <SearchBox />
      </Suspense>
      {queuePanels.length ? <QueuePanel teams={queuePanels} /> : null}
      <FilterBar>
        {views.map((v) => (
          <FilterChip key={v} label={VIEW_LABEL[v]} href={href({ view: v, page: undefined })} active={v === view} count={counts[v]} />
        ))}
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="No leads here" description="New leads from the Google Sheet and WhatsApp appear automatically." />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {rows.map((l) => (
              <div key={l.id} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <LeadCard lead={l} href={`/leads/${l.id}`} showAgent={user.role !== 'agent'} />
                </div>
                <LeadDetailsDialog leadId={l.id} compact />
              </div>
            ))}
          </div>
          <DataTable
            className="hidden md:block"
            columns={columns}
            rows={rows}
            getRowKey={(l) => l.id}
            sort={{ key: one('sort') ?? 'received', direction: one('dir') === 'asc' ? 'asc' : 'desc' }}
            sortHref={(key, dir) => href({ sort: key, dir, page: undefined })}
            caption="Leads"
          />
        </>
      )}
      {pages > 1 ? (
        <nav className="flex items-center justify-between" aria-label="Pages">
          {page > 1 ? (
            <Button asChild variant="outline" size="touch">
              <Link href={href({ page: page - 1 })}>Previous</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Button asChild variant="outline" size="touch">
              <Link href={href({ page: page + 1 })}>Next</Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  )
}
