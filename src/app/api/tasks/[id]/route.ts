import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { getTaskById, updateTask, deleteTask } from '@/lib/db/queries/tasks'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['todo', 'in_progress', 'stuck', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  projectId: z.string().uuid().optional(),
  propertyId: z.string().uuid().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  assigneeIds: z.array(z.string().uuid()).nullable().optional(),
  teamIds: z.array(z.string().uuid()).nullable().optional(),
})

export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await context.params
    const task = await getTaskById(id)
    if (!task || task.orgId !== profile.orgId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(task)
  } catch (error) {
    console.error('GET /api/tasks/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await context.params
    const existing = await getTaskById(id)
    if (!existing || existing.orgId !== profile.orgId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    const { assigneeIds, teamIds, dueDate, propertyId, ...rest } = parsed.data
    if (existing.vehicleRenewal && (
      (dueDate !== undefined && dueDate !== existing.dueDate) ||
      (rest.projectId !== undefined && rest.projectId !== existing.projectId) ||
      (assigneeIds !== undefined && JSON.stringify([...(assigneeIds ?? [])].sort()) !== JSON.stringify(existing.assignees.map(a => a.id).sort()))
    )) return NextResponse.json({ error: 'Change the renewal dates and Administration Manager on the vehicle record.' }, { status: 400 })
    const data = { ...rest,
      ...(dueDate !== undefined ? { dueDate: dueDate ?? null } : {}),
      ...(propertyId !== undefined ? { propertyId: propertyId ?? null } : {}) }
    // Never write vehicle-owned fields from the task form: a concurrent vehicle
    // update may already have changed them after the preflight read above.
    if (existing.vehicleRenewal) { delete data.dueDate; delete data.projectId }
    const task = await updateTask(id, data, existing.vehicleRenewal ? undefined : assigneeIds ?? undefined, teamIds ?? undefined)
    return NextResponse.json(task)
  } catch (error) {
    console.error('PATCH /api/tasks/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: Ctx) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await context.params
    const task = await getTaskById(id)
    if (!task || task.orgId !== profile.orgId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (task.vehicleRenewal) return NextResponse.json({ error: 'Renewal tasks are retained as vehicle history. Complete the task instead.' }, { status: 409 })
    if (profile.role !== 'admin' && task.createdBy !== profile.id)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const deleted = await deleteTask(id)
    return NextResponse.json(deleted)
  } catch (error) {
    console.error('DELETE /api/tasks/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
