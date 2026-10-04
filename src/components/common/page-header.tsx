import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { en } from '@/i18n/en'
import { cn } from '@/lib/utils'

export interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  backHref?: string
  className?: string
}

export function PageHeader({ title, description, actions, backHref, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0 space-y-1">
        {backHref ? (
          <Link href={backHref} className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
            {en.common.back}
          </Link>
        ) : null}
        <h1 className="font-heading text-xl font-semibold md:text-2xl">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  )
}
