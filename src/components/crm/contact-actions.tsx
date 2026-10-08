'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Info, Loader2, MessageCircle, Phone, PhoneCall, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ActionForm } from '@/components/common/action-form'
import { CheckboxField, TextAreaField, TextField } from '@/components/common/fields'
import { CALL_RESULTS, CUSTOMER_RESPONSES, MAX_FOLLOW_UPS, type AttemptChannel, type CallResult, type CustomerResponse } from '@/domain/constants'
import type { PendingTap } from '@/domain/view-models'
import { ATTEMPT_CHANNEL_META, CALL_RESULT_META, CUSTOMER_RESPONSE_META } from '@/domain/ui-maps'
import { formatDuration } from '@/lib/duration'
import { cancelAttemptAction, logOutcomeAction, tapAttemptAction } from '@/server/actions'
import { cn } from '@/lib/utils'

/** Big thumb-sized tiles: icon on top, label below — fits 3 across on any phone. */
const BIG_TILE = 'h-20 flex-col gap-1 px-1 text-base [&_svg:not([class*=size-])]:size-7'

type Times = { left?: number; back?: number }
const timesKey = (attemptId: string) => `volton:attempt:${attemptId}`
function readTimes(attemptId: string | null): Times {
  if (!attemptId) return {}
  try {
    return JSON.parse(sessionStorage.getItem(timesKey(attemptId)) ?? '{}') as Times
  } catch {
    return {}
  }
}
function saveTimes(attemptId: string, times: Times) {
  try {
    sessionStorage.setItem(timesKey(attemptId), JSON.stringify(times))
  } catch {}
}
const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-PK', { timeZone: 'Asia/Karachi', hour: 'numeric', minute: '2-digit' })

export interface ContactActionsProps {
  leadId: string
  leadName: string
  leadNo: string
  /** Counted tries so far (cancelled taps and "couldn't call now" are not tries). */
  attemptCount: number
  pending: PendingTap | null
  /** Last saved result, e.g. "No answer · Mon 11:02". */
  lastResult: string | null
  stageLabel: string
}

/**
 * Proof of work: tap (logged on the server) → WhatsApp / dialer → back in the app → "What happened?".
 * The sheet explains why it opened, which try this is and what happens next.
 */
export function ContactActions({ leadId, leadName, leadNo, attemptCount, pending, lastResult, stageLabel }: ContactActionsProps) {
  const [tap, setTap] = useState<{ id: string; channel: AttemptChannel; at: number } | null>(pending ? { id: pending.id, channel: pending.channel, at: new Date(pending.tappedAt).getTime() } : null)
  const [open, setOpen] = useState(!!pending)
  const [reason, setReason] = useState<'back' | 'pending' | 'second_tap' | 'desktop'>(pending ? 'pending' : 'back')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<AttemptChannel | null>(null)
  const [times, setTimes] = useState<Times>(() => (typeof window === 'undefined' ? {} : readTimes(pending?.id ?? null)))
  const leftRef = useRef<number | undefined>(times.left)

  useEffect(() => {
    const onVisibility = () => {
      if (!tap) return
      if (document.visibilityState === 'hidden' && !leftRef.current) {
        leftRef.current = Date.now()
        saveTimes(tap.id, { left: leftRef.current })
      }
      if (document.visibilityState === 'visible' && leftRef.current) {
        const next = { left: leftRef.current, back: Date.now() }
        saveTimes(tap.id, next)
        setTimes(next)
        setReason('back')
        setOpen(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [tap])

  const start = useCallback(
    async (channel: AttemptChannel) => {
      setError(null)
      // A tap is still unsaved → do not start another one; ask about the first.
      if (tap) {
        setReason('second_tap')
        setOpen(true)
        return
      }
      setBusy(channel)
      const result = await tapAttemptAction(leadId, channel)
      setBusy(null)
      if ('error' in result) {
        setError(result.error)
        return
      }
      leftRef.current = undefined
      setTimes({})
      setTap({ id: result.attemptId, channel, at: Date.now() })
      window.location.href = result.href
      // On a computer nothing may "leave" the page — still ask after a moment.
      setTimeout(() => {
        setReason((r) => (r === 'back' ? 'desktop' : r))
        setOpen(true)
      }, 4000)
    },
    [leadId, tap],
  )

  const finish = () => {
    if (tap) {
      try {
        sessionStorage.removeItem(timesKey(tap.id))
      } catch {}
    }
    setOpen(false)
    setTap(null)
  }

  const channelLabel = tap ? ATTEMPT_CHANNEL_META[tap.channel].label : ''
  const away = times.left && times.back ? times.back - times.left : null
  const headline =
    reason === 'second_tap'
      ? `You already tapped ${channelLabel} at ${tap ? clock(tap.at) : ''}`
      : reason === 'pending'
        ? `Save your last ${channelLabel} (${tap ? clock(tap.at) : ''})`
        : away
          ? `Welcome back from ${channelLabel}`
          : `What happened on ${channelLabel}?`

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Button size="xl" disabled={!!busy} onClick={() => start('whatsapp_chat')} className={cn(BIG_TILE, 'bg-tone-success text-tone-success-foreground hover:bg-tone-success/90')}>
          {busy === 'whatsapp_chat' ? <Loader2 className="animate-spin" aria-hidden /> : <MessageCircle aria-hidden />}
          WhatsApp
        </Button>
        <Button size="xl" disabled={!!busy} variant="secondary" className={BIG_TILE} onClick={() => start('whatsapp_call')}>
          {busy === 'whatsapp_call' ? <Loader2 className="animate-spin" aria-hidden /> : <PhoneCall aria-hidden />}
          WA call
        </Button>
        <Button size="xl" disabled={!!busy} variant="outline" className={BIG_TILE} onClick={() => start('phone_call')}>
          {busy === 'phone_call' ? <Loader2 className="animate-spin" aria-hidden /> : <Phone aria-hidden />}
          Call
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        This will be <span className="font-medium text-foreground">try {Math.min(attemptCount + 1, MAX_FOLLOW_UPS)} of {MAX_FOLLOW_UPS}</span>
        {attemptCount >= MAX_FOLLOW_UPS ? ' (extra — the customer asked)' : ''}
        {lastResult ? ` · last time: ${lastResult}` : ' · first contact'}
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {tap && !open ? (
        <Button variant="outline" size="xl" className="w-full border-tone-warning text-base" onClick={() => setOpen(true)}>
          Save the result of your {channelLabel}
        </Button>
      ) : null}
      <Sheet open={open && !!tap} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{headline}</SheetTitle>
            <SheetDescription>
              {leadName} · {leadNo}
            </SheetDescription>
          </SheetHeader>
          {tap ? (
            <div className="space-y-3 px-4">
              <div className="flex gap-2 rounded-lg bg-tone-info-soft px-3 py-2 text-sm text-tone-info-soft-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  {reason === 'second_tap'
                    ? 'Save what happened on that one first (or tell us it was a mistake), then you can tap again.'
                    : reason === 'pending'
                      ? 'This tap was not saved yet. Every call or chat needs a result — it is your proof for the manager.'
                      : 'We ask after every call or chat. Your answer is saved on the lead as proof and decides the next follow-up.'}
                  {away ? ` You were away ${formatDuration(away)}.` : ''}
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-muted/60 p-2">
                  <dt className="text-muted-foreground">This is</dt>
                  <dd className="text-sm font-semibold">
                    Try {Math.min(attemptCount + 1, MAX_FOLLOW_UPS)} of {MAX_FOLLOW_UPS}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/60 p-2">
                  <dt className="text-muted-foreground">Last time</dt>
                  <dd className="text-sm font-semibold">{lastResult ?? '—'}</dd>
                </div>
                <div className="rounded-lg bg-muted/60 p-2">
                  <dt className="text-muted-foreground">Stage now</dt>
                  <dd className="text-sm font-semibold">{stageLabel}</dd>
                </div>
              </dl>
              <OutcomeForm attemptId={tap.id} attemptCount={attemptCount} times={times} onDone={finish} />
              <ActionForm action={cancelAttemptAction} onSuccess={finish} className="border-t border-border pt-3 pb-6">
                <input type="hidden" name="attemptId" value={tap.id} />
                {times.left ? <input type="hidden" name="leftAt" value={times.left} /> : null}
                {times.back ? <input type="hidden" name="returnedAt" value={times.back} /> : null}
                <Button type="submit" variant="ghost" size="touch" className="w-full">
                  <Undo2 data-icon="inline-start" aria-hidden />I tapped by mistake — no call or chat happened
                </Button>
              </ActionForm>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}

const CLOSING: CustomerResponse[] = ['not_interested', 'already_has_solar', 'deal_won']
const NO_ANSWER: CallResult[] = ['no_answer', 'busy', 'number_off']

/** What happens after saving, in plain words (shown before the agent saves). */
function nextPreview(result: CallResult | '', response: CustomerResponse | '', attemptCount: number): string | null {
  if (!result) return null
  const tryNo = attemptCount + 1
  if (result === 'could_not_call') return 'Not counted as a try. You will be reminded again in about 2 hours.'
  if (result === 'wrong_number') return 'The lead closes as "wrong number" and goes to your manager to check.'
  if (NO_ANSWER.includes(result)) {
    if (tryNo >= MAX_FOLLOW_UPS) return `This is no-answer number ${tryNo}. If the earlier tries were also no-answer on another day, the lead is marked Dead and your manager checks it.`
    return `Next try (${tryNo + 1} of ${MAX_FOLLOW_UPS}) is planned automatically ${tryNo === 1 ? 'tomorrow' : 'in 3 days'} in office hours — or pick a time below.`
  }
  if (response === 'deal_won') return 'The lead closes as a sale. It counts in sales after your manager approves it.'
  if (response === 'not_interested' || response === 'already_has_solar') return 'The lead closes as lost. Your manager checks it.'
  if (response === 'call_back_requested') return 'Pick the time the customer asked for below (otherwise: tomorrow).'
  if (response === 'interested') return 'Great — stage moves to Interested. Next follow-up: tomorrow unless you pick a time. Add site details or book a visit on the lead.'
  return null
}

function OutcomeForm({ attemptId, attemptCount, times, onDone }: { attemptId: string; attemptCount: number; times: Times; onDone: () => void }) {
  const [result, setResult] = useState<CallResult | ''>('')
  const [response, setResponse] = useState<CustomerResponse | ''>('')
  const [upload, setUpload] = useState<{ publicId: string; name: string; mime: string; size: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const closing = (response && CLOSING.includes(response)) || result === 'wrong_number'
  const preview = nextPreview(result, response, attemptCount)

  async function onFile(file: File) {
    setUploading(true)
    try {
      const blob = await compressImage(file)
      const sign = await fetch('/api/uploads/sign', { method: 'POST' }).then((r) => r.json())
      if (sign.error) throw new Error(sign.error)
      const fd = new FormData()
      fd.append('file', blob, file.name)
      for (const [k, v] of Object.entries(sign.fields as Record<string, string | number>)) fd.append(k, String(v))
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
    <ActionForm action={logOutcomeAction} onSuccess={onDone}>
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

      <p className="text-sm font-semibold">Step 1 · Did you reach the customer?</p>
      <div className="grid grid-cols-2 gap-2">
        {CALL_RESULTS.map((r) => (
          <label key={r} className={cn('flex min-h-14 cursor-pointer items-center justify-center rounded-xl border-2 px-2 text-center text-sm font-medium', result === r ? 'border-secondary bg-secondary text-secondary-foreground' : 'border-border bg-card')}>
            <input
              type="radio"
              name="result"
              value={r}
              className="sr-only"
              onChange={() => {
                setResult(r)
                setResponse('')
              }}
              required
            />
            {CALL_RESULT_META[r].label}
          </label>
        ))}
      </div>
      {result === 'connected' ? (
        <>
          <p className="text-sm font-semibold">Step 2 · What did the customer say?</p>
          <div className="grid grid-cols-2 gap-2">
            {CUSTOMER_RESPONSES.map((r) => (
              <label key={r} className={cn('flex min-h-14 cursor-pointer items-center justify-center rounded-xl border-2 px-2 text-center text-sm font-medium', response === r ? 'border-secondary bg-secondary text-secondary-foreground' : 'border-border bg-card', r === 'deal_won' && 'col-span-2')}>
                <input type="radio" name="response" value={r} className="sr-only" onChange={() => setResponse(r)} required />
                {CUSTOMER_RESPONSE_META[r].label}
              </label>
            ))}
          </div>
          {response === 'deal_won' ? <TextField label="Sale value (PKR)" name="wonValuePkr" type="number" min={1} inputMode="numeric" required /> : null}
          <TextField label="Call length (minutes, optional)" name="durationMin" type="number" min={0} step="0.5" inputMode="decimal" />
        </>
      ) : null}
      {result ? (
        <>
          <p className="text-sm font-semibold">{result === 'connected' ? 'Step 3' : 'Step 2'} · Note</p>
          <TextAreaField
            label={closing ? 'What did the customer say? (required — your manager reads it)' : 'Short note (optional)'}
            name="remarks"
            rows={2}
            required={!!closing}
            minLength={closing ? 5 : undefined}
            placeholder="e.g. RNR, wants 10 kW in DHA, call after 5 PM"
          />
          {preview ? (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <span className="font-semibold">What happens next: </span>
              {preview}
            </p>
          ) : null}
          {result !== 'could_not_call' && !closing ? <TextField label="Next follow-up time (optional)" name="nextFollowUpAt" type="datetime-local" /> : null}
          {!closing ? <CheckboxField label="Close this lead (your manager will check it)" name="closeLead" /> : null}
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm">
            <Camera className="size-5" aria-hidden />
            {uploading ? 'Uploading…' : upload ? `Screenshot added: ${upload.name}` : 'Add a screenshot of the call log / chat (best proof)'}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        </>
      ) : null}
      <Button type="submit" size="xl" className="sticky bottom-0 w-full" disabled={uploading || !result}>
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
