import { Check, Circle, CircleDot, Minus } from 'lucide-react'
import type { JourneyStep, NextStep } from '@/domain/lead-journey'
import { cn } from '@/lib/utils'

const TONE: Record<NextStep['tone'], string> = {
  info: 'bg-tone-info-soft text-tone-info-soft-foreground',
  warning: 'bg-tone-warning-soft text-tone-warning-soft-foreground',
  success: 'bg-tone-success-soft text-tone-success-soft-foreground',
  danger: 'bg-tone-danger-soft text-tone-danger-soft-foreground',
}

/** "What to do now" — one clear instruction at the top of the lead page. */
export function NextStepCard({ next }: { next: NextStep }) {
  return (
    <div role="status" className={cn('rounded-xl px-4 py-3', TONE[next.tone])}>
      <p className="font-heading font-semibold">{next.title}</p>
      <p className="text-sm">{next.text}</p>
    </div>
  )
}

/** The steps of a lead (Accept → Try 1–3 → Close → Manager check): done ✓, current ●, upcoming ○. */
export function LeadJourney({ steps }: { steps: JourneyStep[] }) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Lead steps">
      {steps.map((s, i) => (
        <li
          key={s.key}
          aria-current={s.state === 'current' ? 'step' : undefined}
          className={cn(
            'flex items-start gap-2 rounded-xl p-3 ring-1',
            s.state === 'current' ? 'bg-card ring-2 ring-primary' : 'ring-foreground/10',
            s.state === 'done' && 'bg-tone-success-soft/60',
            (s.state === 'upcoming' || s.state === 'skipped') && 'opacity-70',
          )}
        >
          <span
            className={cn(
              'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
              s.state === 'done' ? 'bg-tone-success text-tone-success-foreground' : s.state === 'current' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}
            aria-hidden
          >
            {s.state === 'done' ? <Check className="size-4" /> : s.state === 'current' ? <CircleDot className="size-4" /> : s.state === 'skipped' ? <Minus className="size-4" /> : <Circle className="size-3" />}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">
              {i + 1}. {s.title}
            </span>
            {s.detail ? <span className="block text-xs text-muted-foreground">{s.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  )
}
