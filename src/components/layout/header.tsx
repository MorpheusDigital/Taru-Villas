'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { PropertySwitcher } from '@/components/layout/property-switcher'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map route segments to human-readable labels */
const segmentLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  surveys: 'Surveys',
  settings: 'Settings',
  properties: 'Properties',
  admin: 'Setup',
  templates: 'Templates',
  users: 'Users',
  new: 'New',
  edit: 'Edit',
  sops: 'SOPs',
  issues: 'Issues',
  excursions: 'Excursions',
  menus: 'Menus',
  'allowed-emails': 'Allowed Emails',
  utilities: 'Utilities',
  waste: 'Daily Wastage',
  'daily-records': 'Daily Records',
  'guest-profiles': 'Guest Profiles',
  tasks: 'Task Manager',
  teams: 'Teams',
  fleet: 'Fleet',
  dispatch: 'Dispatch',
  vehicles: 'Vehicles',
  drivers: 'Drivers',
  distances: 'Distances',
  rostering: 'Rostering',
  approvals: 'Approvals',
  setup: 'Setup',
}

function getPageTitle(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return 'Dashboard'

  // Use the last meaningful segment as the page title
  const lastSegment = segments[segments.length - 1]

  // If the last segment is a UUID-like string, use the second-to-last
  if (/^[0-9a-f-]{36}$/.test(lastSegment) && segments.length > 1) {
    return segmentLabels[segments[segments.length - 2]] ?? 'Details'
  }

  return segmentLabels[lastSegment] ?? formatSegment(lastSegment)
}

function formatSegment(segment: string): string {
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

interface Breadcrumb {
  label: string
  href: string
}

function getBreadcrumbs(pathname: string): Breadcrumb[] {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length <= 1) return []

  const crumbs: Breadcrumb[] = []
  let currentPath = ''

  for (const segment of segments) {
    currentPath += `/${segment}`
    const label =
      /^[0-9a-f-]{36}$/.test(segment)
        ? 'Details'
        : segmentLabels[segment] ?? formatSegment(segment)

    crumbs.push({ label, href: currentPath })
  }

  return crumbs
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Header() {
  const pathname = usePathname()
  const pageTitle = getPageTitle(pathname)
  const breadcrumbs = getBreadcrumbs(pathname)

  return (
    <header className="glass sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 px-3 sm:px-4">
      {/* Left side: sidebar trigger + breadcrumbs */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SidebarTrigger className="-ml-1 shrink-0" />
        <Separator orientation="vertical" className="mr-1 !h-4 shrink-0 sm:mr-2" />

        {breadcrumbs.length > 0 ? (
          <nav className="flex min-w-0 items-center gap-1 text-sm">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1
              return (
                <div
                  key={crumb.href}
                  className={cn(
                    'items-center gap-1',
                    // On mobile only the current (last) crumb shows — the
                    // full trail appears from sm up. Keeps the header from
                    // overflowing on narrow screens.
                    isLast ? 'flex min-w-0' : 'hidden sm:flex'
                  )}
                >
                  {index > 0 && (
                    <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground sm:block" />
                  )}
                  {isLast ? (
                    <span className="truncate font-medium text-foreground">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      href={crumb.href}
                      className="whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </div>
              )
            })}
          </nav>
        ) : (
          <h1 className="truncate text-sm font-medium">{pageTitle}</h1>
        )}
      </div>

      {/* Right side: property switcher */}
      <div className="flex shrink-0 items-center gap-2">
        <PropertySwitcher />
      </div>
    </header>
  )
}
