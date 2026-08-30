import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { canAutoProvisionUser } from '@/lib/auth/client-access'
import { isEmailAllowed } from '@/lib/db/queries/allowed-emails'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'
import { provisionLegacyUser } from '@/lib/auth/legacy-provisioning'

export async function POST() {
  if (!canAutoProvisionUser()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const existing = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1)
    if (existing[0]) return NextResponse.json({ provisioned: true, existing: true })

    const allowed = await isEmailAllowed(user.email ?? '')
    if (!allowed) return NextResponse.json({ error: 'Email not whitelisted' }, { status: 403 })

    const provisioned = await provisionLegacyUser(user)
    if (!provisioned) return NextResponse.json({ error: 'No organization found' }, { status: 500 })

    return NextResponse.json({ provisioned: true, existing: !provisioned.created })
  } catch (error) {
    console.error('POST /api/auth/provision error:', error)
    return NextResponse.json({ error: 'Failed to provision profile' }, { status: 500 })
  }
}
