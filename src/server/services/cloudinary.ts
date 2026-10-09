import 'server-only'
import { UserError } from '@/server/services/common'
import { createHash } from 'node:crypto'
import { getServerEnv } from '@/lib/env'

/**
 * Cloudinary (free plan). Files are uploaded straight from the phone with a server-made signature and stored as
 * type "authenticated" (private). Downloads use short-lived signed URLs created after the role check.
 */
function creds() {
  const env = getServerEnv()
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) throw new UserError('Cloudinary keys are missing in .env.local')
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

export const PROOF_FORMATS = 'jpg,jpeg,png,webp,heic'

/** Signed upload: private, images only, into the caller's own folder. The phone must send exactly these fields. */
export function uploadSignature(folder: string) {
  const { cloud, key, secret } = creds()
  const params = { folder, timestamp: Math.floor(Date.now() / 1000), type: 'authenticated', allowed_formats: PROOF_FORMATS }
  return { cloudName: cloud, fields: { ...params, api_key: key, signature: signParams(params, secret) } }
}

export const isCloudinaryConfigured = () => {
  const env = getServerEnv()
  return !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)
}

/** Look up a private upload (Admin API) — proves the file exists, where it is, when it was made and its content hash. */
export async function getPrivateImage(publicId: string): Promise<{ etag: string; createdAt: Date; bytes: number; format: string } | null> {
  const { cloud, key, secret } = creds()
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/image/authenticated/${publicId.split('/').map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` },
    cache: 'no-store',
  })
  if (!res.ok) return null
  const body = (await res.json()) as { etag?: string; created_at?: string; bytes?: number; format?: string }
  if (!body.etag || !body.created_at) return null
  return { etag: body.etag, createdAt: new Date(body.created_at), bytes: body.bytes ?? 0, format: body.format ?? 'jpg' }
}

const authHeader = () => {
  const { key, secret } = creds()
  return `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`
}

/** Delete private images (Admin API, max 100 per call). "not found" counts as deleted. Throws if Cloudinary refuses. */
export async function deletePrivateImages(publicIds: string[]): Promise<void> {
  const { cloud } = creds()
  for (let i = 0; i < publicIds.length; i += 100) {
    const batch = publicIds.slice(i, i + 100)
    const q = new URLSearchParams()
    for (const id of batch) q.append('public_ids[]', id)
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/image/authenticated?${q}`, { method: 'DELETE', headers: { Authorization: authHeader() }, cache: 'no-store' })
    if (!res.ok) throw new UserError(`Cloudinary did not delete the files (${res.status}) — nothing was cleared. Try again later.`)
  }
}

/** Whole Cloudinary account usage (all departments): storage bytes and plan credits. Null when not available. */
export async function cloudinaryUsage(): Promise<{ storageBytes: number; plan: string; creditsUsed: number | null; creditsLimit: number | null } | null> {
  if (!isCloudinaryConfigured()) return null
  try {
    const { cloud } = creds()
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/usage`, { headers: { Authorization: authHeader() }, cache: 'no-store' })
    if (!res.ok) return null
    const u = (await res.json()) as { plan?: string; storage?: { usage?: number }; credits?: { usage?: number; limit?: number } }
    return { storageBytes: u.storage?.usage ?? 0, plan: u.plan ?? 'Free', creditsUsed: u.credits?.usage ?? null, creditsLimit: u.credits?.limit ?? null }
  } catch {
    return null
  }
}

/** Expiring download link for a private file (default 10 minutes). */
export function privateDownloadUrl(publicId: string, format: string, expiresInSec = 600): string {
  const { cloud, key, secret } = creds()
  const timestamp = Math.floor(Date.now() / 1000)
  const params = { public_id: publicId, format, type: 'authenticated', timestamp, expires_at: timestamp + expiresInSec }
  const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), api_key: key, signature: signParams(params, secret) })
  return `https://api.cloudinary.com/v1_1/${cloud}/image/download?${query}`
}
