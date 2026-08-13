import { NextResponse } from 'next/server'
import { z } from 'zod/v4'

import { getProfile } from '@/lib/auth/guards'
import { linkRosterEmployeeProfile } from '@/lib/db/queries/rostering-imports'

const bodySchema = z.object({ profileId: z.string().uuid().nullable() })

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> },
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
        { error: 'Choose a valid portal profile' },
        { status: 400 },
      )
    }
    const { employeeId } = await params
    return NextResponse.json(
      await linkRosterEmployeeProfile({
        orgId: profile.orgId,
        employeeId,
        profileId: parsed.data.profileId,
      }),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Link failed'
    const status = message === 'Employee not found' ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
