/** Counter names used with the `counters` collection. */
export const COUNTERS = { lead: 'lead', quotation: 'quotation', sale: 'sale' } as const

/** 1 → "VL-00001" */
export function formatLeadNo(seq: number): string {
  return `VL-${String(seq).padStart(5, '0')}`
}

/** 1025 → "VO-1025" (PDF §15 quotation style) */
export function formatQuotationNo(seq: number): string {
  return `VO-${seq}`
}
