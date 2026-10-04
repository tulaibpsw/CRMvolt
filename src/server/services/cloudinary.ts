import 'server-only'
import { createHash } from 'node:crypto'
import { getServerEnv } from '@/lib/env'

/**
 * Cloudinary (free plan). Files are uploaded straight from the phone with a server-made signature and stored as
 * type "authenticated" (private). Downloads use short-lived signed URLs created after the role check.
 */
function creds() {
  const env = getServerEnv()
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) throw new Error('Cloudinary keys are missing in .env.local')
  return { cloud: env.CLOUDINARY_CLOUD_NAME, key: env.CLOUDINARY_API_KEY, secret: env.CLOUDINARY_API_SECRET }
}

/** Cloudinary signature: sorted "k=v&k=v" + api_secret, SHA-1 hex. */
export function signParams(params: Record<string, string | number>, secret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return createHash('sha1').update(toSign + secret).digest('hex')
}

export function uploadSignature(folder: string) {
  const { cloud, key, secret } = creds()
  const timestamp = Math.floor(Date.now() / 1000)
  const params = { folder, timestamp, type: 'authenticated' }
  return { cloudName: cloud, apiKey: key, timestamp, folder, type: 'authenticated', signature: signParams(params, secret) }
}

/** Expiring download link for a private file (default 10 minutes). */
export function privateDownloadUrl(publicId: string, format: string, expiresInSec = 600): string {
  const { cloud, key, secret } = creds()
  const timestamp = Math.floor(Date.now() / 1000)
  const params = { public_id: publicId, format, type: 'authenticated', timestamp, expires_at: timestamp + expiresInSec }
  const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), api_key: key, signature: signParams(params, secret) })
  return `https://api.cloudinary.com/v1_1/${cloud}/image/download?${query}`
}
