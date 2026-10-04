'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, MessageCircle, Phone, PhoneCall } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ActionForm } from '@/components/common/action-form'
import { CheckboxField, TextAreaField, TextField } from '@/components/common/fields'
import { CALL_RESULTS, CUSTOMER_RESPONSES, type AttemptChannel, type CallResult } from '@/domain/constants'
import { CALL_RESULT_META, CUSTOMER_RESPONSE_META } from '@/domain/ui-maps'
import { logOutcomeAction, tapAttemptAction } from '@/server/actions'
import { cn } from '@/lib/utils'

/**
 * Proof of work, step 1 + 2: the tap is logged on the server, WhatsApp/dialer opens, the app records when the agent
 * left and came back (Page Visibility), then the 2-tap outcome sheet must be filled (PDF §9 wording).
 */
/** Big thumb-sized tiles: icon on top, label below — fits 3 across on any phone. */
const BIG_TILE = 'h-20 flex-col gap-1 px-1 text-base [&_svg:not([class*=size-])]:size-7'

export function ContactActions({ leadId, pendingAttemptId }: { leadId: string; pendingAttemptId: string | null }) {
  const [attemptId, setAttemptId] = useState<string | null>(pendingAttemptId)
  const [open, setOpen] = useState(!!pendingAttemptId)
  const [error, setError] = useState<string | null>(null)
  const [times, setTimes] = useState<{ left?: number; back?: number }>({})
  const leftRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const onVisibility = () => {
      if (!attemptId) return
      if (document.visibilityState === 'hidden' && !leftRef.current) leftRef.current = Date.now()
      if (document.visibilityState === 'visible' && leftRef.current) {
        setTimes({ left: leftRef.current, back: Date.now() })
        setOpen(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [attemptId])

  const tap = useCallback(
    async (channel: AttemptChannel) => {
      setError(null)
      const result = await tapAttemptAction(leadId, channel)
      if ('error' in result) {
        setError(result.error)
        return
      }
      leftRef.current = undefined
      setTimes({})
      setAttemptId(result.attemptId)
      window.location.href = result.href
      // On desktop nothing may "leave" the page — still ask for the outcome after a moment.
      setTimeout(() => setOpen(true), 4000)
    },
    [leadId],
  )

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Button size="xl" onClick={() => tap('whatsapp_chat')} className={cn(BIG_TILE, 'bg-tone-success text-tone-success-foreground hover:bg-tone-success/90')}>
          <MessageCircle aria-hidden />
          WhatsApp
        </Button>
        <Button size="xl" variant="secondary" className={BIG_TILE} onClick={() => tap('whatsapp_call')}>
          <PhoneCall aria-hidden />
          WA call
        </Button>
        <Button size="xl" variant="outline" className={BIG_TILE} onClick={() => tap('phone_call')}>
          <Phone aria-hidden />
          Call
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {attemptId && !open ? (
        <Button variant="outline" size="xl" className="w-full border-tone-warning text-base" onClick={() => setOpen(true)}>
          Log the result of your last attempt
        </Button>
      ) : null}
      <Sheet open={open && !!attemptId} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>What happened?</SheetTitle>
            <SheetDescription>Saved as proof on this lead.</SheetDescription>
          </SheetHeader>
          {attemptId ? <OutcomeForm attemptId={attemptId} times={times} onDone={() => { setOpen(false); setAttemptId(null) }} /> : null}
        </SheetContent>
      </Sheet>
    </>
  )
}

function OutcomeForm({ attemptId, times, onDone }: { attemptId: string; times: { left?: number; back?: number }; onDone: () => void }) {
  const [result, setResult] = useState<CallResult | ''>('')
  const [upload, setUpload] = useState<{ publicId: string; name: string; mime: string; size: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [tomorrow] = useState(() => new Date(Date.now() + 86_400_000 + 5 * 3_600_000).toISOString().slice(0, 16))

  async function onFile(file: File) {
    setUploading(true)
    try {
      const blob = await compressImage(file)
      const sign = await fetch('/api/uploads/sign', { method: 'POST', body: JSON.stringify({ scope: 'attempts' }) }).then((r) => r.json())
      if (sign.error) throw new Error(sign.error)
      const fd = new FormData()
      fd.append('file', blob, file.name)
      fd.append('api_key', sign.apiKey)
      fd.append('timestamp', String(sign.timestamp))
      fd.append('folder', sign.folder)
      fd.append('type', sign.type)
      fd.append('signature', sign.signature)
      const res = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`, { method: 'POST', body: fd }).then((r) => r.json())
      if (!res.public_id) throw new Error(res.error?.message ?? 'Upload failed')
      setUpload({ publicId: res.public_id, name: file.name, mime: blob.type, size: blob.size })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <ActionForm action={logOutcomeAction} onSuccess={onDone} className="px-4 pb-6">
      <input type="hidden" name="attemptId" value={attemptId} />
      {times.left ? <input type="hidden" name="leftAt" value={times.left} /> : null}
      {times.back ? <input type="hidden" name="returnedAt" value={times.back} /> : null}
      {upload ? (
        <>
          <input type="hidden" name="screenshotPublicId" value={upload.publicId} />
          <input type="hidden" name="screenshotName" value={upload.name} />
          <input type="hidden" name="screenshotMime" value={upload.mime} />
          <input type="hidden" name="screenshotSize" value={upload.size} />
        </>
      ) : null}

      <p className="text-sm font-medium">1 · Call result</p>
      <div className="grid grid-cols-2 gap-2">
        {CALL_RESULTS.map((r) => (
          <label key={r} className={cn('flex min-h-14 cursor-pointer items-center justify-center rounded-xl border-2 px-2 text-center text-sm font-medium', result === r ? 'border-secondary bg-secondary text-secondary-foreground' : 'border-border bg-card')}>
            <input type="radio" name="result" value={r} className="sr-only" onChange={() => setResult(r)} required />
            {CALL_RESULT_META[r].label}
          </label>
        ))}
      </div>
      {result === 'connected' ? (
        <>
          <p className="text-sm font-medium">2 · Customer response</p>
          <div className="grid grid-cols-2 gap-2">
            {CUSTOMER_RESPONSES.map((r) => (
              <label key={r} className="flex min-h-14 cursor-pointer items-center justify-center rounded-xl border-2 border-border bg-card px-2 text-center text-sm has-[:checked]:border-secondary has-[:checked]:bg-secondary has-[:checked]:text-secondary-foreground">
                <input type="radio" name="response" value={r} className="sr-only" required />
                {CUSTOMER_RESPONSE_META[r].label}
              </label>
            ))}
          </div>
          <TextField label="Call length (minutes, optional)" name="durationMin" type="number" min={0} step="0.5" inputMode="decimal" />
        </>
      ) : null}
      <TextAreaField label="Remarks" name="remarks" rows={2} placeholder="e.g. RNR, wants 10 kW in DHA, call after 5 PM" />
      {result !== 'could_not_call' ? <TextField label="Next follow-up (leave empty for the automatic 1-1-3 day plan)" name="nextFollowUpAt" type="datetime-local" defaultValue={result === 'connected' ? tomorrow : undefined} /> : null}
      <CheckboxField label="Close this lead (no more follow-ups)" name="closeLead" />
      <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm">
        <Camera className="size-5" aria-hidden />
        {uploading ? 'Uploading…' : upload ? `Screenshot added: ${upload.name}` : 'Add screenshot of call log / chat (proof)'}
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>
      <Button type="submit" size="xl" className="sticky bottom-0 w-full" disabled={uploading}>
        Save result
      </Button>
    </ActionForm>
  )
}

/** Shrink photos on the phone (~1280 px, JPEG 0.7 ≈ 150 KB) so the free Cloudinary plan lasts. */
async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.7))
}
