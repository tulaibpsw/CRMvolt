import { NextResponse, type NextRequest } from 'next/server'
import { getSessionUser } from '@/server/auth/session'
import { uploadSignature } from '@/server/services/cloudinary'

/** Signed, private (type=authenticated) upload straight from the phone to Cloudinary. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { scope } = (await request.json().catch(() => ({}))) as { scope?: string }
  const folder = `volton/${(scope ?? 'misc').replace(/[^a-z0-9/_-]/gi, '')}`
  try {
    return NextResponse.json(uploadSignature(folder))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload not configured' }, { status: 500 })
  }
}
