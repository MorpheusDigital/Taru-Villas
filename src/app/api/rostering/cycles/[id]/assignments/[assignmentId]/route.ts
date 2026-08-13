import { NextResponse } from 'next/server'
import { z } from 'zod/v4'

import { getProfile } from '@/lib/auth/guards'
import {
  RosterLifecycleError,
  updateRosterAssignment,
} from '@/lib/db/queries/rostering-lifecycle'
import { getRosteringAccess } from '@/lib/rostering/access'

const bodySchema = z.object({
  expectedVersion: z.number().int().positive(),
  dutyPropertyId: z.string().uuid(),
  roleId: z.string().uuid(),
  dutyCode: z.enum(['W', 'S']),
  shiftTemplateId: z.string().uuid(),
  explanation: z.string().trim().min(3).max(1_000),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive || !['admin', 'property_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const { id, assignmentId } = await params
    const access = await getRosteringAccess(profile.id, profile.role, profile.orgId)
    const result = await updateRosterAssignment({
      orgId: profile.orgId,
      actorId: profile.id,
      accessiblePropertyIds: access.propertyIds,
      cycleId: id,
      assignmentId,
      ...parsed.data,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof RosterLifecycleError) {
      const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'VERSION_CONFLICT' ? 409 : 400
      return NextResponse.json({ error: error.message, code: error.code }, { status })
    }
    console.error('PATCH roster assignment error:', error)
    return NextResponse.json({ error: 'Failed to update roster assignment' }, { status: 500 })
  }
}
