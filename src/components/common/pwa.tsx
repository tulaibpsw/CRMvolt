'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Download, Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { en } from '@/i18n/en'

/** Registers /public/sw.js (static-file cache + offline page). Rendered once in the root layout. */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {})
  }, [])
  return null
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'volton-install-dismissed'
const noop = () => () => {}

function readDevice() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  let dismissed = false
  try {
    dismissed = localStorage.getItem(DISMISS_KEY) === '1'
  } catch {}
  return `${standalone ? 1 : 0}${ios ? 1 : 0}${dismissed ? 1 : 0}`
}

/**
 * "Install app" banner. Android/Chrome: real install button (beforeinstallprompt).
 * iPhone/iPad: Safari has no install button, so we show the Share → Add to Home Screen steps.
 * Hidden once installed or after "Not now".
 */
export function InstallPrompt() {
  const device = useSyncExternalStore(noop, readDevice, () => '100')
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(false)
  const [standalone, ios, dismissed] = device.split('').map((c) => c === '1')

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setHidden(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (standalone || dismissed || hidden || (!ios && !deferred)) return null

  const later = () => {
    setHidden(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {}
  }

  return (
    <section className="relative flex flex-col gap-3 rounded-xl bg-sidebar p-4 text-sidebar-foreground sm:flex-row sm:items-center">
      <div className="flex-1 pe-8 sm:pe-0">
        <h2 className="font-heading font-semibold">{en.pwa.installTitle}</h2>
        <p className="text-sm opacity-80">{ios ? en.pwa.iosSteps : en.pwa.installBody}</p>
      </div>
      {ios ? (
        <Share className="hidden size-7 shrink-0 text-sidebar-primary sm:block" aria-hidden />
      ) : (
        <Button
          size="xl"
          className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
          onClick={async () => {
            await deferred?.prompt()
            const choice = await deferred?.userChoice
            if (choice?.outcome === 'accepted') setHidden(true)
            setDeferred(null)
          }}
        >
          <Download data-icon="inline-start" />
          {en.pwa.install}
        </Button>
      )}
      <Button variant="ghost" size="icon-touch" className="absolute end-1 top-1 text-sidebar-foreground hover:bg-sidebar-accent" aria-label={en.pwa.later} onClick={later}>
        <X />
      </Button>
    </section>
  )
}
