import type { Metadata } from 'next'
import { Manrope, Sora } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import { en } from '@/i18n/en'
import './globals.css'

// Same fonts as voltonsolar.com: Manrope (body) and Sora (headings).
const manrope = Manrope({ variable: '--font-manrope', subsets: ['latin'], display: 'swap' })
const sora = Sora({ variable: '--font-sora', subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  title: { default: en.app.name, template: `%s · ${en.app.name}` },
  description: en.app.tagline,
  applicationName: en.app.name,
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" dir="ltr" className={`${manrope.variable} ${sora.variable} h-full antialiased`}>
      <body className="min-h-full">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
