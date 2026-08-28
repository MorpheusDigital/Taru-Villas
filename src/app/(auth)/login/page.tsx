import { LoginForm } from '@/components/auth/login-form'
import { isInviteOnlyClient } from '@/lib/auth/client-access'

export default function LoginPage() {
  return <LoginForm inviteOnly={isInviteOnlyClient()} />
}
