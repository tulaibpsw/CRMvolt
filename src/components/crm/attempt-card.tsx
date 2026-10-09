import { ArrowRight, ImageIcon } from 'lucide-react'
import { CallResultBadge, ProofChip, ResponseBadge } from '@/components/crm/badges'
import { StatusBadge, toneTextClass } from '@/components/common/status-badge'
import { MAX_FOLLOW_UPS } from '@/domain/constants'
import { ATTEMPT_CHANNEL_META, REVIEW_STATUS_META } from '@/domain/ui-maps'
import type { AttemptView } from '@/domain/view-models'
import { en } from '@/i18n/en'
import { formatPktTime } from '@/lib/dates-pkt'
import { formatDuration } from '@/lib/duration'
import { cn } from '@/lib/utils'

/** One contact attempt as proof: channel, the tap → left → back → logged trail, result and proof chip. */
export function AttemptCard({ attempt }: { attempt: AttemptView }) {
  const channel = ATTEMPT_CHANNEL_META[attempt.channel]
  const ChannelIcon = channel.icon
  const trail: [string, string | undefined][] = [
    [en.attempt.tapped, attempt.tappedAt],
    [en.attempt.left, attempt.leftAt],
    [en.attempt.back, attempt.returnedAt],
    [en.attempt.logged, attempt.loggedAt],
  ]
  const awayMs = attempt.leftAt && attempt.returnedAt ? new Date(attempt.returnedAt).getTime() - new Date(attempt.leftAt).getTime() : undefined

  return (
    <article className={cn('space-y-3 rounded-xl bg-card p-4 text-card-foreground ring-1', attempt.proofStatus === 'flagged' ? 'ring-tone-danger' : 'ring-foreground/10')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-medium">
          {ChannelIcon ? <ChannelIcon className={cn('size-4', toneTextClass[channel.tone])} aria-hidden /> : null}
          {channel.label}
          <span className="text-sm font-normal text-muted-foreground">
            {en.common.followUp(attempt.followUpNo, MAX_FOLLOW_UPS)} · {en.attempt.by(attempt.agent.name)}
          </span>
        </span>
        <ProofChip status={attempt.proofStatus} flags={attempt.flags} size="sm" />
      </div>

      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
        {trail.map(([label, at], index) => (
          <li key={label} className="inline-flex items-center gap-1.5">
            {index > 0 ? <ArrowRight className="size-3 rtl:rotate-180" aria-hidden /> : null}
            <span>
              {label} <span className="font-medium text-foreground">{at ? formatPktTime(new Date(at)) : '—'}</span>
            </span>
          </li>
        ))}
        {awayMs !== undefined ? <li className="ms-1 font-medium text-foreground">({en.attempt.away(formatDuration(awayMs))})</li> : null}
      </ol>

      {attempt.cancelled ? <StatusBadge label="Cancelled — tapped by mistake (not a try)" tone="neutral" size="sm" /> : null}
      {attempt.result ? (
        <div className="flex flex-wrap gap-1.5">
          <CallResultBadge result={attempt.result} size="sm" />
          {attempt.response ? <ResponseBadge response={attempt.response} size="sm" /> : null}
        </div>
      ) : null}

      {attempt.remarks ? <p className="text-sm">{attempt.remarks}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        {attempt.screenshotUrl ? (
          <a href={attempt.screenshotUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 font-medium underline underline-offset-4">
            <ImageIcon className="size-4" aria-hidden />
            {en.attempt.screenshot}
          </a>
        ) : attempt.screenshotCleared ? (
          <span className="text-muted-foreground">Screenshot cleared (storage)</span>
        ) : (
          <span className="text-muted-foreground">{en.attempt.noScreenshot}</span>
        )}
        <StatusBadge {...REVIEW_STATUS_META[attempt.reviewStatus]} size="sm" />
      </div>
    </article>
  )
}
