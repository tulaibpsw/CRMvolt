/**
 * Admin-editable brand colours (Settings → Appearance). Lives in src/styles because it holds raw colour values.
 * Only TWO colours are editable — brand (buttons, highlights) and ink (sidebar, dark buttons, text) — and every
 * text colour on top of them is computed for contrast, so an admin cannot make the app unreadable.
 */
import { formatCss, formatHex, interpolate, oklch, parse, wcagContrast } from 'culori'
import { BRAND_HEX } from '@/styles/brand-colors'

export interface ThemeColors {
  brand: string
  ink: string
}

export const DEFAULT_THEME: ThemeColors = { brand: BRAND_HEX.gold, ink: BRAND_HEX.ink }

export const THEME_PRESETS: { id: string; name: string; colors: ThemeColors }[] = [
  { id: 'volton', name: 'Volton (gold + navy)', colors: DEFAULT_THEME },
  { id: 'solar-green', name: 'Solar green', colors: { brand: '#2da772', ink: '#0f2a22' } },
  { id: 'sky', name: 'Sky blue', colors: { brand: '#3b82f6', ink: '#0f1e3a' } },
  { id: 'sunset', name: 'Sunset orange', colors: { brand: '#f97316', ink: '#2a1408' } },
  { id: 'royal', name: 'Royal purple', colors: { brand: '#8b5cf6', ink: '#1e1238' } },
]

const WHITE = '#ffffff'

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

/** Text colour (ink or white) with the better contrast on the given background. */
function onColor(bg: string, ink: string): string {
  return wcagContrast(bg, ink) >= wcagContrast(bg, WHITE) ? ink : WHITE
}

const css = (hex: string) => formatCss(oklch(parse(hex)!)!)
const mix = (a: string, b: string, t: number) => formatHex(interpolate([a, b])(t))

/** CSS that overrides the brand tokens of theme.css. Empty string = default theme. */
export function themeCss(input: Partial<ThemeColors> | null | undefined): string {
  const brand = isHexColor(input?.brand) ? input!.brand : DEFAULT_THEME.brand
  const ink = isHexColor(input?.ink) ? input!.ink : DEFAULT_THEME.ink
  if (brand.toLowerCase() === DEFAULT_THEME.brand && ink.toLowerCase() === DEFAULT_THEME.ink) return ''
  const inkLight = mix(ink, WHITE, 0.12)
  const brandSoft = mix(brand, WHITE, 0.88)
  // Darken the brand until it is readable as text on its soft background.
  let brandText = brand
  for (let t = 0.1; t <= 0.9 && wcagContrast(brandText, brandSoft) < 4.5; t += 0.1) brandText = mix(brand, ink, t)
  const vars: Record<string, string> = {
    '--primary': css(brand),
    '--primary-foreground': css(onColor(brand, ink)),
    '--ring': css(brand),
    '--chart-1': css(brand),
    '--accent': css(brandSoft),
    '--accent-foreground': css(brandText),
    '--secondary': css(inkLight),
    '--secondary-foreground': css(onColor(inkLight, ink)),
    '--chart-2': css(inkLight),
    '--sidebar': css(ink),
    '--sidebar-foreground': css(onColor(ink, ink) === WHITE ? mix(WHITE, ink, 0.06) : ink),
    '--sidebar-primary': css(brand),
    '--sidebar-primary-foreground': css(onColor(brand, ink)),
    '--sidebar-accent': css(inkLight),
    '--sidebar-accent-foreground': css(onColor(inkLight, ink)),
    '--sidebar-border': css(inkLight),
    '--sidebar-ring': css(brand),
    '--tone-brand': css(brand),
    '--tone-brand-foreground': css(onColor(brand, ink)),
    '--tone-brand-soft': css(brandSoft),
    '--tone-brand-soft-foreground': css(brandText),
  }
  return `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}`
}
