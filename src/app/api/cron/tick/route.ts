import { NextResponse, type NextRequest } from 'next/server'
import { runTick } from '@/server/services/jobs'

/** Called every minute by cron-job.org (free) with Authorization: Bearer $CRON_SECRET. */
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const result = await runTick()
  return NextResponse.json({ ok: true, result })
}
