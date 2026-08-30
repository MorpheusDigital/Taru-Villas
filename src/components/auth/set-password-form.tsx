'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { completePasswordSetup } from '@/lib/auth/callback'
import { createClient } from '@/lib/supabase/client'

export function SetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const result = await completePasswordSetup(
      password,
      confirmation,
      async (newPassword) => supabase.auth.updateUser({ password: newPassword })
    )

    if (!result.ok) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.replace(result.destination)
    router.refresh()
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Set your password</h1>
        <p className="text-muted-foreground">
          Finish accepting your invitation to enter the portal.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password-confirmation">Confirm password</Label>
          <Input
            id="password-confirmation"
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            minLength={8}
            autoComplete="new-password"
            required
          />
        </div>
        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading ? 'Saving password...' : 'Continue to portal'}
        </Button>
      </form>
    </div>
  )
}
