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

interface OrgRunResult {
  orgId: string
  created: number
  unassignable: number
  skipped: boolean
  error: string | null
}

async function run(): Promise<{ ok: boolean; results: OrgRunResult[] }> {
  const orgs = await db.select({ id: organizations.id }).from(organizations)
  const results: OrgRunResult[] = []
  let ok = true

  // The 5pm Colombo optimisation cycle runs for every org in the system —
  // through the same runFleetEngine() the "Run engine now" button calls, so
  // the two paths cannot drift. runFleetEngine resolves "today" via
  // colomboToday() internally; this loop never touches wall-clock time
  // itself.
  //
  // Each org's run is isolated in its own try/catch: a DB blip, a transaction
  // conflict, or bad data in one org must not stop every org after it from
  // being planned, and the partial results already collected must not be
  // discarded just because one org threw. `ok` is set false whenever any org
  // errors, so a partial failure is visible in the response rather than
  // silently swallowed.
  for (const org of orgs) {
    try {
      const r = await runFleetEngine(org.id)
      results.push({
        orgId: org.id,
        created: r.created,
        unassignable: r.unassignable.length,
        skipped: r.skipped,
        error: null,
      })
    } catch (error) {
      ok = false
      const message = error instanceof Error ? error.message : String(error)
      console.error(`fleet-optimize: org ${org.id} failed:`, error)
      results.push({
        orgId: org.id,
        created: 0,
        unassignable: 0,
        skipped: false,
        error: message,
      })
    }
  }

  return { ok, results }
}

export async function GET(request: NextRequest) {
  if (!bearerOk(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { ok, results } = await run()
    return NextResponse.json({ ok, results })
  } catch (error) {
    console.error('GET /api/cron/fleet-optimize error:', error)
    return NextResponse.json({ error: 'Engine run failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
