import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/guards'
import { runFleetEngine } from '@/lib/fleet/run-engine'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (!profile.isFleetAdmin && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await runFleetEngine(profile.orgId)
    if (result.skipped) {
      return NextResponse.json({ error: 'The pooling engine is disabled in fleet settings.' }, { status: 409 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('POST /api/fleet/dispatches/run-engine error:', error)
    return NextResponse.json({ error: 'Engine run failed' }, { status: 500 })
  }
}
