import Image from 'next/image'
import { en } from '@/i18n/en'
import { cn } from '@/lib/utils'

const LOGO = { src: '/brand/volton-logo.png', width: 1229, height: 368 } as const

export interface BrandLogoProps {
  /** Rendered height in px; width follows the logo's aspect ratio. */
  height?: number
  /**
   * The logo is white text + yellow bolt, so it needs a dark surface.
   * `bare` = already on a dark surface (navy sidebar). `tile` = adds a navy tile for light surfaces.
   */
  surface?: 'bare' | 'tile'
  priority?: boolean
  className?: string
}

export function BrandLogo({ height = 28, surface = 'bare', priority, className }: BrandLogoProps) {
  const image = (
    <Image
      src={LOGO.src}
      alt={en.app.logoAlt}
      width={Math.round((height * LOGO.width) / LOGO.height)}
      height={height}
      priority={priority}
    />
  )
  if (surface === 'bare') return <span className={cn('inline-flex shrink-0', className)}>{image}</span>
  return <span className={cn('inline-flex shrink-0 rounded-lg bg-sidebar px-2.5 py-1.5', className)}>{image}</span>
}
