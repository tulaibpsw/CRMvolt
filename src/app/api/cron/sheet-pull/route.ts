import { NextResponse, type NextRequest } from 'next/server'
import { pullSheet } from '@/server/services/sheet'

/** Called every minute by cron-job.org. Pulls new Google Sheet rows (Leads tab) into the CRM. */
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}` || !process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json({ ok: true, results: await pullSheet('live') })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
