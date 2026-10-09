'use client'

import { useActionState, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteLeadsAction } from '@/server/actions'
import { cn } from '@/lib/utils'

export const BULK_FORM_ID = 'bulk-leads'

/** Checkbox for one lead row. Belongs to the bulk form through the HTML `form` attribute (works anywhere on the page). */
export function LeadSelectBox({ leadId, label }: { leadId: string; label: string }) {
  return (
    <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center" title="Select">
      <input type="checkbox" name="leadIds" value={leadId} form={BULK_FORM_ID} aria-label={`Select ${label}`} className="size-5 accent-primary" />
    </label>
  )
}

/**
 * Managers: select leads on this page → reason → Delete → confirm. Deleted leads are hidden everywhere
 * (soft delete — history is kept). The count updates as boxes are ticked.
 */
export function LeadBulkActions() {
  const [count, setCount] = useState(0)
  const [total, setTotal] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const boxes = () => [...document.querySelectorAll<HTMLInputElement>(`input[form="${BULK_FORM_ID}"][name="leadIds"]`)]
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof deleteLeadsAction>>, fd: FormData) => {
    const result = await deleteLeadsAction(prev, fd)
    if (result?.ok) {
      boxes().forEach((b) => (b.checked = false))
      setCount(0)
      setConfirming(false)
    }
    return result
  }, null)

  useEffect(() => {
    const update = () => {
      setCount(boxes().filter((b) => b.checked).length)
      setTotal(boxes().length)
    }
    document.addEventListener('change', update)
    update()
    return () => document.removeEventListener('change', update)
  }, [])

  const all = count > 0 && count === total
  return (
    <form id={BULK_FORM_ID} action={action} className={cn('space-y-2 rounded-xl p-3 ring-1 ring-foreground/10', count ? 'bg-tone-danger-soft/40' : 'bg-card')}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={all}
            onChange={(e) => {
              boxes().forEach((b) => (b.checked = e.target.checked))
              setCount(e.target.checked ? total : 0)
              setConfirming(false)
            }}
          />
          Select all on this page
        </label>
        <span className="text-sm text-muted-foreground">{count ? `${count} selected` : 'Tick leads to delete them'}</span>
      </div>
      {count ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-sm">
            <span className="mb-1 block font-medium">Why delete? (required)</span>
            <input name="reason" required minLength={3} maxLength={200} placeholder="e.g. spam, test leads, duplicates" className="h-11 w-full rounded-lg border border-input bg-card px-3 text-base md:text-sm" />
          </label>
          {confirming ? (
            <>
              <Button type="submit" variant="destructive" size="touch" disabled={pending}>
                <Trash2 data-icon="inline-start" aria-hidden />
                {pending ? 'Deleting…' : `Yes, delete ${count} lead${count > 1 ? 's' : ''}`}
              </Button>
              <Button type="button" variant="ghost" size="touch" onClick={() => setConfirming(false)} disabled={pending}>
                Cancel
              </Button>
            </>
          ) : (
            <Button type="button" variant="destructive" size="touch" onClick={() => setConfirming(true)}>
              <Trash2 data-icon="inline-start" aria-hidden />
              Delete {count}
            </Button>
          )}
        </div>
      ) : null}
      {state?.message ? <p role="status" className={cn('rounded-lg px-3 py-2 text-sm', state.ok ? 'bg-tone-success-soft text-tone-success-soft-foreground' : 'bg-tone-danger-soft text-tone-danger-soft-foreground')}>{state.message}</p> : null}
    </form>
  )
}
