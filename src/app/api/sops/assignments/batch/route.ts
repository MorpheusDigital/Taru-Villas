import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getProfile } from '@/lib/auth/guards'
import { batchCreateAssignments, type BatchAssignmentRow } from '@/lib/db/queries/sops'

const rowSchema = z.object({
  userId: z.string().uuid(),
  propertyId: z.string().uuid(),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  deadlineTime: z.string().regex(/^\d{2}:\d{2}$/),
  deadlineDay: z.number().int().min(1).max(31).nullable(),
  notifyOnOverdue: z.boolean(),
})

const batchSchema = z.object({
  templateId: z.string().uuid(),
  rows: z.array(rowSchema).min(1).max(200),
})

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const parsed = batchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
    }

    const rows: BatchAssignmentRow[] = parsed.data.rows.map((r) => ({
      templateId: parsed.data.templateId,
      userId: r.userId,
      propertyId: r.propertyId,
      frequency: r.frequency,
      deadlineTime: r.deadlineTime,
      deadlineDay: r.deadlineDay,
      notifyOnOverdue: r.notifyOnOverdue,
    }))

    const result = await batchCreateAssignments(rows)
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('POST /api/sops/assignments/batch error:', error)
    return NextResponse.json({ error: 'Failed to create assignments' }, { status: 500 })
  }
}
