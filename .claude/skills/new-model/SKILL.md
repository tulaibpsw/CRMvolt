---
name: new-model
description: Use before adding or changing a MongoDB collection, field, enum or index in Volt On CRM. Keeps constants, Mongoose model, Zod schema, indexes, docs, seed and tests in sync.
---

# New or changed model / enum

1. **Enums first:** add values to `src/domain/constants.ts` (array `as const` + union type; a typed `DEFAULT_*` if the model needs a default). Classify every new array in `src/domain/ui-maps.ts` — a UI map (label + tone + icon), label-only (labels in `src/i18n/en.ts`), or `INTERNAL_ENUMS`.
2. **Model:** edit `src/server/db/models/{org,leads,system}.ts`.
   - `enum: CONSTANT_ARRAY`, `timestamps: true`; `auditFields` + `softDelete` plugins for business records; `insertOnly` for logs.
   - Phones validated with `isE164`; money as integer `…Pkr`; dates as `Date` (UTC).
   - Declare indexes in the schema. Unique-but-optional fields use a partial index with `{ $type: 'string' }` (sparse still collides on null).
   - New model → add it to `ALL_MODELS` in `src/server/db/models/index.ts`.
3. **Input validation:** add/extend the Zod schema in `src/domain/schemas/index.ts` (use `z.enum(CONSTANT)`, `phoneInput`, `objectId`).
4. **View model:** if the UI shows it, add/extend a type in `src/domain/view-models.ts`.
5. **Docs:** update the collection table (and ERD if relations change) in `docs/ai/schema.md`.
6. **Seed:** update `src/server/db/seed/build-seed.ts` so demo data covers the new field.
7. **When the phase is done:** DB tests in `tests/db` (validation, unique/partial indexes) and `npm run check`. On a real database run `npm run db:indexes`.
