import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { runVehicleRenewals } from '@/lib/db/queries/vehicle-renewals'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const supplied = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret ?? ''}`)
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await runVehicleRenewals()
    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  } catch {
    return NextResponse.json({ error: 'Renewal check failed' }, { status: 500 })
  }
}
