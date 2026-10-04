import { PageHeader } from '@/components/common/page-header'
import { SectionCard } from '@/components/common/section-card'
import { EmptyState } from '@/components/common/states'
import { FollowUpItem } from '@/components/crm/follow-up-item'
import { requireUser } from '@/server/auth/session'
import { listFollowUps } from '@/server/services/queries'

export const metadata = { title: 'Follow-ups' }

/** The client's 3 follow-ups (1st call → next day → 3 days later), overdue first. */
export default async function FollowUpsPage() {
  const user = await requireUser()
  const all = await listFollowUps(user)
  const overdue = all.filter((f) => f.isOverdue)
  const upcoming = all.filter((f) => !f.isOverdue)
  return (
    <>
      <PageHeader title="Follow-ups" description="Overdue follow-ups turn red and alert your manager." />
      <SectionCard title={`Overdue (${overdue.length})`}>
        {overdue.length === 0 ? <EmptyState title="Nothing overdue" /> : overdue.map((f) => <FollowUpItem key={f.id} followUp={f} href={`/leads/${f.leadId}`} />)}
      </SectionCard>
      <SectionCard title={`Upcoming (${upcoming.length})`}>
        {upcoming.length === 0 ? <EmptyState title="No follow-ups planned" /> : upcoming.map((f) => <FollowUpItem key={f.id} followUp={f} href={`/leads/${f.leadId}`} />)}
      </SectionCard>
    </>
  )
}
