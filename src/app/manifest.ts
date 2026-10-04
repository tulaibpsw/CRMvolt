import type { MetadataRoute } from 'next'
import { en } from '@/i18n/en'
import { BRAND_HEX } from '@/styles/brand-colors'

/** Installable app (Android "Install app", iPhone "Add to Home Screen"). Icons: node scripts/make-icons.mjs */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: en.app.name,
    short_name: en.app.name,
    description: en.app.tagline,
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: BRAND_HEX.ink,
    theme_color: BRAND_HEX.ink,
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'My leads', url: '/leads?view=mine' },
      { name: 'Follow-ups', url: '/follow-ups' },
    ],
  }
}
