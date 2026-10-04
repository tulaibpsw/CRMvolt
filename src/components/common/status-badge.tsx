import { cva, type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import type { Tone } from '@/domain/constants'
import { cn } from '@/lib/utils'

/**
 * The one way to show a coloured status. Pass a meta from src/domain/ui-maps.ts:
 *   <StatusBadge {...STAGE_META[stage]} />
 * Never pick a tone inside a feature component.
 */
export const statusBadgeVariants = cva(
  'inline-flex max-w-full shrink-0 items-center gap-1 rounded-full font-medium whitespace-nowrap [&>svg]:shrink-0',
  {
    variants: {
      size: {
        sm: 'h-5 px-2 text-xs [&>svg]:size-3',
        md: 'h-6 px-2.5 text-xs [&>svg]:size-3.5',
      },
      variant: { soft: '', solid: '' },
      tone: {
        neutral: '',
        brand: '',
        info: '',
        success: '',
        warning: '',
        danger: '',
        trading: '',
        installation: '',
      } satisfies Record<Tone, string>,
    },
    compoundVariants: [
      { variant: 'soft', tone: 'neutral', className: 'bg-tone-neutral-soft text-tone-neutral-soft-foreground' },
      { variant: 'soft', tone: 'brand', className: 'bg-tone-brand-soft text-tone-brand-soft-foreground' },
      { variant: 'soft', tone: 'info', className: 'bg-tone-info-soft text-tone-info-soft-foreground' },
      { variant: 'soft', tone: 'success', className: 'bg-tone-success-soft text-tone-success-soft-foreground' },
      { variant: 'soft', tone: 'warning', className: 'bg-tone-warning-soft text-tone-warning-soft-foreground' },
      { variant: 'soft', tone: 'danger', className: 'bg-tone-danger-soft text-tone-danger-soft-foreground' },
      { variant: 'soft', tone: 'trading', className: 'bg-tone-trading-soft text-tone-trading-soft-foreground' },
      { variant: 'soft', tone: 'installation', className: 'bg-tone-installation-soft text-tone-installation-soft-foreground' },
      { variant: 'solid', tone: 'neutral', className: 'bg-tone-neutral text-tone-neutral-foreground' },
      { variant: 'solid', tone: 'brand', className: 'bg-tone-brand text-tone-brand-foreground' },
      { variant: 'solid', tone: 'info', className: 'bg-tone-info text-tone-info-foreground' },
      { variant: 'solid', tone: 'success', className: 'bg-tone-success text-tone-success-foreground' },
      { variant: 'solid', tone: 'warning', className: 'bg-tone-warning text-tone-warning-foreground' },
      { variant: 'solid', tone: 'danger', className: 'bg-tone-danger text-tone-danger-foreground' },
      { variant: 'solid', tone: 'trading', className: 'bg-tone-trading text-tone-trading-foreground' },
      { variant: 'solid', tone: 'installation', className: 'bg-tone-installation text-tone-installation-foreground' },
    ],
    defaultVariants: { size: 'md', variant: 'soft', tone: 'neutral' },
  },
)

/** Text colour only (no background) for a tone — for icons and inline highlights. */
export const toneTextClass: Record<Tone, string> = {
  neutral: 'text-tone-neutral',
  brand: 'text-tone-brand-soft-foreground',
  info: 'text-tone-info',
  success: 'text-tone-success',
  warning: 'text-tone-warning-soft-foreground',
  danger: 'text-tone-danger',
  trading: 'text-tone-trading',
  installation: 'text-tone-installation',
}

export interface StatusBadgeProps extends Omit<VariantProps<typeof statusBadgeVariants>, 'tone'> {
  label: string
  tone: Tone
  icon?: LucideIcon
  title?: string
  className?: string
}

export function StatusBadge({ label, tone, icon: Icon, size, variant, title, className }: StatusBadgeProps) {
  return (
    <span data-tone={tone} title={title} className={cn(statusBadgeVariants({ tone, size, variant }), className)}>
      {Icon ? <Icon aria-hidden /> : null}
      <span className="truncate">{label}</span>
    </span>
  )
}
