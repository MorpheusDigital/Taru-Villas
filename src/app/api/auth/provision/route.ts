import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { canAutoProvisionUser } from '@/lib/auth/client-access'
import { isEmailAllowed } from '@/lib/db/queries/allowed-emails'
import { db } from '@/lib/db'
import { organizations, profiles, properties, propertyAssignments } from '@/lib/db/schema'

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

    const allProfiles = await db.select({ id: profiles.id }).from(profiles).limit(1)
    const isFirstUser = allProfiles.length === 0
    const orgs = await db.select().from(organizations).limit(1)
    const orgId = orgs[0]?.id

    if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 500 })

    await db.insert(profiles).values({
      id: user.id,
      orgId,
      email: user.email ?? '',
      fullName: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'User',
      avatarUrl: user.user_metadata?.avatar_url ?? null,
      role: isFirstUser ? 'admin' : 'staff',
      isActive: true,
    })

    if (isFirstUser) {
      const allProperties = await db
        .select({ id: properties.id })
        .from(properties)
        .where(eq(properties.orgId, orgId))

      if (allProperties.length > 0) {
        await db.insert(propertyAssignments).values(
          allProperties.map((property) => ({ userId: user.id, propertyId: property.id }))
        )
      }
    }

    return NextResponse.json({ provisioned: true, existing: false })
  } catch (error) {
    console.error('POST /api/auth/provision error:', error)
    return NextResponse.json({ error: 'Failed to provision profile' }, { status: 500 })
  }
}
