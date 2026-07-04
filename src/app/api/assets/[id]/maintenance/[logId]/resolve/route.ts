import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getAssetById, updateAsset, logAssetEvent } from '@/lib/db/queries/assets'
import { getMaintenanceLogById, resolveMaintenanceLog } from '@/lib/db/queries/maintenance'

const resolveSchema = z.object({
  repairCost: z.string().optional(),
  setActive: z.boolean().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; logId: string }> },
) {
  const { id, logId } = await params
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
  if (profile.role === 'staff') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const asset = await getAssetById(id, false)
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // The log must actually belong to this asset — otherwise a PM scoped to
  // `asset.propertyId` could pass an unrelated logId from another property
  // and resolve a maintenance log they have no authority over (same class
  // of bug fixed for rooms in f4bafb4).
  const log = await getMaintenanceLogById(logId)
  if (!log || log.assetId !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (profile.role === 'property_manager') {
    const props = await getUserProperties(profile.id, 'property_manager')
    if (props && !props.includes(asset.propertyId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const body = await request.json().catch(() => null)
  const parsed = resolveSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { setActive, repairCost } = parsed.data

  await resolveMaintenanceLog(logId, profile.id, repairCost)

  if (setActive) {
    await updateAsset(id, { status: 'active' })
    await logAssetEvent(id, profile.id, 'status_changed', 'repair resolved')
  }

  return NextResponse.json({ ok: true })
}
