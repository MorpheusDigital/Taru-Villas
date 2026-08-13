import { NextResponse } from 'next/server'
import { z } from 'zod/v4'

import { getProfile } from '@/lib/auth/guards'
import {
  previewRosterImport,
  type RosterImportType,
} from '@/lib/rostering/imports'

const bodySchema = z.object({
  csv: z.string().min(1).max(2_000_000),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
})
const importTypes = new Set<RosterImportType>([
  'employees',
  'forecasts',
  'unavailability',
  'boundary',
])

export async function POST(
  request: Request,
  { params }: { params: Promise<{ type: string }> },
) {
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

    const { type } = await params
    if (!importTypes.has(type as RosterImportType)) {
      return NextResponse.json({ error: 'Import type not found' }, { status: 404 })
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const preview = previewRosterImport(type as RosterImportType, parsed.data.csv, {
      month: parsed.data.month,
    })
    if (preview.summary.totalRows > 5_000) {
      return NextResponse.json(
        { error: 'CSV files are limited to 5,000 data rows' },
        { status: 400 },
      )
    }
    return NextResponse.json(preview, {
      status: preview.errors.length > 0 ? 400 : 200,
    })
  } catch (error) {
    console.error('POST /api/rostering/imports/[type]/preview error:', error)
    return NextResponse.json(
      { error: 'Failed to preview roster import' },
      { status: 500 },
    )
  }
}
