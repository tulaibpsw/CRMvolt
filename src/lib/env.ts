import { z } from 'zod'

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGODB_URI: z.string().startsWith('mongodb', 'MONGODB_URI must start with mongodb:// or mongodb+srv://').optional(),
  ENABLE_UI_CATALOG: z.enum(['true', 'false']).default('false'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters').optional(),
  MASTER_KEY: z.string().min(8).optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CRON_SECRET: z.string().min(16).optional(),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

/** Parse an env-like object. Empty strings count as "not set". Throws one readable error listing every problem. */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''))
  const result = serverEnvSchema.safeParse(cleaned)
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Invalid environment variables — ${issues}`)
  }
  return result.data
}

export function getServerEnv(): ServerEnv {
  return parseServerEnv(process.env)
}

/** The /dev/ui catalog is always on in development; on a deployment it needs ENABLE_UI_CATALOG=true. */
export function isCatalogEnabled(env: ServerEnv = getServerEnv()): boolean {
  return env.NODE_ENV !== 'production' || env.ENABLE_UI_CATALOG === 'true'
}

export function requireMongoUri(env: ServerEnv = getServerEnv()): string {
  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set — copy .env.example to .env.local and fill it in')
  }
  return env.MONGODB_URI
}
