import { requireAuth } from '@/lib/auth/guards'
import { AuthProvider } from '@/components/providers/auth-provider'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Header } from '@/components/layout/header'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Toaster } from 'sonner'
import { redirect } from 'next/navigation'
import { getEnabledClientModules } from '@/lib/client-release/modules'
import { PwaProvider } from '@/components/pwa/pwa-provider'

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await requireAuth()

  // If no profile found (user logged in via Google but not invited), show error
  if (!profile) {
    redirect('/login?error=no_profile')
  }

  return (
    <AuthProvider
      initialProfile={profile}
      enabledModules={[...getEnabledClientModules()]}
    >
      <PwaProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <Header />
            <main className="relative flex-1 p-4 sm:p-6">
              <div
                aria-hidden
                className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(120%_120%_at_50%_-10%,color-mix(in_oklch,var(--primary)_7%,transparent),transparent_55%)]"
              />
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
        <Toaster position="top-right" />
      </PwaProvider>
    </AuthProvider>
  )
}
