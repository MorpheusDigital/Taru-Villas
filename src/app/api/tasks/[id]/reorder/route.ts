import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { getTaskById, reorderTask, TaskReportConflict } from '@/lib/db/queries/tasks'

type Ctx = { params: Promise<{ id: string }> }
const schema = z.object({
  status: z.enum(['todo', 'in_progress', 'stuck', 'done']),
  position: z.number().int().min(0),
})

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await context.params
    const existing = await getTaskById(id)
    if (!existing || existing.orgId !== profile.orgId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed' }, { status: 400 })
    const task = await reorderTask(id, parsed.data.status, parsed.data.position, profile.orgId)
    return NextResponse.json(task)
  } catch (error) {
    if (error instanceof TaskReportConflict) return NextResponse.json({ error: error.message }, { status: 409 })
    console.error('PATCH /api/tasks/[id]/reorder error:', error)
    return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 })
  }
}
