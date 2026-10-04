import { Schema, model, models, type Model } from 'mongoose'

/** createdBy / updatedBy on important records (PDF §22). null = the system did it. */
export function auditFields(schema: Schema): void {
  schema.add({
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  })
}

/** No hard deletes: services filter `{ deletedAt: null }`; admins can restore. */
export function softDelete(schema: Schema): void {
  schema.add({ deletedAt: { type: Date, default: null } })
}

const MUTATIONS = ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndReplace'] as const

/** Append-only collections (activities, audit logs): block every update/delete at the ODM level. */
export function insertOnly(schema: Schema, name: string): void {
  for (const op of MUTATIONS) {
    schema.pre(op, function () {
      throw new Error(`${name} is insert-only — ${op} is not allowed`)
    })
  }
}

/** Reuse the compiled model across hot reloads. */
export function defineModel<T>(name: string, schema: Schema<T>): Model<T> {
  return (models[name] as Model<T> | undefined) ?? model<T>(name, schema)
}
