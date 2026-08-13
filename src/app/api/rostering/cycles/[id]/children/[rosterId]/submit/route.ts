import { NextResponse } from 'next/server'
import { z } from 'zod/v4'

import { getProfile } from '@/lib/auth/guards'
import {
  RosterLifecycleError,
  submitChildRoster,
} from '@/lib/db/queries/rostering-lifecycle'
import { getRosteringAccess } from '@/lib/rostering/access'

const bodySchema = z.object({ expectedVersion: z.number().int().positive() })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; rosterId: string }> },
) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive || !['admin', 'property_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Cycle version is required' }, { status: 400 })
    const { id, rosterId } = await params
    const access = await getRosteringAccess(profile.id, profile.role, profile.orgId)
    const result = await submitChildRoster({
      orgId: profile.orgId,
      actorId: profile.id,
      accessiblePropertyIds: access.propertyIds,
      cycleId: id,
      rosterId,
      expectedVersion: parsed.data.expectedVersion,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof RosterLifecycleError) {
      const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'VERSION_CONFLICT' ? 409 : 400
      return NextResponse.json({ error: error.message, code: error.code }, { status })
    }
    console.error('POST child roster submit error:', error)
    return NextResponse.json({ error: 'Failed to submit property roster' }, { status: 500 })
  }
}
