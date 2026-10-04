'use client'

import { StatusBadge } from '@/components/common/status-badge'
import { useNow } from '@/components/common/countdown-timer'
import { slaState } from '@/domain/sla'
import { SLA_STATE_META } from '@/domain/ui-maps'
import { formatPktTime } from '@/lib/dates-pkt'
import { formatRemaining } from '@/lib/duration'

/** Live accept/contact deadline badge: green → amber (last 25%) → red when overdue. */
export function SlaTimer({ startedAt, deadline, size = 'sm' }: { startedAt: string; deadline: string; size?: 'sm' | 'md' }) {
  const now = useNow()
  const end = new Date(deadline).getTime()
  if (now === null) {
    return <StatusBadge {...SLA_STATE_META.ok} label={formatPktTime(new Date(deadline))} size={size} />
  }
  const state = slaState(end - now, end - new Date(startedAt).getTime())
  return <StatusBadge {...SLA_STATE_META[state]} label={formatRemaining(end - now)} size={size} />
}
