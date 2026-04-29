import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getProfile } from '@/lib/auth/guards'
import {
  updateCategory,
  deleteCategory,
  countTemplatesUsingCategory,
  getCategoryById,
} from '@/lib/db/queries/categories'

const renameSchema = z.object({ name: z.string().min(1).max(80) })

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const existing = await getCategoryById(id)
    if (!existing || existing.orgId !== profile.orgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = renameSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
    }

    try {
      const updated = await updateCategory(id, { name: parsed.data.name.trim() })
      return NextResponse.json(updated)
    } catch (e: any) {
      if (e?.code === '23505') {
        return NextResponse.json({ error: 'A category with that name already exists' }, { status: 409 })
      }
      throw e
    }
  } catch (error) {
    console.error('PATCH /api/sops/categories/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const existing = await getCategoryById(id)
    if (!existing || existing.orgId !== profile.orgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const refCount = await countTemplatesUsingCategory(id)
    if (refCount > 0) {
      return NextResponse.json(
        { error: 'Category in use', templateCount: refCount },
        { status: 409 }
      )
    }

    await deleteCategory(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/sops/categories/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
  }
}
