import 'server-only'
import type { Types } from 'mongoose'
import { AGENT_ACTIVITY_EVENTS, type AgentActivityEvent, type AlertScope } from '@/domain/constants'
import { connectDb } from '@/server/db/connection'
import { User } from '@/server/db/models'
import { notify } from '@/server/services/common'

export interface AlertPrefs {
  events: AgentActivityEvent[]
  scope: AlertScope
  agentIds: string[]
}

/** A manager who never opened "My alerts" follows everything their employees do (the client asked for this). */
export const MANAGER_DEFAULT_ALERTS: AlertPrefs = { events: [...AGENT_ACTIVITY_EVENTS], scope: 'all', agentIds: [] }
/** Admins follow nothing unless they choose to. */
export const ADMIN_DEFAULT_ALERTS: AlertPrefs = { events: [], scope: 'all', agentIds: [] }

export function prefsOf(user: { role: string; alertPrefs?: { events?: string[]; scope?: string; agentIds?: unknown[] } | null }): AlertPrefs {
  if (!user.alertPrefs) return user.role === 'manager' ? MANAGER_DEFAULT_ALERTS : ADMIN_DEFAULT_ALERTS
  return {
    events: (user.alertPrefs.events ?? []).filter((e): e is AgentActivityEvent => (AGENT_ACTIVITY_EVENTS as readonly string[]).includes(e)),
    scope: user.alertPrefs.scope === 'selected' ? 'selected' : 'all',
    agentIds: (user.alertPrefs.agentIds ?? []).map(String),
  }
}

/**
 * Tell the managers (and admins who opted in) who follow this employee and this kind of action.
 * Never throws — an alert must not break the agent's work.
 */
export async function notifyWatchers(
  agent: { id: string; departmentId: string | Types.ObjectId | null },
  event: AgentActivityEvent,
  message: { title: string; body?: string; link?: string; dedupeKey: string },
): Promise<void> {
  try {
    await connectDb()
    const candidates = await User.find({
      isActive: true,
      deletedAt: null,
      _id: { $ne: agent.id },
      $or: [{ role: 'manager', departmentId: agent.departmentId }, { role: { $in: ['admin', 'super_admin'] }, 'alertPrefs.events': event }],
    })
      .select('_id role alertPrefs')
      .lean()
    const watchers = candidates.filter((u) => {
      const p = prefsOf(u)
      return p.events.includes(event) && (p.scope === 'all' || p.agentIds.includes(agent.id))
    })
    if (!watchers.length) return
    await notify({ userIds: watchers.map((w) => w._id), type: 'agent_activity', title: message.title, body: message.body ?? '', link: message.link, dedupeKey: `watch:${message.dedupeKey}` })
  } catch (error) {
    console.error('[watch]', error)
  }
}
