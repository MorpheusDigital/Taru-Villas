import { eq, and, inArray, ilike, or, desc } from 'drizzle-orm'
import { db } from '..'
import {
  assets, rooms, properties, assetEvents, profiles,
  type Asset, type NewAsset,
} from '../schema'
import { computeDepreciation } from '@/lib/assets/depreciation'
import type { AssetCategory, AssetStatus } from '@/lib/assets/labels'

export interface AssetRow {
  id: string
  assetCode: string
  name: string
  category: AssetCategory
  propertyId: string
  propertyName: string
  roomId: string | null
  roomName: string | null
  status: AssetStatus
  serialNumber: string | null
  vendorName: string | null
  warrantyExpiry: string | null
  imageUrl: string | null
  qrUrl: string | null
  lastAuditedAt: Date | null
  purchaseDate: string
  createdAt: Date
}
export interface AssetFinancialRow extends AssetRow {
  purchaseCost: string
  salvageValue: string
  usefulLifeYears: number
  netBookValue: number
  accumulatedDepreciation: number
  annualDepreciation: number
}
export interface ListAssetsFilter {
  propertyIds: string[] | null // null = all (admin)
  category?: AssetCategory
  status?: AssetStatus
  search?: string
}

// Colombo "today" for depreciation.
function colomboToday(): Date {
  const s = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' }) // YYYY-MM-DD
  return new Date(`${s}T00:00:00Z`)
}

type RawJoined = typeof assets.$inferSelect & {
  propertyName: string
  roomName: string | null
}

function toPhysical(r: RawJoined): AssetRow {
  return {
    id: r.id, assetCode: r.assetCode, name: r.name, category: r.category as AssetCategory,
    propertyId: r.propertyId, propertyName: r.propertyName, roomId: r.roomId, roomName: r.roomName,
    status: r.status as AssetStatus, serialNumber: r.serialNumber, vendorName: r.vendorName,
    warrantyExpiry: r.warrantyExpiry, imageUrl: r.imageUrl, qrUrl: r.qrUrl,
    lastAuditedAt: r.lastAuditedAt, purchaseDate: r.purchaseDate, createdAt: r.createdAt,
  }
}

function toFinancial(r: RawJoined): AssetFinancialRow {
  const dep = computeDepreciation(
    {
      purchaseCost: Number(r.purchaseCost),
      salvageValue: Number(r.salvageValue),
      usefulLifeYears: r.usefulLifeYears,
      purchaseDate: r.purchaseDate,
    },
    colomboToday(),
  )
  return {
    ...toPhysical(r),
    purchaseCost: r.purchaseCost,
    salvageValue: r.salvageValue,
    usefulLifeYears: r.usefulLifeYears,
    netBookValue: dep.netBookValue,
    accumulatedDepreciation: dep.accumulatedDepreciation,
    annualDepreciation: dep.annualDepreciation,
  }
}

// NOTE: `...assets._.columns` spread is intentionally NOT used here — there is
// no precedent for it anywhere in src/lib/db/queries/ (every existing joined
// select enumerates columns explicitly, e.g. dashboard.ts, issues.ts,
// properties.ts), so column names are enumerated explicitly below for every
// field toPhysical/toFinancial read. This is the safer, codebase-consistent
// form per the task brief's friction-point note.
function baseSelect() {
  return db
    .select({
      id: assets.id,
      assetCode: assets.assetCode,
      name: assets.name,
      category: assets.category,
      propertyId: assets.propertyId,
      roomId: assets.roomId,
      purchaseDate: assets.purchaseDate,
      purchaseCost: assets.purchaseCost,
      usefulLifeYears: assets.usefulLifeYears,
      salvageValue: assets.salvageValue,
      status: assets.status,
      serialNumber: assets.serialNumber,
      vendorName: assets.vendorName,
      warrantyExpiry: assets.warrantyExpiry,
      imageUrl: assets.imageUrl,
      qrUrl: assets.qrUrl,
      lastAuditedAt: assets.lastAuditedAt,
      createdAt: assets.createdAt,
      propertyName: properties.name,
      roomName: rooms.name,
    })
    .from(assets)
    .innerJoin(properties, eq(assets.propertyId, properties.id))
    .leftJoin(rooms, eq(assets.roomId, rooms.id))
}

export async function listAssets(
  filter: ListAssetsFilter,
  includeFinancials: boolean,
): Promise<AssetRow[] | AssetFinancialRow[]> {
  const conds = []
  if (filter.propertyIds !== null) {
    if (filter.propertyIds.length === 0) return []
    conds.push(inArray(assets.propertyId, filter.propertyIds))
  }
  if (filter.category) conds.push(eq(assets.category, filter.category))
  if (filter.status) conds.push(eq(assets.status, filter.status))
  if (filter.search) {
    const q = `%${filter.search}%`
    conds.push(or(ilike(assets.name, q), ilike(assets.assetCode, q), ilike(assets.serialNumber, q)))
  }
  const rowsRaw = await baseSelect()
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(assets.createdAt))
  const rows = rowsRaw as unknown as RawJoined[]
  return includeFinancials ? rows.map(toFinancial) : rows.map(toPhysical)
}

export async function getAssetById(
  id: string,
  includeFinancials: boolean,
): Promise<AssetRow | AssetFinancialRow | null> {
  const rowsRaw = await baseSelect().where(eq(assets.id, id)).limit(1)
  const rows = rowsRaw as unknown as RawJoined[]
  if (!rows[0]) return null
  return includeFinancials ? toFinancial(rows[0]) : toPhysical(rows[0])
}

// Deletion-safe, race-tolerant sequence: derives the next number from the
// MAX existing numeric suffix for this (propertyId, category), not a row
// count. A count-based sequence re-collides with an existing asset_code
// once a middle asset is deleted (count drops but the higher-numbered code
// still exists). Codes without a trailing `-<digits>` suffix (legacy or
// user-edited codes) are ignored — they don't participate in the sequence.
export async function getNextAssetSequence(
  propertyId: string,
  category: AssetCategory,
): Promise<number> {
  const rows = await db
    .select({ assetCode: assets.assetCode })
    .from(assets)
    .where(and(eq(assets.propertyId, propertyId), eq(assets.category, category)))
  let max = 0
  for (const { assetCode } of rows) {
    const match = /-(\d+)$/.exec(assetCode)
    if (!match) continue
    const n = Number(match[1])
    if (n > max) max = n
  }
  return max + 1
}

export async function createAsset(input: NewAsset): Promise<Asset> {
  const [row] = await db.insert(assets).values(input).returning()
  return row
}

export async function updateAsset(id: string, input: Partial<NewAsset>): Promise<Asset | undefined> {
  const [row] = await db
    .update(assets)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(assets.id, id))
    .returning()
  return row
}

export async function deleteAsset(id: string): Promise<void> {
  await db.delete(assets).where(eq(assets.id, id))
}

export async function logAssetEvent(
  assetId: string,
  actorId: string | null,
  eventType: string,
  detail: string | null = null,
): Promise<void> {
  await db.insert(assetEvents).values({ assetId, actorId, eventType, detail })
}

export interface DashboardData {
  totalNbv: number
  totalAccumulatedDepreciation: number
  activeCount: number
  inRepairCount: number
  byProperty: { propertyId: string; propertyName: string; totalNbv: number }[]
  byCategory: { category: AssetCategory; count: number }[]
  recentRaw: {
    events: {
      id: string; assetId: string; assetName: string; eventType: string
      detail: string | null; actorName: string | null; createdAt: Date
    }[]
  }
}

export async function getDashboardData(propertyIds: string[] | null): Promise<DashboardData> {
  const rows = (await listAssets({ propertyIds }, true)) as AssetFinancialRow[]

  const byPropertyMap = new Map<string, { propertyName: string; totalNbv: number }>()
  const byCategoryMap = new Map<AssetCategory, number>()
  let totalNbv = 0, totalAcc = 0, activeCount = 0, inRepairCount = 0

  for (const r of rows) {
    totalNbv += r.netBookValue
    totalAcc += r.accumulatedDepreciation
    if (r.status === 'active') activeCount++
    if (r.status === 'in_repair') inRepairCount++
    const p = byPropertyMap.get(r.propertyId) ?? { propertyName: r.propertyName, totalNbv: 0 }
    p.totalNbv += r.netBookValue
    byPropertyMap.set(r.propertyId, p)
    byCategoryMap.set(r.category, (byCategoryMap.get(r.category) ?? 0) + 1)
  }

  // recent events, scoped to accessible assets when propertyIds !== null
  const assetIds = rows.map((r) => r.id)
  let events: DashboardData['recentRaw']['events'] = []
  if (propertyIds === null || assetIds.length > 0) {
    const evRows = await db
      .select({
        id: assetEvents.id, assetId: assetEvents.assetId, eventType: assetEvents.eventType,
        detail: assetEvents.detail, createdAt: assetEvents.createdAt,
        assetName: assets.name, actorName: profiles.fullName,
      })
      .from(assetEvents)
      .innerJoin(assets, eq(assetEvents.assetId, assets.id))
      .leftJoin(profiles, eq(assetEvents.actorId, profiles.id))
      .where(propertyIds === null ? undefined : inArray(assetEvents.assetId, assetIds))
      .orderBy(desc(assetEvents.createdAt))
      .limit(20)
    events = evRows.map((e) => ({
      id: e.id, assetId: e.assetId, assetName: e.assetName, eventType: e.eventType,
      detail: e.detail, actorName: e.actorName ?? null, createdAt: e.createdAt,
    }))
  }

  return {
    totalNbv, totalAccumulatedDepreciation: totalAcc, activeCount, inRepairCount,
    byProperty: [...byPropertyMap.entries()].map(([propertyId, v]) => ({ propertyId, propertyName: v.propertyName, totalNbv: v.totalNbv })),
    byCategory: [...byCategoryMap.entries()].map(([category, count]) => ({ category, count })),
    recentRaw: { events },
  }
}
