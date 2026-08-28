import { NextRequest, NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/guards'
import {
  inviteUserForOrganization,
  parseInviteUser,
} from '@/lib/auth/invitations'
import { getProfiles, getProfileByEmail } from '@/lib/db/queries/profiles'
import { getProperties } from '@/lib/db/queries/properties'
import { createAdminClient } from '@/lib/supabase/admin'
import { db } from '@/lib/db'
import { profiles, propertyAssignments } from '@/lib/db/schema'

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

    const supabaseAdmin = createAdminClient()
    const result = await inviteUserForOrganization(profile, parsed.data, {
      getOrganizationPropertyIds: async (orgId) => {
        const organizationProperties = await getProperties(orgId)
        return organizationProperties.map((property) => property.id)
      },
      getExistingProfile: getProfileByEmail,
      inviteUserByEmail: async ({ email, fullName, role }) => {
        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
          email,
          { data: { full_name: fullName, role } }
        )
        if (error) throw error
        return { id: data.user.id }
      },
      persistInvitedUser: async ({ propertyIds, ...profileData }) =>
        db.transaction(async (tx) => {
          const [newProfile] = await tx
            .insert(profiles)
            .values(profileData)
            .returning()

          if (propertyIds.length > 0) {
            await tx.insert(propertyAssignments).values(
              propertyIds.map((propertyId) => ({
                userId: newProfile.id,
                propertyId,
              }))
            )
          }

          return newProfile
        }),
      deleteInvitedUser: async (userId) => {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
        if (error) throw error
      },
      logError: (message, error) => console.error(`${message}:`, error),
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }

    return NextResponse.json(result.profile, { status: result.status })
  } catch (error) {
    console.error('POST /api/users error:', error)
    return NextResponse.json(
      { error: 'Failed to invite user' },
      { status: 500 }
    )
  }
}
