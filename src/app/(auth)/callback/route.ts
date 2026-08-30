import { createClient } from '@/lib/supabase/server'
import { getProfileById } from '@/lib/db/queries/profiles'
import { isInviteOnlyClient } from '@/lib/auth/client-access'
import {
  completeAuthCallback,
  getApplicationOrigin,
  type AuthCallbackDependencies,
} from '@/lib/auth/callback'
import { provisionLegacyUser } from '@/lib/auth/legacy-provisioning'
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const inviteOnly = isInviteOnlyClient()
  const origin = getApplicationOrigin(
    process.env.NEXT_PUBLIC_APP_URL ?? (inviteOnly ? undefined : url.origin)
  )
  const supabase = await createClient()
  const dependencies: AuthCallbackDependencies<User> = {
    exchangeCodeForSession: async (code) => supabase.auth.exchangeCodeForSession(code),
    verifyInviteOtp: async (tokenHash) => supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'invite',
    }),
    getUser: async () => {
      const { data, error } = await supabase.auth.getUser()
      return error ? undefined : data.user ?? undefined
    },
    getProfile: getProfileById,
    provisionLegacyUser: async (user) => Boolean(await provisionLegacyUser(user)),
    clearSession: async () => {
      await supabase.auth.signOut()
    },
  }
  const result = await completeAuthCallback(
    {
      code: url.searchParams.get('code'),
      tokenHash: url.searchParams.get('token_hash'),
      type: url.searchParams.get('type'),
      next: url.searchParams.get('next'),
      inviteOnly,
    },
    dependencies
  )

  return NextResponse.redirect(new URL(result.destination, origin))
}
