import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { listDistances, upsertDistance } from '@/lib/db/queries/fleet'

const upsertSchema = z.object({
  fromPropertyId: z.string().uuid().nullable(),
  toPropertyId: z.string().uuid().nullable(),
  distanceKm: z.number().min(0).max(2000),
  driveMinutes: z.number().int().min(0).max(2000).nullable().optional(),
})

/**
 * Canonicalizes a property pair so a given leg always writes to the same
 * row regardless of which direction the admin entered it in: null (head
 * office) always sorts first; otherwise the lexicographically smaller uuid
 * string sorts first. The unique constraint on propertyDistances is the
 * ordered triple (orgId, fromPropertyId, toPropertyId), so without this,
 * A->B and B->A can both exist as distinct rows and which one the engine's
 * order-independent lookup picks becomes nondeterministic — contradicting
 * upsertDistance's own "written in one direction only" comment.
 */
function canonicalPair(a: string | null, b: string | null): [string | null, string | null] {
  if (a === null) return [a, b]
  if (b === null) return [b, a]
  return a < b ? [a, b] : [b, a]
}

export async function GET() {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    return NextResponse.json({ distances: await listDistances(profile.orgId) })
  } catch (error) {
    console.error('GET /api/fleet/distances error:', error)
    return NextResponse.json({ error: 'Failed to fetch distances' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const parsed = upsertSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { fromPropertyId, toPropertyId, distanceKm, driveMinutes } = parsed.data
    if (fromPropertyId === toPropertyId) {
      return NextResponse.json({ error: 'A node cannot have a distance to itself' }, { status: 400 })
    }

    const [from, to] = canonicalPair(fromPropertyId, toPropertyId)
    const row = await upsertDistance(profile.orgId, from, to, distanceKm, driveMinutes ?? null)
    return NextResponse.json(row)
  } catch (error) {
    console.error('PUT /api/fleet/distances error:', error)
    return NextResponse.json({ error: 'Failed to save distance' }, { status: 500 })
  }
}
