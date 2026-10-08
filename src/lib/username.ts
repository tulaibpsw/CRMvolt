/**
 * Usernames people type are cleaned instead of rejected:
 * "Talha Khan" → "talha.khan", " Waji_Ahmed " → "waji_ahmed", "Ali@123" → "ali123".
 * Rules after cleaning: 3–30 characters, a–z, 0–9, dot, dash, underscore; starts with a letter or number.
 */
export const USERNAME_RULES = '3–30 characters. Letters and numbers; spaces become dots; capital letters are fine.'

export function normalizeUsername(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/([._-])[._-]+/g, '$1')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 30)
    .replace(/[._-]+$/g, '')
}

/** Plain-English problem with a username (after cleaning), or null. */
export function usernameProblem(cleaned: string): string | null {
  if (cleaned.length < 3) return 'Username needs at least 3 letters or numbers'
  return null
}
