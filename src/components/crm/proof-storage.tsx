import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/common/action-form'
import { clearProofsAction } from '@/server/actions'

export interface ProofStorageView {
  all: { count: number; bytes: number }
  week: { count: number; bytes: number }
  month: { count: number; bytes: number }
  older90: { count: number; bytes: number }
  pendingReview: { count: number; bytes: number }
  byAgent: { name: string; count: number; bytes: number }[]
}

const fmt = (bytes: number) => (bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : bytes < 1024 ** 3 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024 ** 3).toFixed(2)} GB`)

/** Settings → Proof storage: how much space call/chat screenshots use, and clearing them by date range. */
export function ProofStorage({ stats, account, scopeLabel }: { stats: ProofStorageView; account: { storageBytes: number; plan: string } | null; scopeLabel: string }) {
  const tiles: [string, { count: number; bytes: number }][] = [
    ['All proofs', stats.all],
    ['This week', stats.week],
    ['This month', stats.month],
    ['Older than 3 months', stats.older90],
  ]
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {scopeLabel}. Only screenshot files are counted and cleared — employees, leads, call results and notes always stay.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, b]) => (
          <div key={label} className="rounded-xl bg-muted/50 p-3">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="font-heading text-xl font-semibold tabular-nums">{fmt(b.bytes)}</p>
            <p className="text-xs text-muted-foreground">{b.count} screenshot(s)</p>
          </div>
        ))}
      </div>
      {account ? (
        <p className="text-sm">
          Whole Cloudinary account (all departments): <span className="font-semibold">{fmt(account.storageBytes)}</span> used · plan {account.plan} (free plan: 25 GB).
        </p>
      ) : null}
      {stats.byAgent.length ? (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">By employee</summary>
          <ul className="divide-y divide-border text-sm">
            {stats.byAgent.map((a) => (
              <li key={a.name} className="flex justify-between py-2">
                <span>{a.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {a.count} · {fmt(a.bytes)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <ActionForm action={clearProofsAction} className="rounded-xl p-3 ring-1 ring-foreground/10">
        <p className="font-medium">Clear screenshots</p>
        <fieldset className="grid gap-1 sm:grid-cols-3">
          {(
            [
              ['this_week', 'This week'],
              ['this_month', 'This month'],
              ['last_month', 'Last month'],
              ['older_90', 'Older than 3 months'],
              ['custom', 'Date range ↓'],
            ] as const
          ).map(([value, label], i) => (
            <label key={value} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted/50">
              <input type="radio" name="range" value={value} defaultChecked={i === 3} className="size-5 accent-primary" />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">From (date range)</span>
            <input type="date" name="from" className="h-11 w-full rounded-lg border border-input bg-card px-3" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">To (date range)</span>
            <input type="date" name="to" className="h-11 w-full rounded-lg border border-input bg-card px-3" />
          </label>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name="keepPending" defaultChecked className="size-5 accent-primary" />
          Keep screenshots still waiting for my review ({stats.pendingReview.count}, {fmt(stats.pendingReview.bytes)})
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <Button type="submit" name="mode" value="preview" variant="outline" size="touch">
            1 · Check what will be deleted
          </Button>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Type CLEAR to confirm</span>
            <input name="confirm" autoComplete="off" autoCapitalize="characters" className="h-11 w-36 rounded-lg border border-input bg-card px-3" />
          </label>
          <Button type="submit" name="mode" value="clear" variant="destructive" size="touch">
            2 · Clear now
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Deleted screenshots cannot be brought back. The call shows “Screenshot cleared”.</p>
      </ActionForm>
    </div>
  )
}
