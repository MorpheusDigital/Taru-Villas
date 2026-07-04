import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { getAssetById, updateAsset, logAssetEvent } from '@/lib/db/queries/assets'
import { createMaintenanceLog } from '@/lib/db/queries/maintenance'

const flagRepairSchema = z.object({
  issueDescription: z.string().min(1, 'Issue description is required'),
  serviceDate: z.string().optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })

  const asset = await getAssetById(id, false)
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const parsed = flagRepairSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { issueDescription, serviceDate } = parsed.data

  const log = await createMaintenanceLog({
    assetId: id,
    reportedBy: profile.id,
    issueDescription,
    serviceDate: serviceDate ?? null,
  })
  await updateAsset(id, { status: 'in_repair' })
  await logAssetEvent(id, profile.id, 'repair_flagged', issueDescription)

  return NextResponse.json({ id: log.id }, { status: 201 })
}
