import Link from 'next/link'
import { PageHeader } from '@/components/common/page-header'
import { FilterBar, FilterChip } from '@/components/common/filter-bar'
import { LeadCard } from '@/components/crm/lead-card'
import { StageBadge } from '@/components/crm/badges'
import { DEPARTMENTS, type Department } from '@/domain/constants'
import { DEPARTMENT_META } from '@/domain/ui-maps'
import { requireRole } from '@/server/auth/session'
import { pipelineColumns } from '@/server/services/queries'

export const metadata = { title: 'Pipeline' }

/** Read-only Kanban per department (stages change from the lead page / outcome sheet). */
export default async function PipelinePage(props: PageProps<'/pipeline'>) {
  const user = await requireRole('admin', 'manager')
  const sp = await props.searchParams
  const department: Department =
    user.role === 'manager' && user.departmentCode ? user.departmentCode : (DEPARTMENTS.find((d) => d === sp.department) ?? 'INSTALLATION')
  const { stages, leads } = await pipelineColumns(user, department)
  return (
    <>
      <PageHeader title="Pipeline" description="Each column is a stage. Tap a card to work the lead." />
      {user.role === 'admin' ? (
        <FilterBar>
          {DEPARTMENTS.map((d) => (
            <FilterChip key={d} label={DEPARTMENT_META[d].label} href={`/pipeline?department=${d}`} active={d === department} />
          ))}
        </FilterBar>
      ) : null}
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
        {stages.map((stage) => {
          const cards = leads.filter((l) => l.stage === stage)
          return (
            <section key={stage} className="w-72 shrink-0 space-y-2 rounded-xl bg-muted/60 p-2" aria-label={stage}>
              <header className="flex items-center justify-between px-1 py-1">
                <StageBadge stage={stage} size="sm" />
                <span className="text-xs font-medium text-muted-foreground tabular-nums">{cards.length}</span>
              </header>
              {cards.slice(0, 30).map((l) => (
                <LeadCard key={l.id} lead={l} href={`/leads/${l.id}`} />
              ))}
              {cards.length > 30 ? (
                <Link href={`/leads?view=all`} className="block px-1 text-xs text-muted-foreground underline">
                  +{cards.length - 30} more
                </Link>
              ) : null}
            </section>
          )
        })}
      </div>
    </>
  )
}
