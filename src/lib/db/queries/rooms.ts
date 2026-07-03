import { eq, inArray, asc } from 'drizzle-orm'
import { db } from '..'
import { rooms, type Room } from '../schema'

export async function getRoomsForProperty(propertyId: string): Promise<Room[]> {
  return db.select().from(rooms).where(eq(rooms.propertyId, propertyId)).orderBy(asc(rooms.name))
}

export async function getRoomsForProperties(propertyIds: string[]): Promise<Room[]> {
  if (propertyIds.length === 0) return []
  return db.select().from(rooms).where(inArray(rooms.propertyId, propertyIds)).orderBy(asc(rooms.name))
}

export async function getRoomById(id: string): Promise<Room | undefined> {
  const [row] = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1)
  return row
}

export async function createRoom(input: {
  propertyId: string
  name: string
  floorLevel?: string | null
}): Promise<Room> {
  const [row] = await db
    .insert(rooms)
    .values({ propertyId: input.propertyId, name: input.name, floorLevel: input.floorLevel ?? null })
    .returning()
  return row
}

export async function updateRoom(
  id: string,
  input: { name?: string; floorLevel?: string | null },
): Promise<Room | undefined> {
  const [row] = await db
    .update(rooms)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(rooms.id, id))
    .returning()
  return row
}

export async function deleteRoom(id: string): Promise<void> {
  await db.delete(rooms).where(eq(rooms.id, id))
}
