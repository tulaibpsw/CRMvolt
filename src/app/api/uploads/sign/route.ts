import { NextResponse } from 'next/server'
import { getSessionUser } from '@/server/auth/session'
import { hit } from '@/server/services/rate-limit'
import { isCloudinaryConfigured, uploadSignature } from '@/server/services/cloudinary'

/**
 * Signed, private (type=authenticated) image upload straight from the phone to Cloudinary.
 * The folder is fixed per user, so a file can be traced to who uploaded it; the outcome check verifies it.
 */
export async function POST() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isCloudinaryConfigured()) return NextResponse.json({ error: 'Screenshot upload is not set up yet' }, { status: 503 })
  if ((await hit(`upload:${user.id}`, 60, 60 * 60_000)).blocked) return NextResponse.json({ error: 'Too many uploads — try again later' }, { status: 429 })
  return NextResponse.json(uploadSignature(`volton/attempts/${user.id}`))
}
