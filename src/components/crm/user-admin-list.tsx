import { Button } from '@/components/ui/button'
import { ActionForm } from '@/components/common/action-form'
import { StatusBadge } from '@/components/common/status-badge'
import type { Department, Role } from '@/domain/constants'
import { ROLE_META } from '@/domain/ui-maps'
import { deleteUserAction, resetPasswordAction, setUserActiveAction } from '@/server/actions'

export interface AdminListUser {
  id: string
  name: string
  username: string
  phone: string
  role: Role
  department: Department | null
  isActive: boolean
}

/** Which roles the viewer may deactivate / reset / remove (mirrors the server rules in actions.ts). */
export function manageableRoles(viewer: Role): Role[] {
  if (viewer === 'super_admin') return ['admin', 'manager', 'agent', 'field_agent']
  if (viewer === 'admin' || viewer === 'manager') return ['agent', 'field_agent']
  return []
}

/** User rows with the actions the viewer is allowed to use. */
export function UserAdminList({ users, viewer }: { users: AdminListUser[]; viewer: { id: string; role: Role } }) {
  const allowed = manageableRoles(viewer.role)
  return (
    <ul className="divide-y divide-border">
      {users.map((u) => {
        const canManage = u.id !== viewer.id && allowed.includes(u.role)
        return (
          <li key={u.id} className="flex flex-wrap items-center gap-2 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {u.name} <span className="text-xs text-muted-foreground">@{u.username}</span>
              </p>
              <p className="text-xs text-muted-foreground">{[u.department, u.phone].filter(Boolean).join(' · ')}</p>
            </div>
            <StatusBadge {...ROLE_META[u.role]} size="sm" />
            {!u.isActive ? <StatusBadge label="Inactive" tone="neutral" size="sm" /> : null}
            {canManage ? (
              <ActionForm action={setUserActiveAction} className="space-y-1">
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="active" value={String(!u.isActive)} />
                <Button type="submit" variant="ghost" size="touch">
                  {u.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              </ActionForm>
            ) : null}
            {canManage ? (
              <details className="w-full">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm text-muted-foreground">Password / remove…</summary>
                <div className="grid gap-3 pt-2 sm:grid-cols-2">
                  <ActionForm action={resetPasswordAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <div className="flex gap-2">
                      <input name="password" type="text" minLength={8} required aria-label="Temporary password" placeholder="Temporary password" autoComplete="off" className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-3" />
                      <Button type="submit" variant="outline" size="touch">
                        Set
                      </Button>
                    </div>
                  </ActionForm>
                  <ActionForm action={deleteUserAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <div className="flex gap-2">
                      <input name="confirm" required aria-label={`Type ${u.username} to confirm`} placeholder={`Type ${u.username}`} autoComplete="off" autoCapitalize="none" className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-3" />
                      <Button type="submit" variant="destructive" size="touch">
                        Remove
                      </Button>
                    </div>
                  </ActionForm>
                </div>
              </details>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
