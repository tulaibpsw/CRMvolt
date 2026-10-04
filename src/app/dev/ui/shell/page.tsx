import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { AppShell } from '@/components/common/app-shell'
import { PageHeader } from '@/components/common/page-header'
import { KpiGrid } from '@/components/crm/kpi-grid'
import { LeadCard } from '@/components/crm/lead-card'
import { CheckInCard } from '@/components/crm/check-in-card'
import { ROLES, type Role } from '@/domain/constants'
import { makeFixtures } from '@/dev/fixtures'
import { en } from '@/i18n/en'
import { isCatalogEnabled } from '@/lib/env'

export const metadata = { title: en.catalog.shell }

export default async function ShellPreviewPage(props: PageProps<'/dev/ui/shell'>) {
  await connection()
  if (!isCatalogEnabled()) notFound()
  const { role: roleParam } = await props.searchParams
  const role: Role = ROLES.find((r) => r === roleParam) ?? 'agent'
  const fx = makeFixtures(new Date())

  return (
    <AppShell role={role} userName={role === 'agent' ? 'Ahmed Raza' : role === 'manager' ? 'Bilal Ahmed' : 'Admin'}>
      <div className="space-y-6 px-4 py-6 md:px-6">
        <PageHeader title={en.nav.dashboard} description={en.catalog.shell} backHref="/dev/ui" />
        {role === 'agent' ? <CheckInCard status="checked_in" since={fx.team[0].since} /> : null}
        <KpiGrid items={fx.kpis.slice(0, role === 'agent' ? 4 : 11)} />
        <div className="grid gap-3 md:grid-cols-2">
          {fx.leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} href="/dev/ui" showAgent={role !== 'agent'} />
          ))}
        </div>
      </div>
    </AppShell>
  )
}
