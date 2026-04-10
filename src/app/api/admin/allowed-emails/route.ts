import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import {
  getAllowedEmails,
  addAllowedEmail,
} from '@/lib/db/queries/allowed-emails'

const addEmailSchema = z.object({
  email: z.string().email(),
})

// GET /api/admin/allowed-emails — list all whitelisted emails
export async function GET() {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const emails = await getAllowedEmails(profile.orgId)
    return NextResponse.json(emails)
  } catch (error) {
    console.error('GET /api/admin/allowed-emails error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch allowed emails' },
      { status: 500 }
    )
  }
}

// POST /api/admin/allowed-emails — add an email to the whitelist
export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = addEmailSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const email = await addAllowedEmail({
      orgId: profile.orgId,
      email: parsed.data.email,
      addedBy: profile.id,
    })

    return NextResponse.json(email, { status: 201 })
  } catch (error: unknown) {
    // Handle unique constraint violation
    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json(
        { error: 'This email is already in the whitelist' },
        { status: 409 }
      )
    }
    console.error('POST /api/admin/allowed-emails error:', error)
    return NextResponse.json(
      { error: 'Failed to add email' },
      { status: 500 }
    )
  }
}
