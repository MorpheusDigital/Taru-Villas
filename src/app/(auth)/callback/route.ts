import { createClient } from '@/lib/supabase/server'
import { getProfileById } from '@/lib/db/queries/profiles'
import { canAutoProvisionUser, shouldRejectUninvitedUser } from '@/lib/auth/client-access'
import { provisionLegacyUser } from '@/lib/auth/legacy-provisioning'
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
            const provisioned = await provisionLegacyUser(user)
            if (!provisioned) {
              return NextResponse.redirect(`${origin}/login?error=auth_failed`)
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
