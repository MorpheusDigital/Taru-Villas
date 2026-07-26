import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import {
  createDriver, generateDriverToken, listDrivers, listVehicles, setDriverVehicles,
} from '@/lib/db/queries/fleet'

const createSchema = z.object({
  fullName: z.string().min(1).max(255),
  phone: z.string().max(50).nullable().optional(),
  preferredLanguage: z.enum(['en', 'si', 'ta']).default('en'),
  isActive: z.boolean().default(true),
  vehicleIds: z.array(z.string().uuid()).default([])
    .transform((ids) => Array.from(new Set(ids))),
})

/**
 * Returns the subset of vehicleIds that do not belong to this org, so
 * callers can reject a bad payload with a useful 400 before mutating
 * anything (an unknown or cross-org id would otherwise surface as a bare
 * 500 from the driver_vehicles foreign key).
 */
async function findInvalidVehicleIds(orgId: string, vehicleIds: string[]) {
  if (vehicleIds.length === 0) return []
  const orgVehicles = await listVehicles(orgId)
  const validIds = new Set(orgVehicles.map((v) => v.id))
  return vehicleIds.filter((id) => !validIds.has(id))
}

export async function GET() {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })

    const driversList = await listDrivers(profile.orgId)
    // accessToken is a driver's sole credential for the manifest page — it
    // must not be readable by non-admins, who could otherwise harvest every
    // driver's token and read/progress their trips.
    const drivers = profile.role === 'admin'
      ? driversList
      : driversList.map((d) => ({
          id: d.id,
          orgId: d.orgId,
          fullName: d.fullName,
          phone: d.phone,
          preferredLanguage: d.preferredLanguage,
          isActive: d.isActive,
          vehicleIds: d.vehicleIds,
        }))
    return NextResponse.json({ drivers })
  } catch (error) {
    console.error('GET /api/fleet/drivers error:', error)
    return NextResponse.json({ error: 'Failed to fetch drivers' }, { status: 500 })
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

    const invalidIds = await findInvalidVehicleIds(profile.orgId, parsed.data.vehicleIds)
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: `Unknown vehicle id(s): ${invalidIds.join(', ')}` },
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
    await setDriverVehicles(driver.id, parsed.data.vehicleIds)
    return NextResponse.json(driver, { status: 201 })
  } catch (error) {
    console.error('POST /api/fleet/drivers error:', error)
    return NextResponse.json({ error: 'Failed to create driver' }, { status: 500 })
  }
}
