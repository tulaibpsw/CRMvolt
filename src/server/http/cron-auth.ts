import 'server-only'
import { safeEqual } from '@/server/auth/password'

/** cron-job.org sends "Authorization: Bearer $CRON_SECRET". Constant-time compare; no secret configured = always refused. */
export function isCronAuthorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16 || !header) return false
  return safeEqual(header, `Bearer ${secret}`)
}
