'use client'

import { useSyncExternalStore } from 'react'
import { formatRemaining } from '@/lib/duration'
import { formatPktTime } from '@/lib/dates-pkt'

const TICK_MS = 1000

function subscribe(onTick: () => void) {
  const id = setInterval(onTick, TICK_MS)
  return () => clearInterval(id)
}
// Rounded to the tick so the snapshot is stable between renders.
const getSnapshot = () => Math.floor(Date.now() / TICK_MS) * TICK_MS
const getServerSnapshot = () => null

/**
 * Current time, ticking every second on the client and `null` during server render / hydration,
 * so the first paint matches the server (no hydration mismatch).
 */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * Live countdown to an ISO deadline. First render shows the deadline time (same on server and client);
 * after hydration it ticks every second.
 */

export function CountdownTimer({ deadline, className }: { deadline: string; className?: string }) {
  const now = useNow()
  const target = new Date(deadline)
  return (
    <time dateTime={deadline} className={className} suppressHydrationWarning>
      {now === null ? formatPktTime(target) : formatRemaining(target.getTime() - now)}
    </time>
  )
}
