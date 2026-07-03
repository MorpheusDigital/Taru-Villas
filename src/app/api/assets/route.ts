import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  listAssets, createAsset, getNextAssetSequence, logAssetEvent,
} from '@/lib/db/queries/assets'
import { buildAssetCode } from '@/lib/assets/asset-code'
import { ASSET_CATEGORIES, ASSET_STATUSES } from '@/lib/assets/labels'
import { getPropertyById } from '@/lib/db/queries/properties'
import type { Property } from '@/lib/db/schema'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tvpl.morpheusds.com'

const createSchema = z.object({
  name: z.string().min(1).max(300),
  category: z.enum(ASSET_CATEGORIES),
  propertyId: z.string().uuid(),
  roomId: z.string().uuid().nullable().optional(),
  purchaseDate: z.string(), // YYYY-MM-DD
  purchaseCost: z.string(), // numeric as string
  usefulLifeYears: z.number().int().positive(),
  salvageValue: z.string().default('0'),
  serialNumber: z.string().max(200).nullable().optional(),
  vendorName: z.string().max(300).nullable().optional(),
  warrantyExpiry: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  assetCode: z.string().max(100).optional(), // optional override
})

async function accessiblePropertyIds(profile: { id: string; role: string }) {
  return getUserProperties(profile.id, profile.role as 'admin' | 'property_manager' | 'staff')
}

export async function GET(request: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
  const sp = request.nextUrl.searchParams
  const propertyIds = await accessiblePropertyIds(profile) // null = all (admin)
  const category = sp.get('category')
  const status = sp.get('status')
  const search = sp.get('search') ?? undefined
  const includeFinancials = profile.role !== 'staff'
  const rows = await listAssets(
    {
      propertyIds,
      category: category && ASSET_CATEGORIES.includes(category as never) ? (category as never) : undefined,
      status: status && ASSET_STATUSES.includes(status as never) ? (status as never) : undefined,
      search,
    },
    includeFinancials,
  )
  return NextResponse.json({ assets: rows })
}

export async function POST(request: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
  if (profile.role === 'staff') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const data = parsed.data

  // PM scope check
  if (profile.role === 'property_manager') {
    const props = await accessiblePropertyIds(profile)
    if (props && !props.includes(data.propertyId))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const id = randomUUID()
  const explicitCode = Boolean(data.assetCode)
  let assetCode: string = data.assetCode ?? ''
  let property: Property | undefined
  let seq = 0

  if (!explicitCode) {
    property = await getPropertyById(data.propertyId)
    if (!property) return NextResponse.json({ error: 'Unknown property' }, { status: 400 })
    seq = await getNextAssetSequence(data.propertyId, data.category)
    assetCode = buildAssetCode(property.code, data.category, seq)
  }

  // Auto-generated codes are race-safe: the sequence is read-then-written,
  // so two concurrent creates (or a create racing a deletion-driven reuse)
  // can compute the same code. When we generated the code ourselves, retry
  // a bounded number of times by bumping the sequence on a unique-violation
  // before giving up. Explicit (user-supplied) codes keep the original
  // immediate-409 behavior — no retry, since we must not silently rename
  // a code the user chose.
  const maxAttempts = explicitCode ? 1 : 5
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await createAsset({
        id,
        assetCode,
        name: data.name,
        category: data.category,
        propertyId: data.propertyId,
        roomId: data.roomId ?? null,
        purchaseDate: data.purchaseDate,
        purchaseCost: data.purchaseCost,
        usefulLifeYears: data.usefulLifeYears,
        salvageValue: data.salvageValue,
        serialNumber: data.serialNumber ?? null,
        vendorName: data.vendorName ?? null,
        warrantyExpiry: data.warrantyExpiry ?? null,
        imageUrl: data.imageUrl ?? null,
        qrUrl: `${APP_URL}/scan/asset/${id}`,
        createdBy: profile.id,
      })
      await logAssetEvent(id, profile.id, 'created')
      return NextResponse.json({ id, assetCode }, { status: 201 })
    } catch (e) {
      const isCollision =
        e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === '23505'
      if (!isCollision) throw e
      if (explicitCode || attempt === maxAttempts - 1) {
        return NextResponse.json({ error: 'Asset code already exists' }, { status: 409 })
      }
      // Bump the sequence and recompute the code for the next attempt.
      seq += 1
      assetCode = buildAssetCode(property!.code, data.category, seq)
    }
  }

  // Unreachable — the loop above always returns, but TypeScript needs an
  // explicit terminal return.
  return NextResponse.json({ error: 'Asset code already exists' }, { status: 409 })
}
