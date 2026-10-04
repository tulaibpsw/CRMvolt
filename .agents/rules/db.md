---
trigger: glob
globs: "src/domain/**/*.ts, src/server/**/*.ts, scripts/*.ts"
---

Before editing schema or server code, read `docs/ai/schema.md` and `docs/ai/architecture.md` (use the `new-model` skill).
- Enums only from `src/domain/constants.ts`; model + Zod schema + indexes + docs change together.
- Phones E.164 via `src/lib/phone.ts`; UTC storage, PKT display via `src/lib/dates-pkt.ts`; money as integer PKR.
- Soft delete (`deletedAt`), `createdBy`/`updatedBy`, multi-document changes in `withTransaction`, every query through `scopeFilter`.
