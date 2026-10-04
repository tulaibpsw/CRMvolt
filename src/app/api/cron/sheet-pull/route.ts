import { NextResponse, type NextRequest } from 'next/server'
import { isCronAuthorized } from '@/server/http/cron-auth'
import { pullSheet } from '@/server/services/sheet'

/** Called every minute by cron-job.org. Pulls new Google Sheet rows into the CRM. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get('authorization'))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const results = await pullSheet('live')
    return NextResponse.json({ ok: true, results: results?.map((r) => ({ tab: r.tab, created: r.created, failed: r.failed, needsStart: r.needsStart })) ?? 'busy' })
  } catch (error) {
    console.error('[cron/sheet-pull]', error)
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message.slice(0, 200) : 'pull failed' }, { status: 500 })
  }
}
