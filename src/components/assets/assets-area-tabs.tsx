'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { useAuth } from '@/components/providers/auth-provider'

interface Tab {
  label: string
  href: string
  match: (pathname: string) => boolean
  roles?: string[]
}

const tabs: Tab[] = [
  {
    label: 'Dashboard',
    href: '/assets/dashboard',
    match: (p) => p.startsWith('/assets/dashboard'),
    roles: ['admin', 'property_manager'],
  },
  {
    label: 'Directory',
    href: '/assets/directory',
    match: (p) => p.startsWith('/assets/directory'),
  },
  {
    label: 'Rooms',
    href: '/assets/rooms',
    match: (p) => p.startsWith('/assets/rooms'),
    roles: ['admin', 'property_manager'],
  },
  {
    label: 'Scan',
    href: '/assets/scan',
    match: (p) => p.startsWith('/assets/scan'),
  },
]

export function AssetsAreaTabs() {
  const pathname = usePathname()
  const { profile } = useAuth()

  const visibleTabs = tabs.filter((t) => !t.roles || t.roles.includes(profile.role))
  if (visibleTabs.length <= 1) return null

  return (
    <nav
      aria-label="Asset registry sections"
      className="inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-[3px] text-muted-foreground"
    >
      {visibleTabs.map((tab) => {
        const active = tab.match(pathname)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-foreground/60 hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
