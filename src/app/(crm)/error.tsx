'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

/** Friendly screen instead of "server error" — keeps the menu, offers retry and a way home. */
export default function CrmError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-xl bg-card p-6 text-center ring-1 ring-foreground/10">
      <h1 className="font-heading text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">Please try again. If it keeps happening, tell your manager{error.digest ? ` (code ${error.digest})` : ''}.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button size="touch" onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="outline" size="touch">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
