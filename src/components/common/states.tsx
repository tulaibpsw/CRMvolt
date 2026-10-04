import { CircleAlert, Inbox, type LucideIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { en } from '@/i18n/en'
import { cn } from '@/lib/utils'

interface StateProps {
  title?: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon = Inbox, title = en.common.nothingHere, description, action, className }: StateProps & { icon?: LucideIcon }) {
  return (
    <div className={cn('flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center', className)}>
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ title = en.common.somethingWrong, description = en.common.somethingWrongHint, action, className }: StateProps) {
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 rounded-xl bg-tone-danger-soft px-6 py-10 text-center text-tone-danger-soft-foreground', className)}>
      <CircleAlert className="size-8" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm">{description}</p>
      </div>
      {action}
    </div>
  )
}

export function LoadingState({ rows = 3, variant = 'list', className }: { rows?: number; variant?: 'list' | 'cards'; className?: string }) {
  return (
    <div aria-busy="true" aria-label={en.common.loading} className={cn(variant === 'cards' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={variant === 'cards' ? 'h-28 rounded-xl' : 'h-16 rounded-lg'} />
      ))}
    </div>
  )
}
