import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getRoomById, updateRoom, deleteRoom } from '@/lib/db/queries/rooms'

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  floorLevel: z.string().max(100).nullable().optional(),
})

async function canWrite(profile: { id: string; role: string }, propertyId: string) {
  if (profile.role === 'admin') return true
  if (profile.role !== 'property_manager') return false
  const props = await getUserProperties(profile.id, profile.role as 'property_manager')
  return !props || props.includes(propertyId)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
  const room = await getRoomById(id)
  if (!room) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await canWrite(profile, room.propertyId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { name, floorLevel } = parsed.data
  try {
    const updated = await updateRoom(id, { name, floorLevel })
    return NextResponse.json({ room: updated })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === '23505')
      return NextResponse.json({ error: 'A room with that name already exists' }, { status: 409 })
    throw e
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
  const room = await getRoomById(id)
  if (!room) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await canWrite(profile, room.propertyId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await deleteRoom(id)
  return NextResponse.json({ ok: true })
}
