'use client'

import { useState, useTransition } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { getLeadDetailsAction, type LeadDetailsView } from '@/server/actions'

/**
 * "Sheet details" pop-up: every column the Google Sheet sent for this lead (form answers, campaign, and all extra
 * columns with their values). Loads only when opened.
 */
export function LeadDetailsDialog({ leadId, label = 'Sheet details', compact = false }: { leadId: string; label?: string; compact?: boolean }) {
  const [data, setData] = useState<LeadDetailsView | null>(null)
  const [pending, start] = useTransition()
  const load = () =>
    start(async () => {
      setData(await getLeadDetailsAction(leadId))
    })
  return (
    <Dialog onOpenChange={(open) => open && !data && load()}>
      <DialogTrigger asChild>
        <Button variant="outline" size={compact ? 'icon-touch' : 'touch'} aria-label={label}>
          <FileSpreadsheet data-icon={compact ? undefined : 'inline-start'} aria-hidden />
          {compact ? null : label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{data?.ok ? `${data.name || 'Lead'} · ${data.leadNo}` : 'Lead details'}</DialogTitle>
          <DialogDescription>Everything the Google Sheet / form sent for this lead.</DialogDescription>
        </DialogHeader>
        {pending || !data ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
          </p>
        ) : !data.ok ? (
          <p className="rounded-lg bg-tone-warning-soft px-3 py-2 text-sm text-tone-warning-soft-foreground">{data.message}</p>
        ) : (
          <div className="space-y-4">
            <dl className="divide-y divide-border rounded-lg ring-1 ring-foreground/10">
              {data.facts?.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[40%_1fr] gap-3 px-3 py-2 text-sm">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium break-words">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Extra columns ({data.extra?.length ?? 0})</p>
              {data.extra?.length ? (
                <dl className="divide-y divide-border rounded-lg ring-1 ring-foreground/10">
                  {data.extra.map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[40%_1fr] gap-3 px-3 py-2 text-sm">
                      <dt className="break-words text-muted-foreground">{k}</dt>
                      <dd className="font-medium break-words whitespace-pre-wrap">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">No extra columns for this lead.</p>
              )}
            </div>
            <Button variant="ghost" size="touch" onClick={load} disabled={pending}>
              Reload
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
