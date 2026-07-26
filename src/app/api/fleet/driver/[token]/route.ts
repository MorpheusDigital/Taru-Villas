import { NextRequest, NextResponse } from 'next/server'
import { getDriverByToken } from '@/lib/db/queries/fleet'
import { getDriverDispatches } from '@/lib/db/queries/dispatches'
import { colomboToday } from '@/lib/fleet/dates'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ token: string }> }

/**
 * Public, token-authenticated read: a driver's phone has no session, only
 * this 22-char token. An inactive driver reads as "no driver" (404, never
 * 403/401) so the endpoint can't be used to distinguish a wrong token from a
 * deactivated one. The response never echoes the token back, and every row
 * returned is scoped by `driver.id` via getDriverDispatches — a different
 * driver's token can only ever resolve to that driver's own row.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params
    const driver = await getDriverByToken(token)
    if (!driver || !driver.isActive) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const dispatches = await getDriverDispatches(driver.id, colomboToday())
    return NextResponse.json({
      driver: {
        fullName: driver.fullName,
        preferredLanguage: driver.preferredLanguage,
      },
      dispatches,
    })
  } catch (error) {
    console.error('GET /api/fleet/driver/[token] error:', error)
    return NextResponse.json({ error: 'Failed to load manifest' }, { status: 500 })
  }
}
