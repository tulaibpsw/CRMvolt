import { Coffee, LogIn, LogOut, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AttendanceBadge } from '@/components/crm/badges'
import type { AttendanceStatus } from '@/domain/constants'
import { en } from '@/i18n/en'
import { formatPktTime } from '@/lib/dates-pkt'

type FormAction = (formData: FormData) => void | Promise<void>

export interface CheckInCardProps {
  status: AttendanceStatus
  since?: string
  /** Server Actions (wired in M4). Without them the buttons render disabled (catalog/demo). */
  onCheckIn?: FormAction
  onCheckOut?: FormAction
  onToggleBreak?: FormAction
}

/** Agent shift card. Uses plain <form action> so it works without client JavaScript. */
export function CheckInCard({ status, since, onCheckIn, onCheckOut, onToggleBreak }: CheckInCardProps) {
  const hint = status === 'checked_in' ? en.checkIn.checkedInHint : status === 'on_break' ? en.checkIn.onBreakHint : en.checkIn.notCheckedIn
  return (
    <section className="space-y-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading font-semibold">{en.checkIn.title}</h2>
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <AttendanceBadge status={status} />
          {since && status !== 'checked_out' ? en.checkIn.since(formatPktTime(new Date(since))) : null}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{hint}</p>
      <div className="grid grid-cols-2 gap-2">
        {status === 'checked_out' ? (
          <form action={onCheckIn} className="col-span-2">
            <Button type="submit" size="xl" className="w-full" disabled={!onCheckIn}>
              <LogIn data-icon="inline-start" />
              {en.checkIn.checkIn}
            </Button>
          </form>
        ) : (
          <>
            <form action={onToggleBreak}>
              <Button type="submit" variant="outline" size="touch" className="w-full" disabled={!onToggleBreak}>
                {status === 'on_break' ? <Play data-icon="inline-start" /> : <Coffee data-icon="inline-start" />}
                {status === 'on_break' ? en.checkIn.endBreak : en.checkIn.startBreak}
              </Button>
            </form>
            <form action={onCheckOut}>
              <Button type="submit" variant="secondary" size="touch" className="w-full" disabled={!onCheckOut}>
                <LogOut data-icon="inline-start" />
                {en.checkIn.checkOut}
              </Button>
            </form>
          </>
        )}
      </div>
    </section>
  )
}
