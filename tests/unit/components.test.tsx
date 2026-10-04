/** @vitest-environment jsdom */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StatusBadge } from '@/components/common/status-badge'
import { KpiTile } from '@/components/common/kpi-tile'
import { DataTable, type Column } from '@/components/common/data-table'
import { AppShell } from '@/components/common/app-shell'
import { StageBadge, ProofChip } from '@/components/crm/badges'
import { LeadCard } from '@/components/crm/lead-card'
import { AttemptCard } from '@/components/crm/attempt-card'
import { KpiGrid } from '@/components/crm/kpi-grid'
import { MessageBubble } from '@/components/crm/message-bubble'
import { CheckInCard } from '@/components/crm/check-in-card'
import { makeFixtures } from '@/dev/fixtures'

vi.mock('next/navigation', () => ({ usePathname: () => '/leads/123' }))

const fx = makeFixtures(new Date('2026-10-04T05:00:00Z'))

describe('StatusBadge', () => {
  it('renders soft tone token classes by default and solid on request', () => {
    const { rerender } = render(<StatusBadge label="Won" tone="success" />)
    expect(screen.getByText('Won').parentElement).toHaveClass('bg-tone-success-soft', 'text-tone-success-soft-foreground')
    rerender(<StatusBadge label="Won" tone="success" variant="solid" />)
    expect(screen.getByText('Won').parentElement).toHaveClass('bg-tone-success', 'text-tone-success-foreground')
  })

  it('crm badges take label and tone from ui-maps', () => {
    render(<StageBadge stage="quotation_sent" />)
    expect(screen.getByText('Quotation Sent').parentElement).toHaveAttribute('data-tone', 'info')
  })

  it('ProofChip lists flags', () => {
    render(<ProofChip status="flagged" flags={['too_fast']} />)
    expect(screen.getByText('Flagged')).toBeInTheDocument()
    expect(screen.getByText('Too fast')).toBeInTheDocument()
  })
})

describe('KpiTile / KpiGrid', () => {
  it('shows "Phase n" for modules not built yet and the PDF labels', () => {
    render(<KpiTile label="Commission" value={0} comingIn={4} />)
    expect(screen.getByText('Phase 4')).toBeInTheDocument()
    render(<KpiGrid items={fx.kpis} />)
    expect(screen.getByText('Called / Not Called')).toBeInTheDocument()
  })
})

describe('DataTable', () => {
  const columns: Column<(typeof fx.leads)[number]>[] = [
    { key: 'name', header: 'Name', sortable: true, cell: (l) => l.name },
    { key: 'attempts', header: 'Attempts', cell: (l) => l.attemptCount },
  ]
  it('renders rows and URL sort links with aria-sort', () => {
    render(<DataTable columns={columns} rows={fx.leads} getRowKey={(l) => l.id} sort={{ key: 'name', direction: 'asc' }} sortHref={(k, d) => `/leads?sort=${k}&dir=${d}`} />)
    expect(screen.getByText('Muhammad Bilal')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sort by Name' })).toHaveAttribute('href', '/leads?sort=name&dir=desc')
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'ascending')
  })
  it('shows the empty state with no rows', () => {
    render(<DataTable columns={columns} rows={[]} getRowKey={(l) => l.id} />)
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
  })
})

describe('CRM cards', () => {
  it('LeadCard shows name, attempts, badges and masks the phone when asked', () => {
    render(<LeadCard lead={fx.leads[2]} />)
    expect(screen.getByText('Faisal Traders')).toBeInTheDocument()
    expect(screen.getByText('Attempt 3/3')).toBeInTheDocument()
    expect(screen.getByText(/0333 •••• 212/)).toBeInTheDocument()
  })

  it('AttemptCard shows the proof trail and flags', () => {
    render(<AttemptCard attempt={fx.attempts[0]} />)
    expect(screen.getByText('Verified')).toBeInTheDocument()
    expect(screen.getByText(/Away 3m 54s/)).toBeInTheDocument()
  })

  it('MessageBubble labels phone-app messages', () => {
    render(<MessageBubble message={fx.messages[1]} />)
    expect(screen.getByText(/via phone app/)).toBeInTheDocument()
  })

  it('CheckInCard disables buttons without actions', () => {
    render(<CheckInCard status="checked_out" />)
    expect(screen.getByRole('button', { name: 'Check in' })).toBeDisabled()
  })
})

describe('AppShell', () => {
  it('shows role-filtered navigation and marks the active section', () => {
    render(
      <AppShell role="agent" userName="Ahmed Raza">
        <p>content</p>
      </AppShell>,
    )
    const bottomNav = screen.getByRole('navigation', { name: 'Quick navigation' })
    expect(within(bottomNav).getByRole('link', { name: 'Leads' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  })
})
