import { describe, expect, it } from 'vitest'
import { isCatalogEnabled, parseServerEnv, requireMongoUri } from '@/lib/env'

describe('parseServerEnv', () => {
  it('applies defaults', () => {
    const env = parseServerEnv({})
    expect(env.NODE_ENV).toBe('development')
    expect(env.ENABLE_UI_CATALOG).toBe('false')
    expect(env.MONGODB_URI).toBeUndefined()
  })

  it('treats empty strings as unset', () => {
    expect(parseServerEnv({ MONGODB_URI: '' }).MONGODB_URI).toBeUndefined()
  })

  it('accepts a MongoDB URI', () => {
    const uri = 'mongodb+srv://user:pass@cluster0.example.mongodb.net/volton'
    expect(parseServerEnv({ MONGODB_URI: uri }).MONGODB_URI).toBe(uri)
  })

  it('rejects a non-MongoDB URI with a clear message', () => {
    expect(() => parseServerEnv({ MONGODB_URI: 'postgres://x' })).toThrow(/MONGODB_URI/)
  })
})

describe('isCatalogEnabled', () => {
  it('is on outside production', () => {
    expect(isCatalogEnabled(parseServerEnv({ NODE_ENV: 'development' }))).toBe(true)
  })

  it('is off in production unless ENABLE_UI_CATALOG is true', () => {
    expect(isCatalogEnabled(parseServerEnv({ NODE_ENV: 'production' }))).toBe(false)
    expect(isCatalogEnabled(parseServerEnv({ NODE_ENV: 'production', ENABLE_UI_CATALOG: 'true' }))).toBe(true)
  })
})

describe('requireMongoUri', () => {
  it('points to .env.example when the URI is missing', () => {
    expect(() => requireMongoUri(parseServerEnv({}))).toThrow(/\.env\.example/)
  })
})
