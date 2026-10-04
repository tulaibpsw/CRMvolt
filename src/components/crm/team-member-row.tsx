import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { AttendanceBadge } from '@/components/crm/badges'
import type { TeamMemberView } from '@/domain/view-models'
import { en } from '@/i18n/en'
import { formatAgo } from '@/lib/duration'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

/** Manager live board row. `now` is passed in so server rendering stays deterministic. */
export function TeamMemberRow({ member, now }: { member: TeamMemberView; now: Date }) {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-lg px-3 py-2">
      <Avatar>
        <AvatarFallback>{initials(member.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{member.name}</p>
        <p className="text-xs text-muted-foreground">
          {en.team.openLeads(member.openLeads)} · {en.team.pendingAccept(member.pendingAccept)} ·{' '}
          {member.lastActionAt ? en.team.lastAction(formatAgo(new Date(member.lastActionAt), now)) : en.team.noActionYet}
        </p>
      </div>
      <AttendanceBadge status={member.attendance} size="sm" />
    </div>
  )
}
