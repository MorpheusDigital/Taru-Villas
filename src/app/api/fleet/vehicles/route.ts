import { NextRequest, NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/guards'
import { listVehicles } from '@/lib/db/queries/fleet'
import { saveVehicle, VehicleValidationError } from '@/lib/db/queries/vehicle-renewals'
import { vehicleInputSchema } from '@/lib/fleet/vehicle-compliance'

const createSchema = vehicleInputSchema

export async function GET() {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    return NextResponse.json({ vehicles: await listVehicles(profile.orgId, profile.role === 'admin') })
  } catch (error) {
    console.error('GET /api/fleet/vehicles error:', error)
    return NextResponse.json({ error: 'Failed to fetch vehicles' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    try {
      const vehicle = await saveVehicle(profile.orgId, {
        ...parsed.data,
        registrationNo: parsed.data.registrationNo ?? null,
        currentLocationPropertyId: parsed.data.currentLocationPropertyId ?? null,
        orgId: profile.orgId,
      })
      return NextResponse.json(vehicle, { status: 201 })
    } catch (e) {
      if (e instanceof VehicleValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
      // A duplicate (orgId, name) pair is protected by vehicles_org_name_unique.
      const code = (e as { code?: string }).code
      if (code === '23505') {
        return NextResponse.json(
          { error: 'A vehicle with that name already exists' },
          { status: 409 },
        )
      }
      throw e
    }
  } catch (error) {
    console.error('POST /api/fleet/vehicles error:', error)
    return NextResponse.json({ error: 'Failed to create vehicle' }, { status: 500 })
  }
}
