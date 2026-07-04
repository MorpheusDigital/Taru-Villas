import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getRoomsForProperty, createRoom } from '@/lib/db/queries/rooms'

const createSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().min(1).max(200),
  floorLevel: z.string().max(100).nullable().optional(),
})

async function canWrite(profile: { id: string; role: string }, propertyId: string) {
  if (profile.role === 'admin') return true
  if (profile.role !== 'property_manager') return false
  const props = await getUserProperties(profile.id, profile.role as 'property_manager')
  return !props || props.includes(propertyId)
}

export async function GET(request: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
  const propertyId = request.nextUrl.searchParams.get('propertyId')
  if (!propertyId) return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
  // staff may read rooms (needed for the scan "Move Location" dropdown in Plan 2)
  const rooms = await getRoomsForProperty(propertyId)
  return NextResponse.json({ rooms })
}

export async function POST(request: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  if (!(await canWrite(profile, parsed.data.propertyId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const room = await createRoom(parsed.data)
    return NextResponse.json({ room }, { status: 201 })
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === '23505')
      return NextResponse.json({ error: 'A room with that name already exists' }, { status: 409 })
    throw e
  }
}
