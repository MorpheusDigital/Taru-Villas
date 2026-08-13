import { NextResponse } from 'next/server'

import { getProfile } from '@/lib/auth/guards'
import { getCyclePreview } from '@/lib/db/queries/rostering-cycles'
import {
  canViewManagementCycle,
  getRosteringAccess,
} from '@/lib/rostering/access'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    const { id } = await params
    const [access, preview] = await Promise.all([
      getRosteringAccess(profile.id, profile.role, profile.orgId),
      getCyclePreview(profile.orgId, id),
    ])
    if (
      !preview ||
      !canViewManagementCycle(
        access,
        preview.children.map((child) => child.propertyId),
      )
    ) {
      return NextResponse.json({ error: 'Roster cycle not found' }, { status: 404 })
    }

    return NextResponse.json(preview)
  } catch (error) {
    console.error('GET /api/rostering/cycles/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch roster cycle' },
      { status: 500 },
    )
  }
}
