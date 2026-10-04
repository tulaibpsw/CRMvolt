import { Building2, CalendarClock, LayoutDashboard, List, MapPin, Settings, ShieldCheck, SquareKanban, Users, type LucideIcon } from 'lucide-react'
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
  { href: '/dashboard', label: en.nav.dashboard, icon: LayoutDashboard, roles: ['super_admin', 'admin', 'manager', 'agent', 'field_agent'], mobile: true },
  { href: '/leads', label: en.nav.leads, icon: List, roles: ['super_admin', 'admin', 'manager', 'agent'], mobile: true },
  { href: '/follow-ups', label: en.nav.followUps, icon: CalendarClock, roles: ['manager', 'agent'], mobile: true },
  { href: '/visits', label: en.nav.visits, icon: MapPin, roles: ['super_admin', 'admin', 'manager', 'field_agent'], mobile: true },
  { href: '/pipeline', label: en.nav.pipeline, icon: SquareKanban, roles: ['super_admin', 'admin', 'manager'], mobile: true },
  { href: '/team', label: en.nav.team, icon: Users, roles: ['super_admin', 'admin', 'manager'], mobile: false },
  { href: '/review', label: en.nav.review, icon: ShieldCheck, roles: ['super_admin', 'admin', 'manager'], mobile: false },
  { href: '/settings', label: en.nav.settings, icon: Settings, roles: ['super_admin', 'admin', 'manager'], mobile: false },
  { href: '/admin', label: en.nav.admin, icon: Building2, roles: ['super_admin', 'admin'], mobile: false },
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
