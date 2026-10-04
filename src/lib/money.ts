import { en } from '@/i18n/en'

const grouping = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const compact = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

/** Integer PKR → "Rs. 1,850,000" (the PDF's format). */
export function formatPkr(amount: number): string {
  return `${en.money.prefix} ${grouping.format(Math.round(amount))}`
}

/** For KPI tiles: 6,500,000 → "Rs. 65 lakh", 15,000,000 → "Rs. 1.5 crore". */
export function formatPkrCompact(amount: number): string {
  const rounded = Math.round(amount)
  if (Math.abs(rounded) >= 10_000_000) return `${en.money.prefix} ${compact.format(rounded / 10_000_000)} ${en.money.crore}`
  if (Math.abs(rounded) >= 100_000) return `${en.money.prefix} ${compact.format(rounded / 100_000)} ${en.money.lakh}`
  return formatPkr(rounded)
}
