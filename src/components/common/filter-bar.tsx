import Link from 'next/link'
import { cn } from '@/lib/utils'

/** Horizontal filter row: scrolls sideways on phones, wraps on desktop. Filters are URL-driven links. */
export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0', className)}>{children}</div>
}

export interface FilterChipProps {
  label: string
  href: string
  active?: boolean
  count?: number
}

export function FilterChip({ label, href, active = false, count }: FilterChipProps) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors',
        active ? 'border-secondary bg-secondary text-secondary-foreground' : 'border-border bg-card hover:bg-muted',
      )}
    >
      {label}
      {count !== undefined ? <span className={cn('tabular-nums', active ? 'opacity-80' : 'text-muted-foreground')}>{count}</span> : null}
    </Link>
  )
}
