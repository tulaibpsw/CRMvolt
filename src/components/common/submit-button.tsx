'use client'

import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type ButtonProps = React.ComponentProps<typeof Button>

/**
 * Submit button for any <form action={serverAction}>: while the server works it is disabled and shows a spinner
 * (stops double taps on slow mobile data). Use instead of <Button type="submit"> in server-action forms.
 */
export function SubmitButton({ children, pendingText = 'Please wait…', disabled, ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />
          {pendingText}
        </>
      ) : (
        children
      )}
    </Button>
  )
}
