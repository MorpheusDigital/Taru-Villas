import { createClient } from '@/lib/supabase/server'
import { getProfileById } from '@/lib/db/queries/profiles'
import { canAutoProvisionUser, shouldRejectUninvitedUser } from '@/lib/auth/client-access'
import { db } from '@/lib/db'
import { organizations, profiles, properties, propertyAssignments } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const profile = await getProfileById(user.id)

        if (!shouldRejectUninvitedUser(!canAutoProvisionUser(), Boolean(profile))) {
          if (!profile) {
            const allProfiles = await db.select({ id: profiles.id }).from(profiles).limit(1)
            const isFirstUser = allProfiles.length === 0
            const orgs = await db.select().from(organizations).limit(1)
            const orgId = orgs[0]?.id

            if (!orgId) {
              return NextResponse.redirect(`${origin}/login?error=auth_failed`)
            }

            await db.insert(profiles).values({
              id: user.id,
              orgId,
              email: user.email ?? '',
              fullName: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'User',
              avatarUrl: user.user_metadata?.avatar_url ?? null,
              role: isFirstUser ? 'admin' : 'staff',
              isActive: true,
            })

            if (isFirstUser) {
              const allProperties = await db
                .select({ id: properties.id })
                .from(properties)
                .where(eq(properties.orgId, orgId))

              if (allProperties.length > 0) {
                await db.insert(propertyAssignments).values(
                  allProperties.map((property) => ({ userId: user.id, propertyId: property.id }))
                )
              }
            }
          }

          return NextResponse.redirect(`${origin}${next}`)
        }

        return NextResponse.redirect(`${origin}/login?error=no_profile`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
