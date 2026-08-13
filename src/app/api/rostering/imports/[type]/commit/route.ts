import { NextResponse } from 'next/server'
import { z } from 'zod/v4'

import { getProfile } from '@/lib/auth/guards'
import { commitRosterImport } from '@/lib/db/queries/rostering-imports'
import { getRosteringAccess } from '@/lib/rostering/access'
import type { RosterImportType } from '@/lib/rostering/imports'

const bodySchema = z.object({
  csv: z.string().min(1).max(2_000_000),
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
  sourceFileName: z.string().trim().min(1).max(255),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
})
const importTypes = new Set<RosterImportType>([
  'employees',
  'forecasts',
  'unavailability',
  'boundary',
])

export async function POST(
  request: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (!['admin', 'property_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { type } = await params
    if (!importTypes.has(type as RosterImportType)) {
      return NextResponse.json({ error: 'Import type not found' }, { status: 404 })
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const access = await getRosteringAccess(
      profile.id,
      profile.role,
      profile.orgId,
    )
    const result = await commitRosterImport({
      orgId: profile.orgId,
      actorId: profile.id,
      role: profile.role,
      accessiblePropertyIds: access.propertyIds,
      type: type as RosterImportType,
      ...parsed.data,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed'
    if (message === 'Forbidden') {
      return NextResponse.json({ error: message }, { status: 403 })
    }
    if (message === 'Import preview checksum does not match') {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    if (
      message === 'Import contains validation errors' ||
      message.includes('not found:') ||
      message.includes('does not belong to department')
    ) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    console.error('POST /api/rostering/imports/[type]/commit error:', error)
    return NextResponse.json({ error: 'Failed to commit roster import' }, { status: 500 })
  }
}
