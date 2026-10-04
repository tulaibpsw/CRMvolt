---
trigger: glob
globs: "src/components/**/*.tsx, src/app/**/*.tsx, src/styles/**/*.css"
---

Before editing UI code, read `docs/ai/design-system.md` and `docs/ai/components.md` (use the `new-component` skill).
- Colours only via theme tokens — no hex/rgb/oklch, no Tailwind palette classes; status colours only via `src/domain/ui-maps.ts` + `StatusBadge`.
- Reuse registry components; extend with `cva` variants; register new components and show them in `/dev/ui`.
- Text from `src/i18n/en.ts`; icons from lucide-react; mobile-first, touch targets ≥ 44 px.
