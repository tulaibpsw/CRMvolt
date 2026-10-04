import Link from 'next/link'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import type { Tone } from '@/domain/constants'
import { cn } from '@/lib/utils'

const TILE_TONE: Record<Tone, string> = {
  neutral: 'bg-tone-neutral-soft text-tone-neutral-soft-foreground',
  brand: 'bg-tone-brand-soft text-tone-brand-soft-foreground',
  info: 'bg-tone-info-soft text-tone-info-soft-foreground',
  success: 'bg-tone-success-soft text-tone-success-soft-foreground',
  warning: 'bg-tone-warning-soft text-tone-warning-soft-foreground',
  danger: 'bg-tone-danger-soft text-tone-danger-soft-foreground',
  trading: 'bg-tone-trading-soft text-tone-trading-soft-foreground',
  installation: 'bg-tone-installation-soft text-tone-installation-soft-foreground',
}

export interface ActionTileProps {
  href: string
  label: string
  icon: LucideIcon
  /** Number of things waiting (shown big). 0 → calm neutral tile. */
  count?: number
  tone?: Tone
  className?: string
}

/** Big thumb-sized shortcut to the work that needs doing ("5 leads to assign"). Use at the top of dashboards. */
export function ActionTile({ href, label, icon: Icon, count, tone = 'brand', className }: ActionTileProps) {
  const calm = count === 0
  return (
    <Link
      href={href}
      className={cn(
        'flex min-h-20 items-center gap-3 rounded-xl p-4 ring-1 ring-foreground/10 transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]',
        calm ? 'bg-card text-card-foreground' : TILE_TONE[tone],
        className,
      )}
    >
      <Icon className="size-7 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        {count !== undefined ? <span className="block font-heading text-2xl leading-tight font-bold tabular-nums">{count}</span> : null}
        <span className="block text-sm leading-snug font-medium">{label}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 opacity-60" aria-hidden />
    </Link>
  )
}
