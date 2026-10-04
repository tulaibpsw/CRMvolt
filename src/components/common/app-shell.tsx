'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { StatusBadge } from '@/components/common/status-badge'
import type { Role } from '@/domain/constants'
import { isActivePath, mobileNavItemsFor, navItemsFor, type NavItem } from '@/domain/navigation'
import { ROLE_META } from '@/domain/ui-maps'
import { en } from '@/i18n/en'
import { cn } from '@/lib/utils'

export interface AppShellProps {
  role: Role
  userName: string
  children: React.ReactNode
}

/** Signed-in layout: navy sidebar on desktop (lg+), top bar + bottom nav on phones. */
export function AppShell({ role, userName, children }: AppShellProps) {
  const pathname = usePathname()
  const items = navItemsFor(role)
  const mobileItems = mobileNavItemsFor(role)

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <Brand className="h-16 px-5 text-lg" iconClassName="text-sidebar-primary" />
        <nav aria-label={en.nav.main} className="flex flex-1 flex-col gap-1 px-3">
          {items.map((item) => (
            <SideLink key={item.href} item={item} active={isActivePath(pathname, item.href)} />
          ))}
        </nav>
        <UserBlock role={role} userName={userName} className="border-t border-sidebar-border px-5 py-4" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
          <Brand className="text-base" iconClassName="text-tone-brand" />
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-lg" aria-label={en.common.menu}>
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-sidebar text-sidebar-foreground">
              <SheetHeader>
                <SheetTitle className="text-sidebar-foreground">{en.app.name}</SheetTitle>
              </SheetHeader>
              <nav aria-label={en.nav.main} className="flex flex-col gap-1 px-3">
                {items.map((item) => (
                  <SideLink key={item.href} item={item} active={isActivePath(pathname, item.href)} />
                ))}
              </nav>
              <UserBlock role={role} userName={userName} className="mt-auto border-t border-sidebar-border px-5 py-4" />
            </SheetContent>
          </Sheet>
        </header>

        <main className="flex-1 pb-20 lg:pb-0">{children}</main>

        <nav aria-label={en.nav.mobile} className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
          {mobileItems.map((item) => {
            const active = isActivePath(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn('flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium', active ? 'text-foreground' : 'text-muted-foreground')}
              >
                <item.icon className={cn('size-5', active && 'text-tone-brand')} aria-hidden />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

function Brand({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <span className={cn('flex items-center gap-2 font-heading font-semibold', className)}>
      <Sun className={cn('size-6', iconClassName)} aria-hidden />
      {en.app.name}
    </span>
  )
}

function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
        active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/60',
      )}
    >
      <item.icon className={cn('size-5', active && 'text-sidebar-primary')} aria-hidden />
      {item.label}
    </Link>
  )
}

function UserBlock({ role, userName, className }: { role: Role; userName: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-2 text-sm', className)}>
      <span className="truncate font-medium">{userName}</span>
      <StatusBadge {...ROLE_META[role]} size="sm" />
    </div>
  )
}
