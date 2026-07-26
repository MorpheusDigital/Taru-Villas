import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { organizations } from '@/lib/db/schema'
import { runFleetEngine } from '@/lib/fleet/run-engine'

export const dynamic = 'force-dynamic'

// Cron routes authenticate with Bearer $CRON_SECRET, never getProfile() — this
// endpoint has no human session to check. bearerOk fails CLOSED when
// CRON_SECRET is unset: an unset secret must never be treated as "allow".
function bearerOk(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

async function run() {
  const orgs = await db.select({ id: organizations.id }).from(organizations)
  const results: { orgId: string; created: number; unassignable: number; skipped: boolean }[] = []

  // The 5pm Colombo optimisation cycle runs for every org in the system —
  // through the same runFleetEngine() the "Run engine now" button calls, so
  // the two paths cannot drift. runFleetEngine resolves "today" via
  // colomboToday() internally; this loop never touches wall-clock time
  // itself.
  for (const org of orgs) {
    const r = await runFleetEngine(org.id)
    results.push({
      orgId: org.id,
      created: r.created,
      unassignable: r.unassignable.length,
      skipped: r.skipped,
    })
  }

  return results
}

export async function GET(request: NextRequest) {
  if (!bearerOk(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, results: await run() })
  } catch (error) {
    console.error('GET /api/cron/fleet-optimize error:', error)
    return NextResponse.json({ error: 'Engine run failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
