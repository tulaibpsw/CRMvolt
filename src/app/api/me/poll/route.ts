import { after, NextResponse } from 'next/server'
import { getSessionUser } from '@/server/auth/session'
import { maybeTick } from '@/server/services/jobs'
import { listNotifications } from '@/server/services/queries'

/** Polled every ~20 s by open screens: unread alerts. Also the backup clock for timers if cron-job.org misses a minute. */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  after(() => maybeTick().catch(() => undefined))
  return NextResponse.json(await listNotifications(user.id))
}
