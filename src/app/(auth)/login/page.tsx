import { LoginForm } from '@/components/auth/login-form'
import { isInviteOnlyClient } from '@/lib/auth/client-access'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return <LoginForm inviteOnly={isInviteOnlyClient()} />
}
