import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getLatestReading, createReading } from '@/lib/db/queries/utilities'

const publicReadingSchema = z.object({
  propertyId: z.string().uuid(),
  utilityType: z.enum(['water', 'electricity']),
  readingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  readingValue: z.number().min(0),
  note: z.string().max(500).nullable().optional(),
})

// POST /api/utilities/public — submit a reading without auth
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = publicReadingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // Validate cumulative order
    const latest = await getLatestReading(
      parsed.data.propertyId,
      parsed.data.utilityType
    )

    if (latest && parsed.data.readingValue < parseFloat(latest.readingValue)) {
      return NextResponse.json(
        {
          error: `Reading must be >= the previous reading (${latest.readingValue} on ${latest.readingDate})`,
        },
        { status: 400 }
      )
    }

    const reading = await createReading({
      propertyId: parsed.data.propertyId,
      utilityType: parsed.data.utilityType,
      readingDate: parsed.data.readingDate,
      readingValue: String(parsed.data.readingValue),
      note: parsed.data.note ?? null,
      recordedBy: null,
    })

    return NextResponse.json(reading, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json(
        { error: 'A reading already exists for this date and utility type' },
        { status: 409 }
      )
    }
    console.error('POST /api/utilities/public error:', error)
    return NextResponse.json({ error: 'Failed to save reading' }, { status: 500 })
  }
}
