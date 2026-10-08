import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/common/action-form'
import { assignQueuedNowAction } from '@/server/actions'

export interface QueuePanelTeam {
  teamId: string
  teamName: string
  ready: number
  held: number
  checkedIn: number
  agents: number
  reasons: string[]
}

/** Manager view of the lead queue: how many wait, WHY they are not going out, and an "Assign now" button. */
export function QueuePanel({ teams }: { teams: QueuePanelTeam[] }) {
  return (
    <div className="space-y-3">
      {teams.map((t) => {
        const waiting = t.ready + t.held
        return (
          <div key={t.teamId} className="space-y-2 rounded-xl bg-muted/50 p-3">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {waiting && t.reasons.length ? <AlertTriangle className="size-4 text-tone-warning" aria-hidden /> : <CheckCircle2 className="size-4 text-tone-success" aria-hidden />}
              {teams.length > 1 ? `${t.teamName}: ` : ''}
              {waiting ? `${waiting} lead(s) waiting` : 'No leads waiting'} · {t.checkedIn} of {t.agents} agents checked in
            </p>
            {waiting ? (
              <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                {t.reasons.length ? t.reasons.map((r) => <li key={r}>{r}</li>) : <li>They are being given out now.</li>}
              </ul>
            ) : null}
            {waiting ? (
              <ActionForm action={assignQueuedNowAction}>
                <input type="hidden" name="teamId" value={t.teamId} />
                <Button type="submit" size="touch" className="w-full sm:w-auto">
                  Assign waiting leads now
                </Button>
              </ActionForm>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
