import { NextResponse } from 'next/server'
import { z } from 'zod/v4'

import { getProfile } from '@/lib/auth/guards'
import {
  createRosterRevision,
  RosterLifecycleError,
} from '@/lib/db/queries/rostering-lifecycle'

const bodySchema = z.object({ expectedVersion: z.number().int().positive() })

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Cycle version is required' },
        { status: 400 },
      )
    }
    const { id } = await params
    return NextResponse.json(
      await createRosterRevision({
        orgId: profile.orgId,
        actorId: profile.id,
        cycleId: id,
        expectedVersion: parsed.data.expectedVersion,
      }),
    )
  } catch (error) {
    if (error instanceof RosterLifecycleError) {
      const status =
        error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'VERSION_CONFLICT'
            ? 409
            : 400
      return NextResponse.json({ error: error.message, code: error.code }, { status })
    }
    console.error('POST roster revision error:', error)
    return NextResponse.json(
      { error: 'Failed to create roster revision' },
      { status: 500 },
    )
  }
}
