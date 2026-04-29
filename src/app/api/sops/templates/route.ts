import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getProfile } from '@/lib/auth/guards'
import {
  getTemplatesForOrg,
  createTemplate,
  createSection,
  createItem,
} from '@/lib/db/queries/sops'

// ---------------------------------------------------------------------------
// GET /api/sops/templates — List SOP templates for the org
// ---------------------------------------------------------------------------

export async function GET() {
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

    const templates = await getTemplatesForOrg(profile.orgId)
    return NextResponse.json(templates)
  } catch (error) {
    console.error('GET /api/sops/templates error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/sops/templates — Create SOP template with sections + items
// ---------------------------------------------------------------------------

const createSopItemSchema = z.object({
  content: z.string().min(1),
  sortOrder: z.number().int().min(0),
})

const createSopSectionSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().min(0),
  items: z.array(createSopItemSchema),
})

const createSopTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().uuid(),
  sections: z.array(createSopSectionSchema).optional(),
  ungroupedItems: z.array(createSopItemSchema).optional(),
})

export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const parsed = createSopTemplateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { name, description, categoryId, sections, ungroupedItems } = parsed.data

    // Validate category belongs to the same org
    const { getCategoryById } = await import('@/lib/db/queries/categories')
    const category = await getCategoryById(categoryId)
    if (!category || category.orgId !== profile.orgId) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    // Create template
    const template = await createTemplate({
      orgId: profile.orgId,
      name,
      description: description ?? null,
      categoryId,
    })

    // Create sections + their items
    if (sections) {
      for (const sec of sections) {
        const section = await createSection({
          templateId: template.id,
          name: sec.name,
          sortOrder: sec.sortOrder,
        })
        for (const item of sec.items) {
          await createItem({
            templateId: template.id,
            sectionId: section.id,
            content: item.content,
            sortOrder: item.sortOrder,
          })
        }
      }
    }

    // Create ungrouped items
    if (ungroupedItems) {
      for (const item of ungroupedItems) {
        await createItem({
          templateId: template.id,
          sectionId: null,
          content: item.content,
          sortOrder: item.sortOrder,
        })
      }
    }

    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    console.error('POST /api/sops/templates error:', error)
    return NextResponse.json(
      { error: 'Failed to create template' },
      { status: 500 }
    )
  }
}
