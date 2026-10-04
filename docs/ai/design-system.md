# Design system

Everything visual comes from tokens in **`src/styles/theme.css`** — the only file allowed to contain colour values (ESLint enforces it).

## 1. Token layers
1. **Brand palette** (placeholder until the client confirms logo colours): solar amber = primary, deep navy = secondary + sidebar, energy green = success. Rebrand by editing `theme.css` only.
2. **Semantic tokens** (shadcn names) — used by primitives and patterns.
3. **Tones** — 8 status tones: `neutral, brand, info, success, warning, danger, trading, installation`. Each has `--tone-X` (solid), `--tone-X-foreground`, `--tone-X-soft`, `--tone-X-soft-foreground`.

## 2. Semantic tokens → utilities
| Token | Utilities | Use for |
|---|---|---|
| background / foreground | `bg-background text-foreground` | Page and body text |
| card / card-foreground | `bg-card` | Cards, panels |
| popover | `bg-popover` | Menus, sheets |
| primary / primary-foreground | `bg-primary text-primary-foreground` | Main action (amber fill, navy text). Never `text-primary` on light backgrounds |
| secondary | `bg-secondary text-secondary-foreground` | Navy emphasis, active filter chips |
| muted / muted-foreground | `bg-muted text-muted-foreground` | Subtle backgrounds, helper text |
| accent | `bg-accent` | Hover/selected |
| destructive | `text-destructive`, Button `variant="destructive"` | Destructive actions |
| border / input / ring | `border-border ring-ring` | Lines, inputs, focus |
| overlay | `bg-overlay` | Dialog/sheet backdrop |
| sidebar* | `bg-sidebar text-sidebar-foreground` | Desktop navy sidebar |
| chart-1…5 | `fill-chart-1` | Charts |

## 3. Tones
| Tone | Meaning | Examples |
|---|---|---|
| neutral | No judgement | Contacted, Logged, Checked out |
| brand | Amber highlight | Interested, Negotiation, Admin |
| info | Informational / in progress | New, Quotation Sent |
| success | Good | Won, Verified, Checked in |
| warning | Attention soon | Quotation Pending, No Answer, Due soon |
| danger | Bad / overdue | Lost, Flagged, Overdue |
| trading / installation | Departments | Department badges, Site Survey |

Soft (default for badges): `bg-tone-info-soft text-tone-info-soft-foreground`. Solid: `bg-tone-info text-tone-info-foreground`. Icon/text only: `toneTextClass[tone]` from `status-badge.tsx`.

**Never choose a tone in a component.** Tones come from `src/domain/ui-maps.ts` (e.g. `STAGE_META.won.tone`) and render through `StatusBadge`.

## 4. Typography
Inter (`--font-inter` → `font-sans`, `font-heading`) via `next/font/google` in `src/app/layout.tsx`. Scale: `text-xs` meta · `text-sm` dense body · `text-base` mobile forms · `text-xl/2xl` titles · `text-2xl` KPI numbers with `tabular-nums`. Urdu later: add Noto Nastaliq Urdu and `dir="rtl"`; keep using logical classes (`ps-`, `pe-`, `start-`, `end-`, `rtl:rotate-180` on arrows).

## 5. Layout
- Mobile-first: base = phone (360–430 px), `md` 768, `lg` 1024+. Bottom nav below `lg`, sidebar from `lg` (`AppShell`).
- Page padding `px-4 md:px-6`. Radius `--radius` 0.625rem (`rounded-lg`, cards `rounded-xl`, badges `rounded-full`).
- Touch targets ≥ 44 px: `Button size="touch"` (h-11) for primary mobile actions; `min-h-11` for tappable rows/links.

## 6. Dark mode
`.dark` tokens exist in `theme.css`; enable with `class="dark"` on `<html>` (toggle optional, later).

## 7. Guard rails
- ESLint (`npm run lint`) rejects hex/rgb/hsl/oklch literals, Tailwind palette classes and arbitrary colours in `src/**` except `src/styles/**`. If a non-colour string trips it (e.g. `#123`), use `// eslint-disable-next-line no-restricted-syntax -- not a colour`.
- A contrast test checks every text/background token pair is ≥ 4.5:1 in light and dark.
- `components.json` points shadcn at `src/styles/theme.css`, so CSS variables added by `shadcn add` land there — review their values against this palette.

## 8. Do / don't
| Do | Don't |
|---|---|
| `<StageBadge stage={stage} />` | `<span className="bg-green-100 text-green-800">Won</span>` |
| `text-muted-foreground` | `text-gray-500` |
| Add a `cva` variant to the component | Copy a component to recolour it |
| `en.stage.won` | `'Won'` typed in JSX |
