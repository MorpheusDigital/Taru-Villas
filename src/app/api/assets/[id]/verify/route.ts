import { NextRequest, NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/guards'
import { getAssetById, updateAsset, logAssetEvent } from '@/lib/db/queries/assets'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })

  const asset = await getAssetById(id, false)
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const lastAuditedAt = new Date()
  await updateAsset(id, { lastAuditedAt })
  await logAssetEvent(id, profile.id, 'audited')

  return NextResponse.json({ ok: true, lastAuditedAt: lastAuditedAt.toISOString() })
}
