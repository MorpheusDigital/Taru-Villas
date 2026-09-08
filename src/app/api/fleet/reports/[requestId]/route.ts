import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getProfile } from '@/lib/auth/guards'
import {
  getTripReportForRequest,
  submitTripReport,
  getVisitReportPage,
  VisitReportError,
  saveVisitReportDraft,
} from '@/lib/db/queries/fleet-trip-reports'
import { visitReportSubmissionSchema, visitReportDraftSchema } from '@/lib/fleet/reports'

type RouteContext = { params: Promise<{ requestId: string }> }

const submitSchema = visitReportSubmissionSchema

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    const { requestId } = await context.params
    if (!z.uuid().safeParse(requestId).success) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const report = await getTripReportForRequest(requestId, profile.orgId)
    if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (report.submittedBy !== profile.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const parsed = visitReportDraftSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    return NextResponse.json(await saveVisitReportDraft(requestId, profile.orgId, profile.id, parsed.data))
  } catch (error) {
    if (error instanceof VisitReportError) return NextResponse.json({ error: error.message }, { status: 409 })
    console.error('PATCH visit report draft failed:', error)
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 })
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    const { requestId } = await context.params
    if (!z.uuid().safeParse(requestId).success) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const result = await getVisitReportPage(requestId, profile.orgId, profile.id)
    return result ? NextResponse.json(result) : NextResponse.json({ error: 'Not found' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'Failed to load visit report' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { requestId } = await context.params
    if (!z.uuid().safeParse(requestId).success) return NextResponse.json({ error: 'Not found' }, { status: 404 })
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

    const submitted = await submitTripReport(requestId, profile.orgId, profile.id, parsed.data)
    if (!submitted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json(submitted)
  } catch (error) {
    if (error instanceof VisitReportError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('POST /api/fleet/reports/[requestId] error:', error)
    return NextResponse.json({ error: 'Failed to submit trip report' }, { status: 500 })
  }
}
