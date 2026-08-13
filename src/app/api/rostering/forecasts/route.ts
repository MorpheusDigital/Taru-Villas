import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'

import { getProfile } from '@/lib/auth/guards'
import {
  listForecastsForMonth,
  upsertManualForecasts,
} from '@/lib/db/queries/rostering-imports'
import { getRosteringAccess } from '@/lib/rostering/access'

const forecastSchema = z.object({
  propertyId: z.string().uuid(),
  date: z.iso.date(),
  occupancyPercent: z.number().min(0).max(100),
  arrivalsCount: z.number().int().nonnegative(),
  departuresCount: z.number().int().nonnegative(),
})
const bodySchema = z.object({
  forecasts: z.array(forecastSchema).min(1).max(1_000),
})

export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive || !['admin', 'property_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const query = z
      .object({
        propertyId: z.string().uuid(),
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      })
      .safeParse({
        propertyId: request.nextUrl.searchParams.get('propertyId'),
        month: request.nextUrl.searchParams.get('month'),
      })
    if (!query.success) {
      return NextResponse.json({ error: 'Invalid property or month' }, { status: 400 })
    }
    const access = await getRosteringAccess(profile.id, profile.role, profile.orgId)
    const forecasts = await listForecastsForMonth({
      orgId: profile.orgId,
      accessiblePropertyIds: access.propertyIds,
      ...query.data,
    })
    if (!forecasts) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }
    return NextResponse.json({ forecasts })
  } catch (error) {
    console.error('GET /api/rostering/forecasts error:', error)
    return NextResponse.json({ error: 'Failed to fetch forecasts' }, { status: 500 })
  }
}

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
    const saved = await upsertManualForecasts({
      orgId: profile.orgId,
      actorId: profile.id,
      role: profile.role,
      accessiblePropertyIds: access.propertyIds,
      forecasts: parsed.data.forecasts,
    })
    return NextResponse.json({ forecasts: saved })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Save failed'
    if (message === 'Forbidden') {
      return NextResponse.json({ error: message }, { status: 403 })
    }
    if (message === 'Property not found') {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    console.error('POST /api/rostering/forecasts error:', error)
    return NextResponse.json({ error: 'Failed to save forecasts' }, { status: 500 })
  }
}
