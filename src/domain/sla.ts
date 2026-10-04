import type { SlaState } from '@/domain/constants'

/** Last 25% of the window, or the last 5 minutes (whichever is larger), counts as "due soon". */
export function slaState(remainingMs: number, totalMs: number): SlaState {
  if (remainingMs < 0) return 'breached'
  const dueSoonThreshold = Math.max(totalMs * 0.25, 5 * 60_000)
  return remainingMs <= dueSoonThreshold ? 'due_soon' : 'ok'
}
