import { NextResponse, type NextRequest } from 'next/server'
import { isCronAuthorized } from '@/server/http/cron-auth'
import { runTick } from '@/server/services/jobs'

/** Called every minute by cron-job.org (free) with Authorization: Bearer $CRON_SECRET. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get('authorization'))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, result: await runTick() })
  } catch (error) {
    console.error('[cron/tick]', error)
    return NextResponse.json({ ok: false, error: 'tick failed' }, { status: 500 })
  }
}
