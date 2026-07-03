import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getAssetById, updateAsset, deleteAsset } from '@/lib/db/queries/assets'
import { ASSET_CATEGORIES, ASSET_STATUSES } from '@/lib/assets/labels'

const patchSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  category: z.enum(ASSET_CATEGORIES).optional(),
  roomId: z.string().uuid().nullable().optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  serialNumber: z.string().max(200).nullable().optional(),
  vendorName: z.string().max(300).nullable().optional(),
  warrantyExpiry: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  purchaseDate: z.string().optional(),
  salvageValue: z.string().optional(),
  // admin-only fields:
  purchaseCost: z.string().optional(),
  usefulLifeYears: z.number().int().positive().optional(),
})

async function loadAndAuthorize(profile: { id: string; role: string }, id: string) {
  const includeFinancials = profile.role !== 'staff'
  const asset = await getAssetById(id, includeFinancials)
  if (!asset) return { asset: null }
  if (profile.role === 'property_manager') {
    const props = await getUserProperties(profile.id, 'property_manager')
    if (props && !props.includes(asset.propertyId)) return { asset: null, forbidden: true }
  }
  return { asset }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
  const { asset, forbidden } = await loadAndAuthorize(profile, id)
  if (forbidden) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ asset })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
  if (profile.role === 'staff') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { asset, forbidden } = await loadAndAuthorize(profile, id)
  if (forbidden) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const update = { ...parsed.data }
  if (profile.role === 'property_manager') {
    delete update.purchaseCost
    delete update.usefulLifeYears
  }
  const updated = await updateAsset(id, update)
  return NextResponse.json({ asset: updated })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await deleteAsset(id) // asset_events + maintenance_logs cascade-delete with the asset
  return NextResponse.json({ ok: true })
}
