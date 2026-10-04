import { readFileSync } from 'node:fs'
import { wcagContrast } from 'culori'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'
import { TONES } from '@/domain/constants'

const css = readFileSync('src/styles/theme.css', 'utf8')

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  const body = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

const PAIRS: [string, string][] = [
  ['background', 'foreground'],
  ['card', 'card-foreground'],
  ['popover', 'popover-foreground'],
  ['primary', 'primary-foreground'],
  ['secondary', 'secondary-foreground'],
  ['muted', 'muted-foreground'],
  ['card', 'muted-foreground'],
  ['accent', 'accent-foreground'],
  ['destructive', 'destructive-foreground'],
  ['card', 'destructive'],
  ['sidebar', 'sidebar-foreground'],
  ['sidebar-primary', 'sidebar-primary-foreground'],
  ['sidebar-accent', 'sidebar-accent-foreground'],
  ...TONES.flatMap((t): [string, string][] => [
    [`tone-${t}`, `tone-${t}-foreground`],
    [`tone-${t}-soft`, `tone-${t}-soft-foreground`],
  ]),
]

describe.each([
  ['light', tokens(':root')],
  ['dark', tokens('.dark')],
])('%s theme contrast (WCAG AA)', (_, t) => {
  it.each(PAIRS)('%s / %s ≥ 4.5:1', (bg, fg) => {
    expect(t[bg], `missing --${bg}`).toBeDefined()
    expect(t[fg], `missing --${fg}`).toBeDefined()
    expect(wcagContrast(t[bg], t[fg])).toBeGreaterThanOrEqual(4.5)
  })
})

describe('every tone token is exposed to Tailwind', () => {
  it.each(TONES)('%s', (tone) => {
    for (const suffix of ['', '-foreground', '-soft', '-soft-foreground']) {
      expect(css).toContain(`--color-tone-${tone}${suffix}: var(--tone-${tone}${suffix});`)
    }
  })
})

describe('colour lint rule', () => {
  const eslint = new ESLint({ cwd: process.cwd() })
  const lint = async (code: string, filePath = 'src/components/common/__probe__.tsx') => {
    const [result] = await eslint.lintText(code, { filePath })
    return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax')
  }

  it('flags Tailwind palette classes, hex values and arbitrary colours', async () => {
    expect(await lint('export const A = () => <span className="bg-red-500">x</span>')).toHaveLength(1)
    expect(await lint('export const B = () => <div className="bg-black/10" />')).toHaveLength(1)
    expect(await lint("export const c = '#ff0000'")).toHaveLength(1)
    expect(await lint('export const D = () => <div className="bg-[#123456]" />')).toHaveLength(1)
    expect(await lint('export const e = `text-${"x"} oklch(0.5 0.1 20)`')).toHaveLength(1)
  })

  it('allows token utilities', async () => {
    expect(await lint('export const A = () => <span className="bg-primary text-tone-info-soft-foreground bg-background/95 ring-foreground/10">x</span>')).toHaveLength(0)
  })

  it('does not apply inside src/styles', async () => {
    expect(await lint("export const c = '#ff0000'", 'src/styles/probe.ts')).toHaveLength(0)
  })
})
