import { en } from '@/i18n/en'

/** 45s · 3m 20s · 1h 05m · 2d 4h — always positive, for countdowns and "away" times. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  return `${seconds}s`
}

/** "Due in 12m 30s" / "Overdue 3m 05s" */
export function formatRemaining(ms: number): string {
  return ms >= 0 ? en.common.dueIn(formatDuration(ms)) : en.common.overdueBy(formatDuration(ms))
}

/** "just now" · "5m ago" · "2h 10m ago" */
export function formatAgo(from: Date, now: Date): string {
  const ms = now.getTime() - from.getTime()
  if (ms < 60_000) return en.common.justNow
  return en.common.ago(formatDuration(ms).replace(/ \d+s$/, ''))
}
