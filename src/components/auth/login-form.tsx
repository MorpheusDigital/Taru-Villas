'use client'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ERROR_MESSAGES: Record<string, string> = {
  inactive: 'Your account has been deactivated. Please contact your administrator.',
  auth_failed: 'Authentication failed. Please try again.',
  no_profile: 'No account found. Please contact your administrator to get access.',
  invite_invalid: 'This invitation is invalid or has expired. Ask your administrator for a new invitation.',
  not_whitelisted: 'This email is not authorized. Contact your administrator for access.',
}

export function LoginForm({ inviteOnly }: { inviteOnly: boolean }) {
  return (
    <Suspense>
      <LoginFormContent inviteOnly={inviteOnly} />
    </Suspense>
  )
}

function LoginFormContent({ inviteOnly }: { inviteOnly: boolean }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const error = searchParams.get('error')
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setFormError(null)

    const supabase = createClient()

    try {
      if (isSignUp && !inviteOnly) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: email.split('@')[0] } },
        })

        if (signUpError) {
          setFormError(signUpError.message)
          return
        }

        if (!data.session) {
          setFormError('Check your email to confirm your account, then sign in to finish setup.')
          setIsSignUp(false)
          return
        }

        const provisionResponse = await fetch('/api/auth/provision', { method: 'POST' })
        if (!provisionResponse.ok) {
          const body = await provisionResponse.json().catch(() => ({}))
          setFormError(body.error ?? 'Failed to set up your account.')
          return
        }

        router.push('/')
        return
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setFormError(signInError.message)
        return
      }

      if (!inviteOnly) {
        const provisionResponse = await fetch('/api/auth/provision', { method: 'POST' })
        if (!provisionResponse.ok) {
          const body = await provisionResponse.json().catch(() => ({}))
          setFormError(body.error ?? 'Failed to set up your account.')
          return
        }
      }

      router.push('/')
    } catch {
      setFormError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const displayError = formError || (error ? (ERROR_MESSAGES[error] ?? 'An unexpected error occurred.') : null)

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="text-center space-y-4">
        <img src="/TVPL.png" alt="Taru Villas logo" className="mx-auto size-16" />
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Taru Villas</h1>
          <p className="text-muted-foreground">Management Portal</p>
        </div>
      </div>

      {displayError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {displayError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete={isSignUp ? 'new-password' : 'current-password'} />
        </div>
        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading ? (isSignUp ? 'Creating account...' : 'Signing in...') : (isSignUp ? 'Create Account' : 'Sign In')}
        </Button>
      </form>

      {!inviteOnly && (
        <p className="text-center text-sm text-muted-foreground">
          {isSignUp ? (
            <>Already have an account? <button type="button" onClick={() => { setIsSignUp(false); setFormError(null) }} className="text-primary underline-offset-4 hover:underline">Sign in</button></>
          ) : (
            <>Don&apos;t have an account? <button type="button" onClick={() => { setIsSignUp(true); setFormError(null) }} className="text-primary underline-offset-4 hover:underline">Sign up</button></>
          )}
        </p>
      )}
    </div>
  )
}
