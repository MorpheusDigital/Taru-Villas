import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getProfile } from '@/lib/auth/guards'
import {
  listCategoriesForOrg,
  createCategory,
} from '@/lib/db/queries/categories'

export async function GET() {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const categories = await listCategoriesForOrg(profile.orgId)
    return NextResponse.json(categories)
  } catch (error) {
    console.error('GET /api/sops/categories error:', error)
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}

const createCategorySchema = z.object({ name: z.string().min(1).max(80) })

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const parsed = createCategorySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
    }

    try {
      const category = await createCategory({ orgId: profile.orgId, name: parsed.data.name.trim() })
      return NextResponse.json(category, { status: 201 })
    } catch (e: unknown) {
      // Postgres unique violation
      if (e && typeof e === 'object' && 'code' in e && e.code === '23505') {
        return NextResponse.json({ error: 'A category with that name already exists' }, { status: 409 })
      }
      throw e
    }
  } catch (error) {
    console.error('POST /api/sops/categories error:', error)
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}
