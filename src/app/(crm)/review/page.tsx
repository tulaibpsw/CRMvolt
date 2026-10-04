import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/states'
import { AttemptCard } from '@/components/crm/attempt-card'
import { requireRole } from '@/server/auth/session'
import { reviewAttemptAction } from '@/server/actions'
import { getReviewQueue } from '@/server/services/queries'

export const metadata = { title: 'Proof review' }

/** Flagged attempts first (too fast, never left the app, logged off duty), then screenshots to check. */
export default async function ReviewPage() {
  const user = await requireRole('admin', 'manager')
  const queue = await getReviewQueue(user)
  return (
    <>
      <PageHeader title="Proof review" description="Check suspicious attempts. Also call back ~3 customers per agent each week to confirm." />
      {queue.length === 0 ? <EmptyState title="Nothing to review" /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {queue.map(({ leadId, leadNo, attempt }) => (
          <div key={attempt.id} className="space-y-2">
            <Link href={`/leads/${leadId}`} className="text-sm font-medium underline">
              {leadNo}
            </Link>
            <AttemptCard attempt={attempt} />
            <form action={reviewAttemptAction} className="flex gap-2">
              <input type="hidden" name="attemptId" value={attempt.id} />
              <input name="note" aria-label="Note" placeholder="Note (optional)" className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-base outline-none md:text-sm" />
              <Button type="submit" name="decision" value="reviewed" size="touch">
                OK
              </Button>
              <Button type="submit" name="decision" value="disputed" variant="destructive" size="touch">
                Dispute
              </Button>
            </form>
          </div>
        ))}
      </div>
    </>
  )
}
