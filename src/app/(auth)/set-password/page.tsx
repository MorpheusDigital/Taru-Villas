import { redirect } from 'next/navigation'
import { SetPasswordForm } from '@/components/auth/set-password-form'
import { getProfileById } from '@/lib/db/queries/profiles'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function SetPasswordPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?error=invite_invalid')

  const profile = await getProfileById(user.id)
  if (
    !profile
    || !user.email
    || profile.email.trim().toLowerCase() !== user.email.trim().toLowerCase()
  ) {
    await supabase.auth.signOut()
    redirect('/login?error=no_profile')
  }

  return <SetPasswordForm />
}
