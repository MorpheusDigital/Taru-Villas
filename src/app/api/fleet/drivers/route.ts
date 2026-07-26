import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import {
  createDriver, generateDriverToken, listDrivers, setDriverVehicles,
} from '@/lib/db/queries/fleet'

const createSchema = z.object({
  fullName: z.string().min(1).max(255),
  phone: z.string().max(50).nullable().optional(),
  preferredLanguage: z.enum(['en', 'si', 'ta']).default('en'),
  isActive: z.boolean().default(true),
  vehicleIds: z.array(z.string().uuid()).default([]),
})

export async function GET() {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ drivers: await listDrivers(profile.orgId) })
  } catch (error) {
    console.error('GET /api/fleet/drivers error:', error)
    return NextResponse.json({ error: 'Failed to fetch drivers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const driver = await createDriver({
      orgId: profile.orgId,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone ?? null,
      preferredLanguage: parsed.data.preferredLanguage,
      isActive: parsed.data.isActive,
      accessToken: generateDriverToken(),
    })
    await setDriverVehicles(driver.id, parsed.data.vehicleIds ?? [])
    return NextResponse.json(driver, { status: 201 })
  } catch (error) {
    console.error('POST /api/fleet/drivers error:', error)
    return NextResponse.json({ error: 'Failed to create driver' }, { status: 500 })
  }
}
