import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isEmailAllowed } from '@/lib/db/queries/allowed-emails'
import { db } from '@/lib/db'
import { profiles, organizations, properties, propertyAssignments } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if profile already exists
    const existing = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1)

    if (existing[0]) {
      return NextResponse.json({ provisioned: true, existing: true })
    }

    // Double-check whitelist server-side
    const allowed = await isEmailAllowed(user.email ?? '')
    if (!allowed) {
      return NextResponse.json(
        { error: 'Email not whitelisted' },
        { status: 403 }
      )
    }

    // Check if this is the first user (→ admin)
    const allProfiles = await db.select({ id: profiles.id }).from(profiles).limit(1)
    const isFirstUser = allProfiles.length === 0

    // Get the organization
    const orgs = await db.select().from(organizations).limit(1)
    const orgId = orgs[0]?.id

    if (!orgId) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 500 }
      )
    }

    // Create the profile
    await db.insert(profiles).values({
      id: user.id,
      orgId,
      email: user.email ?? '',
      fullName: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'User',
      avatarUrl: user.user_metadata?.avatar_url ?? null,
      role: isFirstUser ? 'admin' : 'staff',
      isActive: true,
    })

    // If admin, assign all properties
    if (isFirstUser) {
      const allProperties = await db
        .select({ id: properties.id })
        .from(properties)
        .where(eq(properties.orgId, orgId))

      if (allProperties.length > 0) {
        await db.insert(propertyAssignments).values(
          allProperties.map((p) => ({
            userId: user.id,
            propertyId: p.id,
          }))
        )
      }
    }

    return NextResponse.json({ provisioned: true, existing: false })
  } catch (error) {
    console.error('POST /api/auth/provision error:', error)
    return NextResponse.json(
      { error: 'Failed to provision profile' },
      { status: 500 }
    )
  }
}
