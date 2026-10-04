import { KpiTile } from '@/components/common/kpi-tile'
import type { KpiItem } from '@/domain/view-models'
import { en } from '@/i18n/en'

/** Dashboard KPI tiles with the PDF's exact labels (§4, §8). */
export function KpiGrid({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <KpiTile key={item.key} label={en.kpi[item.key]} value={item.value} hint={item.hint} comingIn={item.comingIn} />
      ))}
    </div>
  )
}
