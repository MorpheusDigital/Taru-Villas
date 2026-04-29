import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getProfile } from '@/lib/auth/guards'
import {
  getTemplateById,
  updateTemplate,
  deleteTemplate,
  createSection,
  updateSection,
  deleteSection,
  createItem,
  updateItem,
  deleteItem,
} from '@/lib/db/queries/sops'

type Params = { params: Promise<{ id: string }> }

// ---------------------------------------------------------------------------
// GET /api/sops/templates/[id] — Get template with content
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const template = await getTemplateById(id)
    if (!template) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(template)
  } catch (error) {
    console.error('GET /api/sops/templates/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch template' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/sops/templates/[id] — Update template + full content sync
// ---------------------------------------------------------------------------

const updateItemSchema = z.object({
  id: z.string().optional(), // existing item ID (omit for new)
  content: z.string().min(1),
  sortOrder: z.number().int().min(0),
})

const updateSectionSchema = z.object({
  id: z.string().optional(), // existing section ID (omit for new)
  name: z.string().min(1),
  sortOrder: z.number().int().min(0),
  items: z.array(updateItemSchema),
})

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  sections: z.array(updateSectionSchema).optional(),
  ungroupedItems: z.array(updateItemSchema).optional(),
})

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const existing = await getTemplateById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updateTemplateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { name, description, isActive, categoryId, sections, ungroupedItems } = parsed.data

    // Validate category FK if a non-null value was provided
    if (categoryId) {
      const { getCategoryById } = await import('@/lib/db/queries/categories')
      const category = await getCategoryById(categoryId)
      if (!category || category.orgId !== profile.orgId) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
      }
    }

    // Update template metadata
    if (name !== undefined || description !== undefined || isActive !== undefined || categoryId !== undefined) {
      await updateTemplate(id, {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
        ...(categoryId !== undefined && { categoryId }),
      })
    }

    // Sync sections + items if provided (full replacement strategy)
    if (sections !== undefined || ungroupedItems !== undefined) {
      // Track which section/item IDs survive
      const keepSectionIds = new Set<string>()
      const keepItemIds = new Set<string>()

      // Process sections
      if (sections) {
        for (const sec of sections) {
          let sectionId: string
          if (sec.id) {
            // Update existing section
            await updateSection(sec.id, {
              name: sec.name,
              sortOrder: sec.sortOrder,
            })
            sectionId = sec.id
          } else {
            // Create new section
            const newSec = await createSection({
              templateId: id,
              name: sec.name,
              sortOrder: sec.sortOrder,
            })
            sectionId = newSec.id
          }
          keepSectionIds.add(sectionId)

          // Process section items
          for (const item of sec.items) {
            if (item.id) {
              await updateItem(item.id, {
                content: item.content,
                sortOrder: item.sortOrder,
                sectionId,
              })
              keepItemIds.add(item.id)
            } else {
              const newItem = await createItem({
                templateId: id,
                sectionId,
                content: item.content,
                sortOrder: item.sortOrder,
              })
              keepItemIds.add(newItem.id)
            }
          }
        }
      }

      // Process ungrouped items
      if (ungroupedItems) {
        for (const item of ungroupedItems) {
          if (item.id) {
            await updateItem(item.id, {
              content: item.content,
              sortOrder: item.sortOrder,
              sectionId: null,
            })
            keepItemIds.add(item.id)
          } else {
            const newItem = await createItem({
              templateId: id,
              sectionId: null,
              content: item.content,
              sortOrder: item.sortOrder,
            })
            keepItemIds.add(newItem.id)
          }
        }
      }

      // Delete items not in keepItemIds
      const allItems = [
        ...existing.ungroupedItems,
        ...existing.sections.flatMap((s) => s.items),
      ]
      for (const item of allItems) {
        if (!keepItemIds.has(item.id)) {
          await deleteItem(item.id)
        }
      }

      // Delete sections not in keepSectionIds
      for (const sec of existing.sections) {
        if (!keepSectionIds.has(sec.id)) {
          await deleteSection(sec.id)
        }
      }
    }

    const updated = await getTemplateById(id)
    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/sops/templates/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to update template' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/sops/templates/[id] — Delete template (cascade)
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const profile = await getProfile()
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!profile.isActive) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    await deleteTemplate(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/sops/templates/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to delete template' },
      { status: 500 }
    )
  }
}
