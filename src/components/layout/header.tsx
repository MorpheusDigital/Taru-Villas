'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { PropertySwitcher } from '@/components/layout/property-switcher'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map route segments to human-readable labels */
const segmentLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  surveys: 'Surveys',
  settings: 'Settings',
  properties: 'Properties',
  admin: 'Admin',
  templates: 'Templates',
  users: 'Users',
  new: 'New',
  edit: 'Edit',
  sops: 'SOPs',
  tasks: 'Tasks',
  excursions: 'Excursions',
  menus: 'Menus',
  'allowed-emails': 'Allowed Emails',
  utilities: 'Utilities',
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
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      {/* Left side: sidebar trigger + breadcrumbs */}
      <div className="flex flex-1 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 !h-4" />

        {breadcrumbs.length > 0 ? (
          <nav className="flex items-center gap-1 text-sm">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1
              return (
                <div key={crumb.href} className="flex items-center gap-1">
                  {index > 0 && (
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  )}
                  {isLast ? (
                    <span className="font-medium text-foreground">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      href={crumb.href}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </div>
              )
            })}
          </nav>
        ) : (
          <h1 className="text-sm font-medium">{pageTitle}</h1>
        )}
      </div>

      {/* Right side: property switcher */}
      <div className="flex items-center gap-2">
        <PropertySwitcher />
      </div>
    </header>
  )
}
