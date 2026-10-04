import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/common/action-form'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/states'
import { AttemptCard } from '@/components/crm/attempt-card'
import { requireRole } from '@/server/auth/session'
import { reviewAttemptAction } from '@/server/actions'
import { getReviewQueue } from '@/server/services/queries'

export const metadata = { title: 'Proof review' }

/** Closes to approve and flagged attempts first, then random spot checks, then screenshots to glance at. */
export default async function ReviewPage() {
  const user = await requireRole('admin', 'manager')
  const queue = await getReviewQueue(user)
  return (
    <>
      <PageHeader title="Proof review" description="OK = approve (a WON close then counts in sales). Dispute = the lead re-opens and goes to another agent. For 'Spot check', call the customer to confirm the call happened." />
      {queue.length === 0 ? <EmptyState title="Nothing to review" /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {queue.map(({ leadId, leadNo, attempt }) => (
          <div key={attempt.id} className="space-y-2">
            <Link href={`/leads/${leadId}`} className="text-sm font-medium underline">
              {leadNo}
            </Link>
            <AttemptCard attempt={attempt} />
            <ActionForm action={reviewAttemptAction}>
              <div className="flex gap-2">
                <input type="hidden" name="attemptId" value={attempt.id} />
                <input name="note" maxLength={500} aria-label="Note" placeholder="Note (needed to dispute)" className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-base outline-none md:text-sm" />
                <Button type="submit" name="decision" value="reviewed" size="touch">
                  OK
                </Button>
                <Button type="submit" name="decision" value="disputed" variant="destructive" size="touch">
                  Dispute
                </Button>
              </div>
            </ActionForm>
          </div>
        ))}
      </div>
    </>
  )
}
