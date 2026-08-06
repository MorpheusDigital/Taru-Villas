import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getProfile } from '@/lib/auth/guards'
import {
  getTripReportForRequest,
  submitTripReport,
} from '@/lib/db/queries/fleet-trip-reports'

type RouteContext = { params: Promise<{ requestId: string }> }

const submitSchema = z.object({
  summary: z.string().trim().min(1, 'Summary is required').max(5000),
  attachmentUrls: z.array(z.string()).optional(),
})

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { requestId } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })

    const parsed = submitSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const report = await getTripReportForRequest(requestId, profile.orgId)
    if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (report.submittedBy !== profile.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const submitted = await submitTripReport(requestId, profile.id, {
      summary: parsed.data.summary,
      attachmentUrls: parsed.data.attachmentUrls ?? [],
    })
    if (!submitted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json(submitted)
  } catch (error) {
    console.error('POST /api/fleet/reports/[requestId] error:', error)
    return NextResponse.json({ error: 'Failed to submit trip report' }, { status: 500 })
  }
}
