'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  ClipboardCheck,
  Settings,
  Building2,
  Users,
  LogOut,
  ChevronsUpDown,
  ListTodo,
  Compass,
  UtensilsCrossed,
  ListChecks,
  ShieldCheck,
  ClipboardList,
  UserCheck,
  Package,
  CalendarClock,
  CalendarDays,
} from 'lucide-react'

import { useAuth } from '@/components/providers/auth-provider'
import { getFleetNavigationItems } from '@/lib/fleet/navigation'
import { createClient } from '@/lib/supabase/client'
import { isPathEnabled, type ClientModule } from '@/lib/client-release/modules'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ---------------------------------------------------------------------------
// Navigation configuration
// ---------------------------------------------------------------------------

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  module: ClientModule
}

const mainNavItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { title: 'Surveys', href: '/surveys', icon: ClipboardCheck, module: 'surveys' },
  { title: 'Task Manager', href: '/tasks', icon: ListTodo, module: 'tasks' },
  { title: 'My Roster', href: '/my-roster', icon: CalendarDays, module: 'rostering' },
  { title: 'Rostering', href: '/rostering', icon: CalendarClock, module: 'rostering' },
  { title: 'SOPs', href: '/sops', icon: ListChecks, module: 'sops' },
  { title: 'Daily Records', href: '/daily-records', icon: ClipboardList, module: 'daily-records' },
  { title: 'Asset Registry', href: '/assets', icon: Package, module: 'assets' },
  { title: 'Settings', href: '/settings', icon: Settings, module: 'settings' },
]

const propertyNavItems: NavItem[] = [
  { title: 'Excursions', href: '/excursions', icon: Compass, module: 'excursions' },
  { title: 'Menus', href: '/menus', icon: UtensilsCrossed, module: 'menus' },
  { title: 'Guest Profiles', href: '/guest-profiles', icon: UserCheck, module: 'guest-profiles' },
]

const adminNavItems: NavItem[] = [
  { title: 'Property Settings', href: '/admin/properties', icon: Building2, module: 'core' },
  { title: 'Users', href: '/admin/users', icon: Users, module: 'core' },
  { title: 'Allowed Emails', href: '/admin/allowed-emails', icon: ShieldCheck, module: 'allowed-emails' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatRole(role: string): string {
  return role
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, enabledModules } = useAuth()
  const { setOpenMobile } = useSidebar()

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    if (href === '/sops') {
      return pathname === '/sops'
    }
    if (href === '/fleet') {
      return pathname === '/fleet'
    }
    return pathname.startsWith(href)
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const showPropertySection =
    profile.role === 'property_manager' || profile.role === 'admin'
  const showAdminSection = profile.role === 'admin'

  const isFleetAdmin = profile.isFleetAdmin || profile.role === 'admin'
  const canSeeFleet = profile.canBookFleet || isFleetAdmin
  const enabledSet = new Set(enabledModules)
  const fleetNavItems = isPathEnabled('/fleet', enabledSet)
    ? getFleetNavigationItems(canSeeFleet, isFleetAdmin)
    : []

  const visibleMainNavItems = mainNavItems.filter((item) => {
    if (!isPathEnabled(item.href, enabledSet)) return false
    if (item.href === '/dashboard') return showAdminSection
    if (item.href === '/rostering') return showPropertySection
    return true
  })
  const visiblePropertyNavItems = propertyNavItems.filter(
    (item) => isPathEnabled(item.href, enabledSet)
  )
  const visibleAdminNavItems = adminNavItems.filter(
    (item) => isPathEnabled(item.href, enabledSet)
  )

  return (
    <Sidebar collapsible="icon">
      {/* ---- Brand Header ---- */}
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-1.5 py-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/10">
            <img
              src="/TVPL.png"
              alt="Taru Villas logo"
              className="size-6"
            />
          </div>
          <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
            <span className="font-semibold tracking-tight">Taru Villas</span>
            <span className="text-[11px] text-muted-foreground">
              Management Portal
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      {/* ---- Main Navigation ---- */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMainNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.title}
                    className="h-9 rounded-lg transition-colors data-[active=true]:font-medium hover:bg-white/40 dark:hover:bg-white/5 data-[active=true]:bg-white/55 dark:data-[active=true]:bg-white/10 data-[active=true]:shadow-sm"
                  >
                    <Link href={item.href} onClick={() => setOpenMobile(false)}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {fleetNavItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Fleet Management</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {fleetNavItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      tooltip={item.title}
                      className="h-9 rounded-lg transition-colors data-[active=true]:font-medium hover:bg-white/40 dark:hover:bg-white/5 data-[active=true]:bg-white/55 dark:data-[active=true]:bg-white/10 data-[active=true]:shadow-sm"
                    >
                      <Link href={item.href} onClick={() => setOpenMobile(false)}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ---- Properties Section (Property Manager + Admin) ---- */}
        {showPropertySection && visiblePropertyNavItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Property Content</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visiblePropertyNavItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      tooltip={item.title}
                      className="h-9 rounded-lg transition-colors data-[active=true]:font-medium hover:bg-white/40 dark:hover:bg-white/5 data-[active=true]:bg-white/55 dark:data-[active=true]:bg-white/10 data-[active=true]:shadow-sm"
                    >
                      <Link href={item.href} onClick={() => setOpenMobile(false)}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ---- Admin Section ---- */}
        {showAdminSection && (
          <SidebarGroup>
            <SidebarGroupLabel>Setup & Permissions</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdminNavItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      tooltip={item.title}
                      className="h-9 rounded-lg transition-colors data-[active=true]:font-medium hover:bg-white/40 dark:hover:bg-white/5 data-[active=true]:bg-white/55 dark:data-[active=true]:bg-white/10 data-[active=true]:shadow-sm"
                    >
                      <Link href={item.href} onClick={() => setOpenMobile(false)}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* ---- Footer: User Info + Sign Out ---- */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar size="sm" className="size-8 rounded-lg">
                    {profile.avatarUrl && (
                      <AvatarImage
                        src={profile.avatarUrl}
                        alt={profile.fullName}
                      />
                    )}
                    <AvatarFallback className="rounded-lg text-xs">
                      {getInitials(profile.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {profile.fullName}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {profile.email}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar size="sm" className="size-8 rounded-lg">
                      {profile.avatarUrl && (
                        <AvatarImage
                          src={profile.avatarUrl}
                          alt={profile.fullName}
                        />
                      )}
                      <AvatarFallback className="rounded-lg text-xs">
                        {getInitials(profile.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {profile.fullName}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {profile.email}
                      </span>
                    </div>
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {formatRole(profile.role)}
                    </Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isPathEnabled('/settings', enabledSet) && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/settings" onClick={() => setOpenMobile(false)}>
                        <Settings className="size-4" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
