import 'server-only'
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>
const KEY_LEN = 64

/** scrypt (Node built-in, no dependency). Stored as "salt:hash" in hex. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, KEY_LEN)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/** Same work for unknown users as for real ones, so response time does not reveal which usernames exist. */
const DUMMY_HASH = `${'0'.repeat(32)}:${'0'.repeat(128)}`
export async function verifyPasswordOrDummy(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
    await verifyPassword(password, DUMMY_HASH)
    return false
  }
  return verifyPassword(password, stored)
}

/** Constant-time string compare (master key, secrets). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

const WEAK = ['volton@123', 'password', 'password1', '12345678', '123456789', 'qwerty123', 'volton123', 'pakistan']
/** Returns a problem message, or null when the password is acceptable. */
export function passwordProblem(password: string, username?: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters'
  if (password.length > 128) return 'Too long'
  if (WEAK.includes(password.toLowerCase())) return 'This password is too common — choose another'
  if (username && username.length >= 4 && password.toLowerCase().includes(username.toLowerCase())) return 'Do not use your username inside the password'
  return null
}
