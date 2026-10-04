import Link from 'next/link'
import { AlarmClock, CalendarClock, ListChecks, MapPin, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActionTile } from '@/components/common/action-tile'
import { PageHeader } from '@/components/common/page-header'
import { SubmitButton } from '@/components/common/submit-button'
import { SectionCard } from '@/components/common/section-card'
import { EmptyState } from '@/components/common/states'
import { StatusBadge } from '@/components/common/status-badge'
import { CheckInCard } from '@/components/crm/check-in-card'
import { FollowUpItem } from '@/components/crm/follow-up-item'
import { KpiGrid } from '@/components/crm/kpi-grid'
import { LeadCard } from '@/components/crm/lead-card'
import { TeamMemberRow } from '@/components/crm/team-member-row'
import { VISIT_STATUS_META } from '@/domain/ui-maps'
import { formatPktDateTime } from '@/lib/dates-pkt'
import { requireUser } from '@/server/auth/session'
import { acceptLeadAction, checkInAction, checkOutAction, toggleBreakAction } from '@/server/actions'
import { getAttendance } from '@/server/services/assignment'
import { getKpis, getTeamBoard, listFollowUps, listLeads, listVisits } from '@/server/services/queries'

export const metadata = { title: 'Dashboard' }

const NOTICES: Record<string, { text: string; tone: 'warning' | 'success' }> = {
  'no-access': { text: 'You do not have access to that page.', tone: 'warning' },
  'password-changed': { text: 'Password saved. Use your new password next time.', tone: 'success' },
}

export default async function DashboardPage(props: PageProps<'/dashboard'>) {
  const user = await requireUser()
  const { notice } = await props.searchParams
  const banner = typeof notice === 'string' ? NOTICES[notice] : undefined
  const noticeEl = banner ? (
    <p role="status" className={banner.tone === 'success' ? 'rounded-xl bg-tone-success-soft px-4 py-3 text-sm font-medium text-tone-success-soft-foreground' : 'rounded-xl bg-tone-warning-soft px-4 py-3 text-sm font-medium text-tone-warning-soft-foreground'}>
      {banner.text}
    </p>
  ) : null
  const now = new Date()
  const greeting = `Assalam o Alaikum, ${user.name.split(' ')[0]}`

  if (user.role === 'agent' || user.role === 'field_agent') {
    const attendance = await getAttendance(user.id)
    const shift = <CheckInCard status={(attendance?.status as 'checked_in') ?? 'checked_out'} since={attendance?.checkInAt?.toISOString()} onCheckIn={checkInAction} onCheckOut={checkOutAction} onToggleBreak={toggleBreakAction} forVisits={user.role === 'field_agent'} />

    if (user.role === 'field_agent') {
      const visits = (await listVisits(user)).filter((v) => v.status === 'assigned' || v.status === 'rescheduled')
      return (
        <>
          <PageHeader title={greeting} description="Your site visits" />
          {noticeEl}
          {shift}
          <ActionTile href="/visits" label="Site visits to do" icon={MapPin} count={visits.length} tone="info" />
          <SectionCard title={`Visits to do (${visits.length})`} actions={<Button asChild variant="outline" size="touch"><Link href="/visits">Open visits</Link></Button>}>
            {visits.length === 0 ? <EmptyState title="No visits assigned" /> : (
              <ul className="divide-y divide-border">
                {visits.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{v.customerName} · {v.kw} kW</p>
                      <p className="truncate text-xs text-muted-foreground">{v.address} {v.scheduledAt ? `· ${formatPktDateTime(new Date(v.scheduledAt))}` : ''}</p>
                    </div>
                    <StatusBadge {...VISIT_STATUS_META[v.status]} size="sm" />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )
    }

    const [mine, followUps, kpis] = await Promise.all([listLeads(user, { view: 'mine' }), listFollowUps(user), getKpis(user)])
    const toAccept = mine.rows.filter((l) => l.assignmentState === 'assigned')
    const dueToday = followUps.filter((f) => new Date(f.dueAt).getTime() < now.getTime() + 12 * 3_600_000)
    return (
      <>
        <PageHeader title={greeting} description="Your leads and follow-ups for today" />
        {noticeEl}
        {shift}
        <div className="grid grid-cols-2 gap-3">
          <ActionTile href="/leads?view=mine" label="My leads" icon={ListChecks} count={mine.total} tone="brand" />
          <ActionTile href="/follow-ups" label="Follow-ups due" icon={CalendarClock} count={dueToday.length} tone="warning" />
        </div>
        <SectionCard title={`New leads — accept now (${toAccept.length})`}>
          {toAccept.length === 0 ? <EmptyState title="No new leads waiting" description="Stay checked in — new leads come to you in turn." /> : (
            <div className="space-y-3">
              {toAccept.map((lead) => (
                <div key={lead.id} className="space-y-2">
                  <LeadCard lead={lead} href={`/leads/${lead.id}`} showAgent={false} />
                  <form action={acceptLeadAction}>
                    <input type="hidden" name="leadId" value={lead.id} />
                    <SubmitButton size="xl" className="w-full" pendingText="Accepting…">Accept {lead.leadNo}</SubmitButton>
                  </form>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
        <SectionCard title={`Follow-ups due (${dueToday.length})`} actions={<Button asChild variant="outline" size="touch"><Link href="/follow-ups">All</Link></Button>}>
          {dueToday.length === 0 ? <EmptyState title="Nothing due" /> : dueToday.slice(0, 10).map((f) => <FollowUpItem key={f.id} followUp={f} href={`/leads/${f.leadId}`} />)}
        </SectionCard>
        <KpiGrid items={kpis.slice(0, 8)} />
      </>
    )
  }

  const [kpis, board, queue, followUps] = await Promise.all([getKpis(user), getTeamBoard(user), listLeads(user, { view: 'unassigned' }), listFollowUps(user)])
  const overdue = followUps.filter((f) => f.isOverdue)
  const checkedIn = board.filter((m) => m.attendance === 'checked_in').length
  return (
    <>
      <PageHeader title={greeting} description={user.role === 'admin' || user.role === 'super_admin' ? 'Whole company' : `${user.departmentCode === 'TRADING' ? 'Trading' : 'Installation'} department`} />
      {noticeEl}
      <div className="grid gap-3 sm:grid-cols-3">
        <ActionTile href="/leads?view=unassigned" label="Leads waiting to be assigned" icon={UserPlus} count={queue.total} tone="warning" />
        <ActionTile href="/follow-ups" label="Overdue follow-ups" icon={AlarmClock} count={overdue.length} tone="danger" />
        <ActionTile href="/team" label={`Agents checked in (of ${board.length})`} icon={Users} count={checkedIn} tone="success" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={`Team now — ${checkedIn} checked in`} actions={<Button asChild variant="outline" size="touch"><Link href="/team">Team</Link></Button>}>
          {board.length === 0 ? <EmptyState title="No agents yet" description="Add agents in Settings → Users." /> : board.map((m) => <TeamMemberRow key={m.id} member={m} now={now} />)}
        </SectionCard>
        <SectionCard title={`Waiting for assignment (${queue.total})`} actions={<Button asChild variant="outline" size="touch"><Link href="/leads?view=unassigned">Open</Link></Button>}>
          {queue.rows.length === 0 ? <EmptyState title="Queue is empty" /> : <div className="space-y-2">{queue.rows.slice(0, 5).map((l) => <LeadCard key={l.id} lead={l} href={`/leads/${l.id}`} />)}</div>}
        </SectionCard>
      </div>
      <KpiGrid items={kpis} />
      <SectionCard title={`Overdue follow-ups (${overdue.length})`}>
        {overdue.length === 0 ? <EmptyState title="No overdue follow-ups" /> : overdue.slice(0, 15).map((f) => <FollowUpItem key={f.id} followUp={f} href={`/leads/${f.leadId}`} />)}
      </SectionCard>
    </>
  )
}
