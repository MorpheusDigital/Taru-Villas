import { NextResponse } from 'next/server'

import { getProfile } from '@/lib/auth/guards'
import { listCycles } from '@/lib/db/queries/rostering-cycles'
import { getRosteringAccess } from '@/lib/rostering/access'

export async function GET() {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    const access = await getRosteringAccess(
      profile.id,
      profile.role,
      profile.orgId,
    )
    if (!access.canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const cycles = await listCycles(profile.orgId, access.propertyIds)
    return NextResponse.json({ cycles })
  } catch (error) {
    console.error('GET /api/rostering/cycles error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch roster cycles' },
      { status: 500 },
    )
  }
}
