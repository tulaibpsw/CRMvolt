import type { LucideIcon } from 'lucide-react'
import type { Tone } from '@/domain/constants'
import { cn } from '@/lib/utils'
import { statusBadgeVariants } from '@/components/common/status-badge'

export function Timeline({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ol className={cn('relative space-y-4 border-s border-border ps-6', className)}>{children}</ol>
}

export interface TimelineItemProps {
  icon?: LucideIcon
  tone?: Tone
  title: React.ReactNode
  /** Already formatted for display (e.g. formatPktDateTime). */
  time: string
  children?: React.ReactNode
}

export function TimelineItem({ icon: Icon, tone = 'neutral', title, time, children }: TimelineItemProps) {
  return (
    <li className="relative">
      <span
        className={cn(statusBadgeVariants({ tone, size: 'md' }), 'absolute -start-9 top-0 size-6 justify-center px-0 ring-4 ring-background')}
        aria-hidden
      >
        {Icon ? <Icon /> : null}
      </span>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-medium">{title}</p>
        <time className="text-xs text-muted-foreground tabular-nums">{time}</time>
      </div>
      {children ? <div className="mt-2 text-sm">{children}</div> : null}
    </li>
  )
}
