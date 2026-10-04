import { DepartmentBadge, LeadStatusBadge, SourceBadge, StageBadge } from '@/components/crm/badges'
import { SlaTimer } from '@/components/crm/sla-timer'
import type { LeadDetail } from '@/domain/view-models'
import { en } from '@/i18n/en'
import { formatPktDateTime } from '@/lib/dates-pkt'
import { formatPhone, maskPhone } from '@/lib/phone'

/** Top of the lead profile. `actions` holds ContactActions (built in M5). */
export function LeadHeader({ lead, actions }: { lead: LeadDetail; actions?: React.ReactNode }) {
  const show = (phone: string) => (lead.maskPhone ? maskPhone(phone) : formatPhone(phone))
  const facts: [string, string | undefined][] = [
    [en.lead.assignedTo, lead.agent?.name ?? en.lead.unassigned],
    [en.lead.received, formatPktDateTime(new Date(lead.receivedAt))],
    [en.lead.campaign, lead.campaignName],
    [en.lead.ad, lead.adName],
    [en.lead.form, lead.formName],
    [en.lead.adHeadline, lead.ctwaHeadline],
    [en.lead.otherNumbers, lead.altPhones.length ? lead.altPhones.map(show).join(', ') : undefined],
  ]

  return (
    <section className="space-y-4 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-muted-foreground">{lead.leadNo}</p>
          <h1 className="font-heading text-xl font-semibold md:text-2xl">{lead.name}</h1>
          <p className="text-muted-foreground tabular-nums">
            {show(lead.phone)}
            {lead.city ? ` · ${lead.city}${lead.area ? `, ${lead.area}` : ''}` : ''}
          </p>
        </div>
        {lead.sla ? <SlaTimer startedAt={lead.sla.startedAt} deadline={lead.sla.deadline} size="md" /> : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <StageBadge stage={lead.stage} />
        <LeadStatusBadge status={lead.status} />
        <DepartmentBadge department={lead.department} />
        <SourceBadge channel={lead.channel} detail={lead.sourceDetail} />
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {facts
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <dt className="text-muted-foreground">{label}:</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
      </dl>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  )
}
