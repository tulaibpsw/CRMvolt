import type { LucideIcon } from 'lucide-react'
import type { Tone } from '@/domain/constants'
import { en } from '@/i18n/en'
import { cn } from '@/lib/utils'
import { toneTextClass } from '@/components/common/status-badge'

export interface KpiTileProps {
  label: string
  value: string | number
  hint?: string
  icon?: LucideIcon
  tone?: Tone
  /** The module behind this number isn't built yet — show "Phase n" instead of the value. */
  comingIn?: number
  className?: string
}

export function KpiTile({ label, value, hint, icon: Icon, tone = 'neutral', comingIn, className }: KpiTileProps) {
  const pending = comingIn !== undefined
  return (
    <div className={cn('flex min-h-24 flex-col justify-between gap-2 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10', className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon ? <Icon className={cn('size-4 shrink-0', toneTextClass[tone])} aria-hidden /> : null}
      </div>
      {pending ? (
        <span className="text-sm font-medium text-muted-foreground">{en.common.comingInPhase(comingIn)}</span>
      ) : (
        <span className="font-heading text-2xl font-semibold tabular-nums">{value}</span>
      )}
      {hint && !pending ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  )
}
