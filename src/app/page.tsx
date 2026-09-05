import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/guards'

export default async function Home() {
  const profile = await requireAuth()

  if (!profile) {
    redirect('/login')
  }

  if (profile.role === 'admin') {
    redirect('/dashboard')
  }

  redirect('/tasks')
}
