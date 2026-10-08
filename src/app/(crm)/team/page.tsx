import { ArrowDown, ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/common/action-form'
import { CheckboxField, TextField } from '@/components/common/fields'
import { PageHeader } from '@/components/common/page-header'
import { SectionCard } from '@/components/common/section-card'
import { EmptyState } from '@/components/common/states'
import { StatusBadge } from '@/components/common/status-badge'
import { TeamMemberRow } from '@/components/crm/team-member-row'
import { DEPARTMENT_META } from '@/domain/ui-maps'
import { requireRole } from '@/server/auth/session'
import { bulkReassignAction, moveTeamMemberAction, pingAgentAction, setTeamMemberAction, updateTeamSettingsAction } from '@/server/actions'
import { getTeamBoard, getTeams } from '@/server/services/queries'

export const metadata = { title: 'Team' }

export default async function TeamPage() {
  const user = await requireRole('admin', 'manager')
  const [teams, board] = await Promise.all([getTeams(user), getTeamBoard(user)])
  const now = new Date()
  const callAgents = board.filter((m) => m.role === 'agent')
  return (
    <>
      <PageHeader title="Team" description="Assignment order, timings and who is working now." />
      {teams.length === 0 ? <EmptyState title="No team yet" description="Create a manager in Settings → Users — their team is created automatically." /> : null}
      {teams.map((team) => (
        <div key={team.id} className="grid gap-4 lg:grid-cols-2">
          <SectionCard title={`${team.name}`} description={`${DEPARTMENT_META[team.department]?.label ?? ''} · manager ${team.manager}`} actions={team.settings.paused ? <StatusBadge label="Auto-assign paused" tone="warning" size="sm" /> : null}>
            <p className="mb-2 text-sm text-muted-foreground">Leads go in this order: 1 → 2 → 3 … then back to 1. Only checked-in agents get leads.</p>
            <ol className="space-y-1">
              {team.members.map((m: { id: string; name: string }, i: number) => (
                <li key={m.id} className="flex min-h-11 items-center gap-2 rounded-lg bg-muted/50 px-3">
                  <span className="w-6 font-semibold tabular-nums">{i + 1}</span>
                  <span className="flex-1 truncate">
                    {m.name}
                    {team.lastUid === m.id ? <span className="ms-2 text-xs text-muted-foreground">(got the last lead)</span> : null}
                  </span>
                  <form action={moveTeamMemberAction}>
                    <input type="hidden" name="teamId" value={team.id} />
                    <input type="hidden" name="userId" value={m.id} />
                    <Button type="submit" name="direction" value="up" variant="ghost" size="icon-touch" aria-label={`Move ${m.name} up`} disabled={i === 0}>
                      <ArrowUp />
                    </Button>
                    <Button type="submit" name="direction" value="down" variant="ghost" size="icon-touch" aria-label={`Move ${m.name} down`} disabled={i === team.members.length - 1}>
                      <ArrowDown />
                    </Button>
                  </form>
                  <form action={setTeamMemberAction}>
                    <input type="hidden" name="teamId" value={team.id} />
                    <input type="hidden" name="userId" value={m.id} />
                    <input type="hidden" name="member" value="false" />
                    <Button type="submit" variant="ghost" size="touch">
                      Remove
                    </Button>
                  </form>
                </li>
              ))}
            </ol>
            {callAgents.filter((a) => !team.members.some((m: { id: string }) => m.id === a.id)).length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {callAgents
                  .filter((a) => !team.members.some((m: { id: string }) => m.id === a.id))
                  .map((a) => (
                    <form key={a.id} action={setTeamMemberAction}>
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="userId" value={a.id} />
                      <input type="hidden" name="member" value="true" />
                      <Button type="submit" variant="outline" size="touch">
                        + {a.name}
                      </Button>
                    </form>
                  ))}
              </div>
            ) : null}
          </SectionCard>
          <SectionCard title="Timings">
            <ActionForm action={updateTeamSettingsAction}>
              <input type="hidden" name="teamId" value={team.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Manager window (min, 0 = auto at once)" name="managerWindowMin" type="number" min={0} max={60} defaultValue={team.settings.managerWindowMin} />
                <TextField label="Agent must accept within (min)" name="acceptWithinMin" type="number" min={1} max={120} defaultValue={team.settings.acceptWithinMin} />
                <TextField label="First call/WhatsApp within (min)" name="contactWithinMin" type="number" min={5} max={240} defaultValue={team.settings.contactWithinMin} />
                <TextField label="Max leads waiting to accept, per agent" name="maxPendingAccept" type="number" min={1} max={20} defaultValue={team.settings.maxPendingAccept} />
              </div>
              <CheckboxField label="If not accepted in time, move the lead to the next agent" name="autoMoveOnAcceptTimeout" defaultChecked={team.settings.autoMoveOnAcceptTimeout} />
              <CheckboxField label="Give new leads only to agents who are checked in (recommended)" name="requireCheckIn" defaultChecked={team.settings.requireCheckIn} />
              <CheckboxField label="Give out leads at night / on holidays too (otherwise they wait for office hours)" name="assignOutsideHours" defaultChecked={team.settings.assignOutsideHours} />
              <CheckboxField label="Pause auto-assign (manager assigns everything)" name="paused" defaultChecked={team.settings.paused} />
              <Button type="submit" size="touch">
                Save timings
              </Button>
            </ActionForm>
          </SectionCard>
        </div>
      ))}
      <SectionCard title="Who is working now">
        {board.length === 0 ? (
          <EmptyState title="No agents" />
        ) : (
          board.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <div className="flex-1">
                <TeamMemberRow member={m} now={now} />
              </div>
              <details className="relative">
                <summary className="flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-sm font-medium ring-1 ring-foreground/10">Ping</summary>
                <ActionForm action={pingAgentAction} className="absolute end-0 z-10 mt-2 w-72 rounded-xl bg-card p-3 shadow-lg ring-1 ring-foreground/10">
                  <input type="hidden" name="agentId" value={m.id} />
                  <TextField label={`Message to ${m.name}`} name="message" maxLength={200} placeholder="Please check your leads" />
                  <Button type="submit" size="touch" className="w-full">
                    Send ping
                  </Button>
                </ActionForm>
              </details>
              {m.openLeads > 0 ? (
                <form action={bulkReassignAction}>
                  <input type="hidden" name="fromAgentId" value={m.id} />
                  <Button type="submit" variant="outline" size="touch">
                    Give leads to others
                  </Button>
                </form>
              ) : null}
            </div>
          ))
        )}
      </SectionCard>
    </>
  )
}
