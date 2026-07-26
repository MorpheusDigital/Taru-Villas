import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { getFleetSettings, updateFleetSettings } from '@/lib/db/queries/fleet'

const updateSchema = z.object({
  poolingThresholdKm: z.number().min(0).max(500).optional(),
  planningHorizonDays: z.number().int().min(1).max(90).optional(),
  engineEnabled: z.boolean().optional(),
})

export async function GET() {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    return NextResponse.json(await getFleetSettings(profile.orgId))
  } catch (error) {
    console.error('GET /api/fleet/settings error:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const parsed = updateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    // The settings row is created lazily by getFleetSettings on first read.
    // If a PATCH arrives before any GET has, materialise it first — otherwise
    // the update below matches zero rows and a valid admin request 404s.
    await getFleetSettings(profile.orgId)

    const updated = await updateFleetSettings(profile.orgId, parsed.data)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/fleet/settings error:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
