import { NextResponse } from 'next/server'
import { z } from 'zod/v4'

import { getProfile } from '@/lib/auth/guards'
import { saveManualUnavailability } from '@/lib/db/queries/rostering-imports'
import { getRosteringAccess } from '@/lib/rostering/access'

const bodySchema = z
  .object({
    employeeId: z.string().uuid(),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    type: z.enum([
      'annual_leave',
      'sick_leave',
      'lieu',
      'training',
      'travel_restriction',
      'other',
    ]),
    reference: z.string().trim().max(255).nullable().optional(),
    note: z.string().trim().max(2_000).nullable().optional(),
  })
  .refine((value) => value.endDate >= value.startDate, {
    path: ['endDate'],
    message: 'End date cannot precede start date',
  })

export async function POST(request: Request) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (!['admin', 'property_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const access = await getRosteringAccess(profile.id, profile.role, profile.orgId)
    const saved = await saveManualUnavailability({
      orgId: profile.orgId,
      actorId: profile.id,
      role: profile.role,
      accessiblePropertyIds: access.propertyIds,
      employeeId: parsed.data.employeeId,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      type: parsed.data.type,
      reference: parsed.data.reference ?? null,
      note: parsed.data.note ?? null,
    })
    return NextResponse.json({ unavailability: saved }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Save failed'
    if (message === 'Forbidden') {
      return NextResponse.json({ error: message }, { status: 403 })
    }
    if (message === 'Employee not found') {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    console.error('POST /api/rostering/unavailability error:', error)
    return NextResponse.json(
      { error: 'Failed to save approved unavailability' },
      { status: 500 },
    )
  }
}
