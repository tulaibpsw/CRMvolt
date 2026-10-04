import Link from 'next/link'
import { StatusBadge } from '@/components/common/status-badge'
import { MAX_FOLLOW_UPS } from '@/domain/constants'
import { FOLLOW_UP_STATUS_META, SLA_STATE_META } from '@/domain/ui-maps'
import type { FollowUpView } from '@/domain/view-models'
import { en } from '@/i18n/en'
import { formatPktDateTime } from '@/lib/dates-pkt'
import { cn } from '@/lib/utils'

export function FollowUpItem({ followUp, href }: { followUp: FollowUpView; href?: string }) {
  const meta = followUp.isOverdue ? SLA_STATE_META.breached : FOLLOW_UP_STATUS_META[followUp.status]
  const content = (
    <>
      <div className="min-w-0">
        <p className="truncate font-medium">{followUp.leadName}</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {en.common.followUp(followUp.number, MAX_FOLLOW_UPS)} · {formatPktDateTime(new Date(followUp.dueAt))}
        </p>
      </div>
      <StatusBadge {...meta} size="sm" />
    </>
  )
  const classes = cn('flex min-h-14 items-center justify-between gap-3 rounded-lg px-3 py-2', href && 'hover:bg-muted', followUp.isOverdue && 'bg-tone-danger-soft/40')
  return href ? (
    <Link href={href} className={classes}>
      {content}
    </Link>
  ) : (
    <div className={classes}>{content}</div>
  )
}
