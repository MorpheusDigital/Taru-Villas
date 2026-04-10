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
  not_whitelisted: 'This email is not authorized. Contact your administrator for access.',
}

function LoginForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const error = searchParams.get('error')
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setFormError(null)

    const supabase = createClient()

    try {
      if (isSignUp) {
        // Check whitelist before sign-up
        const checkRes = await fetch('/api/auth/check-whitelist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.toLowerCase() }),
        })
        const checkData = await checkRes.json()

        if (!checkData.allowed) {
          setFormError('This email is not authorized. Contact your administrator for access.')
          setLoading(false)
          return
        }

        // Sign up with Supabase
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: email.split('@')[0],
            },
          },
        })

        if (signUpError) {
          setFormError(signUpError.message)
          setLoading(false)
          return
        }

        // Provision the profile
        const provisionRes = await fetch('/api/auth/provision', {
          method: 'POST',
        })

        if (!provisionRes.ok) {
          const body = await provisionRes.json().catch(() => ({}))
          setFormError(body.error ?? 'Failed to set up your account.')
          setLoading(false)
          return
        }

        router.push('/dashboard')
      } else {
        // Sign in
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) {
          setFormError(signInError.message)
          setLoading(false)
          return
        }

        router.push('/dashboard')
      }
    } catch {
      setFormError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const displayError = formError || (error ? (ERROR_MESSAGES[error] ?? 'An unexpected error occurred.') : null)

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="text-center space-y-4">
        <img
          src="/TVPL.png"
          alt="Taru Villas logo"
          className="mx-auto size-16"
        />
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
          <Input
            id="email"
            type="email"
            placeholder="you@taruvillas.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
          />
        </div>

        <Button type="submit" disabled={loading} className="w-full" size="lg">
          {loading
            ? (isSignUp ? 'Creating account...' : 'Signing in...')
            : (isSignUp ? 'Create Account' : 'Sign In')}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {isSignUp ? (
          <>
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => { setIsSignUp(false); setFormError(null) }}
              className="text-primary underline-offset-4 hover:underline"
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={() => { setIsSignUp(true); setFormError(null) }}
              className="text-primary underline-offset-4 hover:underline"
            >
              Sign up
            </button>
          </>
        )}
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
