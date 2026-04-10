import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isEmailAllowed } from '@/lib/db/queries/allowed-emails'

const schema = z.object({
  email: z.string().email(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid email', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const allowed = await isEmailAllowed(parsed.data.email)
    return NextResponse.json({ allowed })
  } catch (error) {
    console.error('POST /api/auth/check-whitelist error:', error)
    return NextResponse.json(
      { error: 'Failed to check whitelist' },
      { status: 500 }
    )
  }
}
