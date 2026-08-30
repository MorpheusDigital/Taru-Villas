import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getClientModuleRequestStatus } from '@/lib/client-release/modules'
import { isInviteOnlyClient, isInviteOnlyLaunchReady } from '@/lib/auth/client-access'

export async function middleware(request: NextRequest) {
  if (!isInviteOnlyLaunchReady()) {
    return new NextResponse('Client access is not configured', { status: 503 })
  }

  const moduleRequestStatus = getClientModuleRequestStatus(
    request.nextUrl.pathname,
    process.env.CLIENT_ENABLED_MODULES,
    isInviteOnlyClient()
  )
  if (moduleRequestStatus === 503) {
    return new NextResponse('Client modules are not configured', { status: 503 })
  }

  // --- DEV BYPASS: skip all auth checks for testing ---
  if (process.env.DEV_BYPASS_AUTH === 'true') {
    return NextResponse.next()
  }

  if (moduleRequestStatus === 404) {
    return new NextResponse('Not Found', { status: 404 })
  }

  // Skip if Supabase env vars are not configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  // Public routes that don't require authentication
  const isPublicRoute =
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname.startsWith('/callback') ||
    request.nextUrl.pathname.startsWith('/api/auth') ||
    request.nextUrl.pathname.startsWith('/g/') ||
    request.nextUrl.pathname.startsWith('/e/') ||
    request.nextUrl.pathname.startsWith('/m/') ||
    request.nextUrl.pathname.startsWith('/u/') ||
    request.nextUrl.pathname.startsWith('/d/') ||
    request.nextUrl.pathname.startsWith('/api/surveys/guest') ||
    request.nextUrl.pathname.startsWith('/api/utilities/public') ||
    request.nextUrl.pathname.startsWith('/api/utilities/extract-reading') ||
    request.nextUrl.pathname.startsWith('/api/fleet/driver/') ||
    request.nextUrl.pathname.startsWith('/api/cron/') ||
    request.nextUrl.pathname === '/manifest.webmanifest' ||
    request.nextUrl.pathname === '/sw.js'

  if (isPublicRoute) return supabaseResponse

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Not logged in — redirect to login
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    // Logged in user visiting login — redirect to dashboard
    if (request.nextUrl.pathname === '/login') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  } catch {
    // If auth check fails, redirect to login
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|brand|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
