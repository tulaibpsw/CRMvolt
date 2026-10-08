'use client'

import { useState } from 'react'
import { TextField } from '@/components/common/fields'
import { USERNAME_RULES, normalizeUsername } from '@/lib/username'

/** Username input that shows the final sign-in name while typing ("Talha Khan" → talha.khan). The server cleans it the same way. */
export function UsernameField({ label = 'Username (for sign in)', name = 'username' }: { label?: string; name?: string }) {
  const [value, setValue] = useState('')
  const cleaned = normalizeUsername(value)
  return (
    <div className="space-y-1">
      <TextField label={label} name={name} required autoCapitalize="none" autoComplete="off" spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)} hint={USERNAME_RULES} />
      {value ? (
        <p className={cleaned.length >= 3 ? 'text-sm text-tone-success-soft-foreground' : 'text-sm text-tone-warning-soft-foreground'} aria-live="polite">
          {cleaned.length >= 3 ? `Signs in as: ${cleaned}` : 'Needs at least 3 letters or numbers'}
        </p>
      ) : null}
    </div>
  )
}
