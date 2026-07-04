import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { getAssetById, updateAsset, logAssetEvent } from '@/lib/db/queries/assets'
import { getRoomsForProperty } from '@/lib/db/queries/rooms'

const moveSchema = z.object({
  roomId: z.string().uuid().nullable(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })

  const asset = await getAssetById(id, false)
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const parsed = moveSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { roomId } = parsed.data

  let room = null
  if (roomId !== null) {
    const rooms = await getRoomsForProperty(asset.propertyId)
    room = rooms.find((r) => r.id === roomId) ?? null
    if (!room) {
      return NextResponse.json({ error: 'Room does not belong to this property' }, { status: 400 })
    }
  }

  await updateAsset(id, { roomId })
  await logAssetEvent(id, profile.id, 'moved', room ? room.name : 'Unassigned')

  // Return only the fields the client needs; don't over-serialize the Room row.
  return NextResponse.json({ room: room ? { id: room.id, name: room.name } : null })
}
