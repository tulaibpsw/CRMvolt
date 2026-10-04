import Link from 'next/link'
import { CalendarClock, User } from 'lucide-react'
import { DepartmentBadge, SourceBadge, StageBadge, AssignmentBadge } from '@/components/crm/badges'
import { SlaTimer } from '@/components/crm/sla-timer'
import { MAX_FOLLOW_UPS } from '@/domain/constants'
import type { LeadSummary } from '@/domain/view-models'
import { en } from '@/i18n/en'
import { formatPktDateTime } from '@/lib/dates-pkt'
import { formatPhone, maskPhone } from '@/lib/phone'
import { cn } from '@/lib/utils'

/** Phone-first lead row used in every list (agent home, leads, follow-ups, pipeline columns). */
export function LeadCard({ lead, href, showAgent = true, className }: { lead: LeadSummary; href?: string; showAgent?: boolean; className?: string }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{lead.name}</p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {lead.maskPhone ? maskPhone(lead.phone) : formatPhone(lead.phone)} · {lead.leadNo}
          </p>
        </div>
        {lead.sla ? <SlaTimer startedAt={lead.sla.startedAt} deadline={lead.sla.deadline} /> : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <StageBadge stage={lead.stage} size="sm" />
        <DepartmentBadge department={lead.department} size="sm" />
        <SourceBadge channel={lead.channel} detail={lead.sourceDetail} size="sm" />
        {lead.assignmentState !== 'accepted' ? <AssignmentBadge state={lead.assignmentState} size="sm" /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{en.common.attempt(lead.attemptCount, MAX_FOLLOW_UPS)}</span>
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="size-3.5" aria-hidden />
          {lead.nextFollowUpAt ? formatPktDateTime(new Date(lead.nextFollowUpAt)) : en.lead.noFollowUp}
        </span>
        {showAgent ? (
          <span className="inline-flex items-center gap-1">
            <User className="size-3.5" aria-hidden />
            {lead.agent?.name ?? en.lead.unassigned}
          </span>
        ) : null}
      </div>
    </>
  )

  const classes = cn('flex flex-col gap-2.5 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10', href && 'transition-colors hover:bg-muted/50', className)
  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <article className={classes}>{body}</article>
  )
}
