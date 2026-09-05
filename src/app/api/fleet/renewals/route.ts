import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/guards'
import { runVehicleRenewals } from '@/lib/db/queries/vehicle-renewals'

export async function POST() {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.isActive || profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const result = await runVehicleRenewals(profile.orgId)
    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  } catch { return NextResponse.json({ error: 'Renewal check failed' }, { status: 500 }) }
}
