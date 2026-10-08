'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Re-loads the data of the current page from the server (no full page reload, scroll position kept).
 * Shown in the top bar, so every page has it.
 */
export function RefreshButton({ className }: { className?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon-touch"
      className={className}
      aria-label={pending ? 'Refreshing…' : done ? 'Refreshed — tap to refresh again' : 'Refresh data'}
      title="Refresh data"
      disabled={pending}
      onClick={() =>
        start(() => {
          router.refresh()
          setDone(true)
          setTimeout(() => setDone(false), 2000)
        })
      }
    >
      <RefreshCw className={cn(pending && 'animate-spin', done && !pending && 'text-tone-success')} aria-hidden />
    </Button>
  )
}
