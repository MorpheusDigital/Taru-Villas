import { NextRequest, NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/guards'
import { removeAllowedEmail } from '@/lib/db/queries/allowed-emails'

type RouteContext = { params: Promise<{ id: string }> }

// DELETE /api/admin/allowed-emails/[id] — remove an email from whitelist
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await context.params

    const deleted = await removeAllowedEmail(id)
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/admin/allowed-emails/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to remove email' },
      { status: 500 }
    )
  }
}
