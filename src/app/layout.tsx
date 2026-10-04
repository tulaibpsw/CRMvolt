import type { Metadata, Viewport } from 'next'
import { Manrope, Sora } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ServiceWorker } from '@/components/common/pwa'
import { en } from '@/i18n/en'
import { BRAND_HEX } from '@/styles/brand-colors'
import { themeCss } from '@/styles/runtime-theme'
import { getSetting } from '@/server/services/settings'
import './globals.css'

// Same fonts as voltonsolar.com: Manrope (body) and Sora (headings).
const manrope = Manrope({ variable: '--font-manrope', subsets: ['latin'], display: 'swap' })
const sora = Sora({ variable: '--font-sora', subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  title: { default: en.app.name, template: `%s · ${en.app.name}` },
  description: en.app.tagline,
  applicationName: en.app.name,
  // iPhone: opens like an app from the home screen (no Safari bars).
  appleWebApp: { capable: true, title: en.app.name, statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: BRAND_HEX.ink,
}

/** Admin-chosen brand colours (Settings → Appearance). Never breaks the page if the database is unreachable. */
async function brandCss(): Promise<string> {
  try {
    return themeCss(await getSetting('theme'))
  } catch {
    return ''
  }
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const css = await brandCss()
  return (
    <html lang="en" dir="ltr" className={`${manrope.variable} ${sora.variable} h-full antialiased`}>
      <body className="min-h-full">
        {css ? <style id="brand-theme">{css}</style> : null}
        <TooltipProvider>{children}</TooltipProvider>
        <ServiceWorker />
      </body>
    </html>
  )
}
