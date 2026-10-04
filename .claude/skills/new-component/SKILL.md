---
name: new-component
description: Use before creating or changing any UI component in Volt On CRM. Ensures reuse from the registry, theme tokens only, the right layer, and registration in docs/ai/components.md and the /dev/ui catalog.
---

# New or changed component

1. **Search first.** Read `docs/ai/components.md`. If something close exists, extend it with a `cva` variant or a prop — never copy it.
2. **Pick the layer:**
   - `src/components/ui` — shadcn primitive: `npx shadcn@latest add <name> -y`, then `npm run lint` and replace any palette colour with a token.
   - `src/components/common` — domain-agnostic pattern (no CRM types).
   - `src/components/crm` — takes view models from `src/domain/view-models.ts`.
   A layer imports only from layers to its left (ui ← common ← crm).
3. **Rules while building:**
   - Colours only via tokens (`bg-card`, `text-muted-foreground`, `bg-tone-*`); status colours only via `src/domain/ui-maps.ts` + `StatusBadge`.
   - Text only from `src/i18n/en.ts` (add keys there).
   - Server Component unless it needs state/effects/browser APIs. Props must be serialisable when crossing to a client component.
   - Mobile-first; touch targets ≥ 44 px (`size="touch"`, `min-h-11`); lucide icons; logical spacing (`ps-`/`pe-`/`start-`/`end-`).
   - Handle loading / empty / error where relevant; label inputs and icon buttons (`aria-label`).
4. **Register it:** add a row to `docs/ai/components.md` (file, props, when to use) and render it in `src/app/dev/ui/page.tsx` in every state (add demo data to `src/dev/fixtures.ts`).
5. **Check:** `npm run lint` and `npx tsc --noEmit`; open `/dev/ui` at 390 px and 1280 px.
