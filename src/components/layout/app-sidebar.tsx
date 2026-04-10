'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  ClipboardCheck,
  Settings,
  Building2,
  FileText,
  Users,
  LogOut,
  ChevronsUpDown,
  ListTodo,
  Compass,
  UtensilsCrossed,
  ListChecks,
  ClipboardList,
  ShieldCheck,
} from 'lucide-react'

import { useAuth } from '@/components/providers/auth-provider'
import { createClient } from '@/lib/supabase/client'

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
}

const mainNavItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Take A Survey', href: '/surveys', icon: ClipboardCheck },
  { title: 'My SOPs', href: '/sops', icon: ListChecks },
  { title: 'Tasks', href: '/tasks', icon: ListTodo },
  { title: 'Settings', href: '/settings', icon: Settings },
]

const propertyNavItems: NavItem[] = [
  { title: 'My Properties', href: '/properties', icon: Building2 },
  { title: 'Excursions', href: '/excursions', icon: Compass },
  { title: 'Menus', href: '/menus', icon: UtensilsCrossed },
  { title: 'SOP Dashboard', href: '/sops/dashboard', icon: ClipboardList },
]

const adminNavItems: NavItem[] = [
  { title: 'Manage Properties', href: '/admin/properties', icon: Building2 },
  { title: 'Submitted Surveys', href: '/admin/surveys', icon: ClipboardCheck },
  { title: 'Manage Tasks', href: '/admin/tasks', icon: ListTodo },
  { title: 'Manage Templates', href: '/admin/templates', icon: FileText },
  { title: 'Manage SOPs', href: '/admin/sops', icon: ClipboardList },
  { title: 'Manage Users', href: '/admin/users', icon: Users },
  { title: 'Allowed Emails', href: '/admin/allowed-emails', icon: ShieldCheck },
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
  const { profile } = useAuth()
  const { setOpenMobile } = useSidebar()

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    if (href === '/sops') {
      return pathname === '/sops'
    }
    return pathname.startsWith(href)
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const showTasksNav =
    profile.role === 'admin' || profile.role === 'property_manager'
  const showPropertySection =
    profile.role === 'property_manager' || profile.role === 'admin'
  const showAdminSection = profile.role === 'admin'

  const visibleMainNavItems = mainNavItems.filter((item) => {
    if (item.href === '/dashboard') return showAdminSection
    if (item.href === '/tasks') return showTasksNav
    return true
  })

  return (
    <Sidebar collapsible="icon">
      {/* ---- Brand Header ---- */}
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-3">
          <img
            src="/TVPL.png"
            alt="Taru Villas logo"
            className="size-8 shrink-0"
          />
          <div className="flex flex-col gap-0.5 leading-none">
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
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMainNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.title}
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

        {/* ---- Properties Section (Property Manager + Admin) ---- */}
        {showPropertySection && (
          <SidebarGroup>
            <SidebarGroupLabel>Properties</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {propertyNavItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      tooltip={item.title}
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
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNavItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      tooltip={item.title}
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
                <DropdownMenuItem asChild>
                  <Link href="/settings" onClick={() => setOpenMobile(false)}>
                    <Settings className="size-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
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
