import { CalendarClock, LayoutDashboard, List, Settings, ShieldCheck, SquareKanban, Users, type LucideIcon } from 'lucide-react'
import type { Role } from '@/domain/constants'
import { en } from '@/i18n/en'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  roles: readonly Role[]
  /** Shown in the phone bottom bar (max 4 per role). */
  mobile: boolean
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', label: en.nav.dashboard, icon: LayoutDashboard, roles: ['admin', 'manager', 'agent'], mobile: true },
  { href: '/leads', label: en.nav.leads, icon: List, roles: ['admin', 'manager', 'agent'], mobile: true },
  { href: '/follow-ups', label: en.nav.followUps, icon: CalendarClock, roles: ['manager', 'agent'], mobile: true },
  { href: '/pipeline', label: en.nav.pipeline, icon: SquareKanban, roles: ['admin', 'manager'], mobile: true },
  { href: '/team', label: en.nav.team, icon: Users, roles: ['admin', 'manager'], mobile: false },
  { href: '/review', label: en.nav.review, icon: ShieldCheck, roles: ['admin', 'manager'], mobile: false },
  { href: '/settings', label: en.nav.settings, icon: Settings, roles: ['admin'], mobile: false },
]

export function navItemsFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role))
}

export function mobileNavItemsFor(role: Role): NavItem[] {
  return navItemsFor(role)
    .filter((item) => item.mobile)
    .slice(0, 4)
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
