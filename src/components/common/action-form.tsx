'use client'

import { useActionState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export type FormState = { ok: boolean; message?: string; fieldErrors?: Record<string, string> } | null

/**
 * Form bound to a Server Action that returns { ok, message }. Shows the message, disables while saving,
 * optional reset on success. Fields are plain children (server-renderable).
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  onSuccess,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  children: React.ReactNode
  className?: string
  resetOnSuccess?: boolean
  onSuccess?: () => void
}) {
  const [state, formAction, pending] = useActionState(action, null)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset()
      onSuccess?.()
    }
  }, [state, resetOnSuccess, onSuccess])
  return (
    <form ref={ref} action={formAction} className={cn('space-y-3', className)} aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-3">
        {children}
      </fieldset>
      {state?.message ? (
        <p role="status" className={cn('rounded-lg px-3 py-2 text-sm', state.ok ? 'bg-tone-success-soft text-tone-success-soft-foreground' : 'bg-tone-danger-soft text-tone-danger-soft-foreground')}>
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
