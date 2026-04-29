'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { useAuth } from '@/components/providers/auth-provider'

interface Tab {
  label: string
  href: string
  match: (pathname: string) => boolean
  roles: readonly ('admin' | 'property_manager' | 'staff')[]
}

const tabs: Tab[] = [
  {
    label: 'My Checklists',
    href: '/sops',
    match: (p) => p === '/sops',
    roles: ['admin', 'property_manager', 'staff'],
  },
  {
    label: 'Progress',
    href: '/sops/dashboard',
    match: (p) => p.startsWith('/sops/dashboard'),
    roles: ['admin', 'property_manager'],
  },
  {
    label: 'Templates',
    href: '/sops/templates',
    match: (p) => p.startsWith('/sops/templates'),
    roles: ['admin'],
  },
  {
    label: 'Categories',
    href: '/sops/categories',
    match: (p) => p.startsWith('/sops/categories'),
    roles: ['admin'],
  },
]

export function SopsAreaTabs() {
  const pathname = usePathname()
  const { profile } = useAuth()

  const visibleTabs = tabs.filter((t) => t.roles.includes(profile.role))
  if (visibleTabs.length <= 1) return null

  return (
    <nav
      aria-label="SOP sections"
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
