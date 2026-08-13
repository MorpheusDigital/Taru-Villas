import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'
import { z } from 'zod/v4'

import { getProfile } from '@/lib/auth/guards'
import { listActiveRosteringHubs } from '@/lib/db/queries/rostering-setup'
import {
  canGenerateHub,
  getRosteringAccess,
} from '@/lib/rostering/access'
import { generateAndSaveDraft } from '@/lib/rostering/service'

const schema = z.object({
  hubId: z.string().uuid(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}-01$/, 'Use the first date of the month'),
})

const knownSetupErrors = [
  'Hub not found',
  'No active approved roster policy covers this month',
  'Forecast missing for ',
  'Prior-week boundary context missing for ',
  'Rostering setup is incomplete:',
  'missing staffing band for ',
  'overlapping staffing bands for ',
  'duplicate cadre for ',
  'Only draft roster cycles can be regenerated',
  'Published roster cycles require a new revision',
]

export async function POST(request: Request) {
  const correlationId = randomUUID()
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (!['admin', 'property_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const [access, hubs] = await Promise.all([
      getRosteringAccess(profile.id, profile.role, profile.orgId),
      listActiveRosteringHubs(profile.orgId),
    ])
    const hub = hubs.find((item) => item.id === parsed.data.hubId)
    if (
      !hub ||
      !canGenerateHub(
        access,
        hub.properties.map((property) => property.id),
      )
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const generated = await generateAndSaveDraft({
      orgId: profile.orgId,
      hubId: parsed.data.hubId,
      month: parsed.data.month,
      actorId: profile.id,
    })
    return NextResponse.json(generated, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    if (knownSetupErrors.some((known) => message.startsWith(known))) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    console.error('POST /api/rostering/generate error', {
      correlationId,
      error,
    })
    return NextResponse.json(
      { error: 'Failed to generate roster', correlationId },
      { status: 500 },
    )
  }
}
