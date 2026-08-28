import { NextRequest, NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/guards'
import { parseInviteUser } from '@/lib/auth/invitations'
import { getProfiles, createProfile, getProfileByEmail } from '@/lib/db/queries/profiles'
import { getProperties } from '@/lib/db/queries/properties'
import { createAdminClient } from '@/lib/supabase/admin'
import { db } from '@/lib/db'
import { propertyAssignments } from '@/lib/db/schema'

// ---------------------------------------------------------------------------
// GET /api/users
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
    }

    const users = await getProfiles(profile.orgId)

    return NextResponse.json(users)
  } catch (error) {
    console.error('GET /api/users error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/users — Invite a new user
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = parseInviteUser(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { email, fullName, role, propertyIds } = parsed.data
    const organizationProperties = await getProperties(profile.orgId)
    const organizationPropertyIds = new Set(
      organizationProperties.map((property) => property.id)
    )

    if (propertyIds.some((propertyId) => !organizationPropertyIds.has(propertyId))) {
      return NextResponse.json(
        { error: 'Forbidden: property does not belong to your organization' },
        { status: 403 }
      )
    }

    // Check if user already exists
    const existingProfile = await getProfileByEmail(email)
    if (existingProfile) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 409 }
      )
    }

    // Create auth user via Supabase admin client (sends invite email)
    const supabaseAdmin = createAdminClient()
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName, role },
      })

    if (authError) {
      console.error('Supabase invite error:', authError)
      return NextResponse.json(
        { error: `Failed to create auth user: ${authError.message}` },
        { status: 500 }
      )
    }

    // Create profile in our database
    const newProfile = await createProfile({
      id: authData.user.id,
      orgId: profile.orgId,
      email,
      fullName,
      role,
    })

    // Create property assignments
    if (propertyIds.length > 0) {
      await db.insert(propertyAssignments).values(
        propertyIds.map((propertyId) => ({
          userId: newProfile.id,
          propertyId,
        }))
      )
    }

    return NextResponse.json(newProfile, { status: 201 })
  } catch (error) {
    console.error('POST /api/users error:', error)
    return NextResponse.json(
      { error: 'Failed to invite user' },
      { status: 500 }
    )
  }
}
