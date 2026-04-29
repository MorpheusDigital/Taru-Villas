# SOP Categories + Multi-Assign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add org-level categories to SOP templates (managed at `/sops/categories`, surfaced as section headers on `/sops` My Checklists) and a multi-assign matrix dialog that lets admins create N×M `(user, property)` assignments for a template in one submit.

**Architecture:** New `sop_categories` table FK'd from `sop_templates`. Categories are managed via standard CRUD endpoints + a drag-reorder endpoint, surfaced as a new admin-only tab. Multi-assign is a UI/API batch layer over the existing `(templateId, propertyId, userId)` unique constraint on `sop_assignments` — no schema change for the matrix itself. The matrix dialog renders a cross-product, fetches existing pairs to grey out, and posts a `rows[]` payload to a new batch endpoint that wraps inserts in a transaction with constraint-violation tolerance.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM, postgres.js, Zod v4, shadcn/ui (Popover + Command primitives for combobox), `@dnd-kit/core` for drag-reorder if not already present (otherwise native HTML5 drag), Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-04-29-sop-categories-and-multi-assign-design.md`

**Verification convention:** This codebase has no automated test suite. Each task ends with `npm run build` (acts as typecheck) + manual verification + commit. Build must succeed before commit.

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `src/lib/db/schema.ts` | Modify | Add `sopCategories` table + relations; add `categoryId` to `sopTemplates` |
| `drizzle/<timestamp>_sop_categories.sql` | Create | Generated migration |
| `src/lib/db/queries/categories.ts` | Create | Category CRUD + reorder + batchCreateAssignments + getExistingAssignmentPairs |
| `src/lib/db/queries/sops.ts` | Modify | Update `getAssignmentsForUser` to include category data |
| `src/lib/sops/types.ts` | Modify | Add category fields to `SopAssignmentForUser` |
| `src/app/api/sops/categories/route.ts` | Create | GET (list), POST (create) |
| `src/app/api/sops/categories/[id]/route.ts` | Create | PATCH (rename), DELETE |
| `src/app/api/sops/categories/reorder/route.ts` | Create | PATCH (reorder all) |
| `src/app/api/sops/assignments/batch/route.ts` | Create | POST batch create |
| `src/app/api/sops/assignments/existing/route.ts` | Create | GET existing `(userId, propertyId)` pairs for a template |
| `src/app/api/sops/templates/route.ts` | Modify | Accept `categoryId` |
| `src/app/api/sops/templates/[id]/route.ts` | Modify | Accept `categoryId` |
| `src/components/sops/sops-area-tabs.tsx` | Modify | Add Categories tab |
| `src/app/(portal)/sops/categories/page.tsx` | Create | Admin page (server component) |
| `src/components/sops/sop-categories-management.tsx` | Create | List, drag-reorder, inline rename, delete with conflict UI |
| `src/components/admin/sop-builder.tsx` | Modify | Category combobox with inline create |
| `src/components/admin/sop-multi-assign-dialog.tsx` | Create | Chip pickers, default schedule, matrix, conflict display, submit |
| `src/components/admin/sop-assignments.tsx` | Modify | Replace inline Add form with button → opens `SopMultiAssignDialog` |
| `src/components/sops/my-sops-client.tsx` | Modify | Group rendering by category with section headers |

---

## Task 1: Add `sopCategories` schema + `categoryId` on `sopTemplates`

**Files:**
- Modify: `src/lib/db/schema.ts:575-595` (sopTemplates definition + add new table just before it)

- [ ] **Step 1: Add the `sopCategories` table and relations**

In `src/lib/db/schema.ts`, locate the `sopTemplates` table (around line 575). Insert this block **above** `sopTemplates`:

```ts
// ---------------------------------------------------------------------------
// SOP Categories (org-level grouping for templates)
// ---------------------------------------------------------------------------
export const sopCategories = pgTable(
  'sop_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('sop_categories_org_name_unique').on(table.orgId, table.name),
  ]
)

export const sopCategoriesRelations = relations(sopCategories, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [sopCategories.orgId],
    references: [organizations.id],
  }),
  templates: many(sopTemplates),
}))
```

- [ ] **Step 2: Add `categoryId` to `sopTemplates`**

Edit the `sopTemplates` table (around line 575-585). Add the field between `description` and `isActive`:

```ts
export const sopTemplates = pgTable('sop_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  categoryId: uuid('category_id').references(() => sopCategories.id, {
    onDelete: 'restrict',
  }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

- [ ] **Step 3: Add the category relation to `sopTemplatesRelations`**

Update `sopTemplatesRelations` (immediately below the table) to include the category:

```ts
export const sopTemplatesRelations = relations(sopTemplates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [sopTemplates.orgId],
    references: [organizations.id],
  }),
  category: one(sopCategories, {
    fields: [sopTemplates.categoryId],
    references: [sopCategories.id],
  }),
  sections: many(sopSections),
  items: many(sopItems),
  assignments: many(sopAssignments),
}))
```

- [ ] **Step 4: Add type exports**

Find the type-exports block near the bottom of `schema.ts` (around line 897). Add right after `SopItemCompletion` exports:

```ts
export type SopCategory = typeof sopCategories.$inferSelect
export type NewSopCategory = typeof sopCategories.$inferInsert
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```
Expected: build succeeds. If TypeScript complains about `categoryId` being missing in places that select all template fields, those are real call sites — note them but don't fix yet (they'll be touched in later tasks).

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(sops): add sop_categories table and category_id on sop_templates"
```

---

## Task 2: Generate and run the Drizzle migration

**Files:**
- Create: `drizzle/<timestamp>_*.sql` (auto-generated)

- [ ] **Step 1: Generate the migration**

```bash
npx drizzle-kit generate
```
Expected: a new SQL file appears in `drizzle/` with statements creating `sop_categories` and adding `category_id` to `sop_templates` with `ON DELETE RESTRICT`. Open the file and confirm both statements are present and correct.

- [ ] **Step 2: Run the migration against the database**

```bash
npx drizzle-kit migrate
```
Expected: migration applies successfully.

- [ ] **Step 3: Verify in Drizzle Studio (optional but recommended)**

```bash
npx drizzle-kit studio
```
Open the studio, confirm `sop_categories` table exists and `sop_templates.category_id` column is present and nullable. Close studio.

- [ ] **Step 4: Commit**

```bash
git add drizzle/
git commit -m "feat(sops): drizzle migration for categories"
```

---

## Task 3: Category query functions

**Files:**
- Create: `src/lib/db/queries/categories.ts`

- [ ] **Step 1: Create the file with CRUD + reorder helpers**

Create `src/lib/db/queries/categories.ts`:

```ts
import { eq, and, asc, sql, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  sopCategories,
  sopTemplates,
  type SopCategory,
  type NewSopCategory,
} from '@/lib/db/schema'

export type SopCategoryWithCount = SopCategory & { templateCount: number }

export async function listCategoriesForOrg(
  orgId: string
): Promise<SopCategoryWithCount[]> {
  const rows = await db
    .select({
      category: sopCategories,
      templateCount: sql<number>`count(${sopTemplates.id})::int`.as('template_count'),
    })
    .from(sopCategories)
    .leftJoin(sopTemplates, eq(sopTemplates.categoryId, sopCategories.id))
    .where(eq(sopCategories.orgId, orgId))
    .groupBy(sopCategories.id)
    .orderBy(asc(sopCategories.sortOrder), asc(sopCategories.name))

  return rows.map((r) => ({ ...r.category, templateCount: Number(r.templateCount) }))
}

export async function createCategory(
  data: Pick<NewSopCategory, 'orgId' | 'name'>
): Promise<SopCategory> {
  // Place new categories at the end of the sort order
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${sopCategories.sortOrder}), -1)::int` })
    .from(sopCategories)
    .where(eq(sopCategories.orgId, data.orgId))

  const results = await db
    .insert(sopCategories)
    .values({ ...data, sortOrder: Number(maxOrder) + 1 })
    .returning()
  return results[0]
}

export async function updateCategory(
  id: string,
  data: { name: string }
): Promise<SopCategory | undefined> {
  const results = await db
    .update(sopCategories)
    .set({ name: data.name, updatedAt: new Date() })
    .where(eq(sopCategories.id, id))
    .returning()
  return results[0]
}

export async function deleteCategory(id: string): Promise<void> {
  await db.delete(sopCategories).where(eq(sopCategories.id, id))
}

export async function countTemplatesUsingCategory(id: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sopTemplates)
    .where(eq(sopTemplates.categoryId, id))
  return Number(count)
}

export async function reorderCategories(
  orgId: string,
  orderedIds: string[]
): Promise<void> {
  if (orderedIds.length === 0) return
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(sopCategories)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(and(eq(sopCategories.id, orderedIds[i]), eq(sopCategories.orgId, orgId)))
    }
  })
}

export async function getCategoryById(
  id: string
): Promise<SopCategory | undefined> {
  const results = await db
    .select()
    .from(sopCategories)
    .where(eq(sopCategories.id, id))
    .limit(1)
  return results[0]
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/queries/categories.ts
git commit -m "feat(sops): category query helpers"
```

---

## Task 4: Categories list + create API route

**Files:**
- Create: `src/app/api/sops/categories/route.ts`

- [ ] **Step 1: Implement GET + POST**

Create `src/app/api/sops/categories/route.ts`:

```ts
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
    } catch (e: any) {
      // Postgres unique violation
      if (e?.code === '23505') {
        return NextResponse.json({ error: 'A category with that name already exists' }, { status: 409 })
      }
      throw e
    }
  } catch (error) {
    console.error('POST /api/sops/categories error:', error)
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Manual smoke test**

Start dev server (`npm run dev`), sign in as admin, hit:
```bash
curl -b "<your auth cookie>" http://localhost:3000/api/sops/categories
```
Expected: returns `[]` (no categories yet) with 200.

```bash
curl -X POST -b "<auth>" -H "Content-Type: application/json" \
  -d '{"name":"Morning"}' http://localhost:3000/api/sops/categories
```
Expected: returns the new row with `id`, `name: "Morning"`, `sortOrder: 0`. Re-running the same POST returns 409.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sops/categories/route.ts
git commit -m "feat(sops): categories list + create API"
```

---

## Task 5: Category rename + delete API route

**Files:**
- Create: `src/app/api/sops/categories/[id]/route.ts`

- [ ] **Step 1: Implement PATCH + DELETE**

Create `src/app/api/sops/categories/[id]/route.ts`:

```ts
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
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Manual smoke test**

With a category created in Task 4, rename it:
```bash
curl -X PATCH -b "<auth>" -H "Content-Type: application/json" \
  -d '{"name":"Morning Routine"}' http://localhost:3000/api/sops/categories/<id>
```
Expected: 200 with the renamed row. Then delete it:
```bash
curl -X DELETE -b "<auth>" http://localhost:3000/api/sops/categories/<id>
```
Expected: 200 `{ "ok": true }`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sops/categories/\[id\]/route.ts
git commit -m "feat(sops): category rename and delete with conflict check"
```

---

## Task 6: Category reorder API route

**Files:**
- Create: `src/app/api/sops/categories/reorder/route.ts`

- [ ] **Step 1: Implement PATCH**

Create `src/app/api/sops/categories/reorder/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getProfile } from '@/lib/auth/guards'
import { reorderCategories } from '@/lib/db/queries/categories'

const reorderSchema = z.object({
  order: z.array(z.string().uuid()).min(1),
})

export async function PATCH(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const parsed = reorderSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
    }

    await reorderCategories(profile.orgId, parsed.data.order)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('PATCH /api/sops/categories/reorder error:', error)
    return NextResponse.json({ error: 'Failed to reorder categories' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sops/categories/reorder/route.ts
git commit -m "feat(sops): category reorder API"
```

---

## Task 7: Add Categories tab to SopsAreaTabs

**Files:**
- Modify: `src/components/sops/sops-area-tabs.tsx`

- [ ] **Step 1: Add the tab definition**

Edit the `tabs` array in `src/components/sops/sops-area-tabs.tsx`. Insert the Categories tab **after** the existing Templates tab:

```ts
const tabs: Tab[] = [
  {
    label: 'My Checklists',
    href: '/sops',
    match: (p) => p === '/sops',
    roles: ['admin', 'property_manager', 'staff'],
  },
  {
    label: 'Progress',
    href: '/sops/dashboard',
    match: (p) => p.startsWith('/sops/dashboard'),
    roles: ['admin', 'property_manager'],
  },
  {
    label: 'Templates',
    href: '/sops/templates',
    match: (p) => p.startsWith('/sops/templates'),
    roles: ['admin'],
  },
  {
    label: 'Categories',
    href: '/sops/categories',
    match: (p) => p.startsWith('/sops/categories'),
    roles: ['admin'],
  },
]
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```
Expected: build succeeds. (The page itself doesn't exist yet — clicking the tab will 404 until Task 8.)

- [ ] **Step 3: Commit**

```bash
git add src/components/sops/sops-area-tabs.tsx
git commit -m "feat(sops): add Categories tab in admin nav"
```

---

## Task 8: Categories management page + UI

**Files:**
- Create: `src/app/(portal)/sops/categories/page.tsx`
- Create: `src/components/sops/sop-categories-management.tsx`

- [ ] **Step 1: Create the server page**

Create `src/app/(portal)/sops/categories/page.tsx`:

```tsx
import { requireRole } from '@/lib/auth/guards'
import { listCategoriesForOrg } from '@/lib/db/queries/categories'
import { SopCategoriesManagement } from '@/components/sops/sop-categories-management'
import { SopsAreaTabs } from '@/components/sops/sops-area-tabs'

export const dynamic = 'force-dynamic'

export default async function SopCategoriesPage() {
  const { profile } = await requireRole(['admin'])
  const categories = await listCategoriesForOrg(profile.orgId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">SOPs</h1>
      </div>
      <SopsAreaTabs />
      <SopCategoriesManagement initialCategories={categories} />
    </div>
  )
}
```

- [ ] **Step 2: Create the client component**

Create `src/components/sops/sop-categories-management.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { GripVertical, Pencil, Plus, Trash2, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import type { SopCategoryWithCount } from '@/lib/db/queries/categories'

interface Props {
  initialCategories: SopCategoryWithCount[]
}

export function SopCategoriesManagement({ initialCategories }: Props) {
  const [categories, setCategories] = useState(initialCategories)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    const res = await fetch('/api/sops/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? 'Failed to create category')
      return
    }
    const created = await res.json()
    setCategories([...categories, { ...created, templateCount: 0 }])
    setNewName('')
    setAdding(false)
  }

  async function handleRename(id: string) {
    const name = editName.trim()
    if (!name) return
    const res = await fetch(`/api/sops/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? 'Failed to rename category')
      return
    }
    const updated = await res.json()
    setCategories(categories.map((c) => (c.id === id ? { ...c, name: updated.name } : c)))
    setEditingId(null)
  }

  async function handleDelete(id: string) {
    const cat = categories.find((c) => c.id === id)
    if (!cat) return
    if (cat.templateCount > 0) {
      toast.error(`${cat.templateCount} template(s) use this category. Reassign them first.`)
      return
    }
    if (!confirm(`Delete category "${cat.name}"?`)) return
    const res = await fetch(`/api/sops/categories/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (res.status === 409) {
        toast.error(`${body.templateCount ?? 'Some'} template(s) use this category. Reassign them first.`)
      } else {
        toast.error(body.error ?? 'Failed to delete category')
      }
      return
    }
    setCategories(categories.filter((c) => c.id !== id))
  }

  async function persistOrder(next: SopCategoryWithCount[]) {
    const order = next.map((c) => c.id)
    const res = await fetch('/api/sops/categories/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    })
    if (!res.ok) {
      toast.error('Failed to save order')
    }
  }

  function handleDragStart(id: string) {
    setDraggingId(id)
  }

  function handleDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault()
    if (!draggingId || draggingId === overId) return
    const next = [...categories]
    const fromIdx = next.findIndex((c) => c.id === draggingId)
    const toIdx = next.findIndex((c) => c.id === overId)
    if (fromIdx < 0 || toIdx < 0) return
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    setCategories(next)
  }

  function handleDragEnd() {
    if (draggingId) {
      startTransition(() => persistOrder(categories))
    }
    setDraggingId(null)
  }

  return (
    <div className="max-w-2xl space-y-3">
      <div className="rounded-lg border bg-card">
        {categories.length === 0 && !adding && (
          <p className="p-6 text-sm text-muted-foreground">No categories yet. Add one below.</p>
        )}
        <ul>
          {categories.map((cat) => (
            <li
              key={cat.id}
              draggable
              onDragStart={() => handleDragStart(cat.id)}
              onDragOver={(e) => handleDragOver(e, cat.id)}
              onDragEnd={handleDragEnd}
              className="flex items-center gap-2 border-b p-3 last:border-b-0"
            >
              <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
              {editingId === cat.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(cat.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    autoFocus
                    className="flex-1"
                  />
                  <Button size="sm" variant="ghost" onClick={() => handleRename(cat.id)}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{cat.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {cat.templateCount}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(cat.id)
                      setEditName(cat.name)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(cat.id)}
                    disabled={cat.templateCount > 0}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
        {adding && (
          <div className="flex items-center gap-2 border-t p-3">
            <Input
              placeholder="Category name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') {
                  setAdding(false)
                  setNewName('')
                }
              }}
              autoFocus
              className="flex-1"
            />
            <Button size="sm" onClick={handleCreate}>Create</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName('') }}>
              Cancel
            </Button>
          </div>
        )}
      </div>
      {!adding && (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add category
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```
Expected: build succeeds. If `sonner` is not installed, check `package.json` — it's likely already there since it's the standard shadcn toast. If missing, install it: `npm install sonner` (commit the lockfile change separately).

- [ ] **Step 4: Manual verification**

Run `npm run dev`, navigate to `/sops/categories` as admin. Confirm:
- Empty-state copy renders.
- "Add category" button shows the inline input.
- Creating a category appends it to the list.
- Renaming via pencil icon works.
- Drag handle reorders rows; refreshing the page preserves the new order.
- Delete is disabled when `templateCount > 0`.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(portal\)/sops/categories/page.tsx src/components/sops/sop-categories-management.tsx
git commit -m "feat(sops): categories management page with drag-reorder"
```

---

## Task 9: Add `categoryId` to template create/edit API

**Files:**
- Modify: `src/app/api/sops/templates/route.ts`
- Modify: `src/app/api/sops/templates/[id]/route.ts`

Note: `createTemplate` and `updateTemplate` in `src/lib/db/queries/sops.ts:177-194` accept `NewSopTemplate` and `Partial<Omit<NewSopTemplate, 'id'>>` respectively. After Task 1 added `categoryId` to the table, those types automatically include it — no code change needed in the query helpers.

- [ ] **Step 1: Update the templates POST schema**

In `src/app/api/sops/templates/route.ts`, update `createSopTemplateSchema`:

```ts
const createSopTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().uuid(), // required for new templates
  sections: z.array(createSopSectionSchema).optional(),
  ungroupedItems: z.array(createSopItemSchema).optional(),
})
```

In the POST handler body, after `parsed.data` is destructured:

```ts
const { name, description, categoryId, sections, ungroupedItems } = parsed.data

// Validate category belongs to the same org
const { getCategoryById } = await import('@/lib/db/queries/categories')
const category = await getCategoryById(categoryId)
if (!category || category.orgId !== profile.orgId) {
  return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
}

const template = await createTemplate({
  orgId: profile.orgId,
  name,
  description: description ?? null,
  categoryId,
})
```

- [ ] **Step 2: Update the templates PATCH schema**

Open `src/app/api/sops/templates/[id]/route.ts`. Find the existing update schema (likely named `updateSopTemplateSchema` or similar) and add a `categoryId` field:

```ts
// add to the existing object schema
categoryId: z.string().uuid().nullable().optional(),
```

In the PATCH handler, after Zod parsing, validate the category FK if present (and not null):

```ts
if (parsed.data.categoryId) {
  const { getCategoryById } = await import('@/lib/db/queries/categories')
  const category = await getCategoryById(parsed.data.categoryId)
  if (!category || category.orgId !== profile.orgId) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }
}
```

`null` is allowed (clears the category) and skips validation. The existing `updateTemplate(id, parsed.data)` call needs no change — `categoryId: null` will set the column to NULL.

- [ ] **Step 3: Verify build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sops/templates
git commit -m "feat(sops): templates API accepts categoryId"
```

---

## Task 10: Add category combobox to template builder

**Files:**
- Modify: `src/components/admin/sop-builder.tsx`

- [ ] **Step 1: Add the category combobox**

Open `src/components/admin/sop-builder.tsx`. Locate the form section where the template name and description inputs live. Add a category combobox above the name field.

The combobox uses the existing shadcn primitives (`Popover` + `Command`):

```tsx
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
```

Add state and effects to the component (near the existing form state):

```tsx
const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
const [categoryId, setCategoryId] = useState<string | null>(initialTemplate?.categoryId ?? null)
const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false)
const [creatingCategory, setCreatingCategory] = useState(false)
const [newCategoryName, setNewCategoryName] = useState('')

useEffect(() => {
  fetch('/api/sops/categories')
    .then((r) => r.ok ? r.json() : [])
    .then((data) => setCategories(data))
    .catch(() => setCategories([]))
}, [])

async function handleCreateCategory() {
  const name = newCategoryName.trim()
  if (!name) return
  const res = await fetch('/api/sops/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    toast.error(body.error ?? 'Failed to create category')
    return
  }
  const created = await res.json()
  setCategories([...categories, created])
  setCategoryId(created.id)
  setCreatingCategory(false)
  setNewCategoryName('')
  setCategoryPopoverOpen(false)
}
```

Render block (place above the name input):

```tsx
<div className="space-y-1.5">
  <label className="text-sm font-medium">Category <span className="text-destructive">*</span></label>
  <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
    <PopoverTrigger asChild>
      <Button variant="outline" role="combobox" className="w-full justify-between">
        {categoryId
          ? categories.find((c) => c.id === categoryId)?.name ?? 'Select category…'
          : 'Select category…'}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
      <Command>
        <CommandInput placeholder="Search categories…" />
        <CommandList>
          <CommandEmpty>No categories found.</CommandEmpty>
          <CommandGroup>
            {categories.map((c) => (
              <CommandItem
                key={c.id}
                value={c.name}
                onSelect={() => {
                  setCategoryId(c.id)
                  setCategoryPopoverOpen(false)
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', categoryId === c.id ? 'opacity-100' : 'opacity-0')} />
                {c.name}
              </CommandItem>
            ))}
          </CommandGroup>
          <div className="border-t p-2">
            {creatingCategory ? (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="New category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleCreateCategory()
                    }
                    if (e.key === 'Escape') {
                      setCreatingCategory(false)
                      setNewCategoryName('')
                    }
                  }}
                  autoFocus
                  className="flex-1"
                />
                <Button size="sm" onClick={handleCreateCategory}>Create</Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="w-full justify-start"
                onClick={() => setCreatingCategory(true)}
              >
                <Plus className="mr-2 h-4 w-4" /> Create new category…
              </Button>
            )}
          </div>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</div>
```

- [ ] **Step 2: Wire `categoryId` into the submit payload**

Find the existing submit handler in `sop-builder.tsx`. The POST/PATCH body should include `categoryId`:

```ts
const body = {
  name,
  description,
  categoryId, // new
  sections,
  ungroupedItems,
}
```

Add a client-side guard for new templates:

```ts
if (!initialTemplate && !categoryId) {
  toast.error('Please select a category')
  return
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Manual verification**

In `/sops/templates/new`, the category combobox should:
- Show existing categories
- Reject submit until one is picked (toast appears)
- "+ Create new category…" creates and selects the new one
- Saving the template persists the `categoryId` (verify in Drizzle Studio)

For an existing template, editing should pre-fill the current category.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/sop-builder.tsx
git commit -m "feat(sops): category combobox in template form with inline create"
```

---

## Task 11: Group `/sops` My Checklists by category

**Files:**
- Modify: `src/lib/sops/types.ts` — extend `SopAssignmentForUser`
- Modify: `src/lib/db/queries/sops.ts:288-379` — `getAssignmentsForUser`
- Modify: `src/components/sops/my-sops-client.tsx`

- [ ] **Step 1: Extend the type**

In `src/lib/sops/types.ts`, update `SopAssignmentForUser` to include category data:

```ts
import type {
  SopTemplate,
  SopSection,
  SopItem,
  SopAssignment,
  SopCompletion,
  SopItemCompletion,
  SopCategory,
  Property,
  Profile,
} from '@/lib/db/schema'

export type SopAssignmentForUser = SopAssignment & {
  template: SopTemplate & { items: SopItem[] }
  property: Property
  category: { id: string; name: string; sortOrder: number } | null
  currentCompletion: SopCompletionWithItems | null
  currentDueDate: string
}
```

- [ ] **Step 2: Update `getAssignmentsForUser` to join categories**

In `src/lib/db/queries/sops.ts`, modify the main select in `getAssignmentsForUser` (~line 291). Add a left join to `sopCategories`:

```ts
import { sopCategories } from '@/lib/db/schema'

const rows = await db
  .select({
    assignment: sopAssignments,
    template: sopTemplates,
    property: properties,
    category: sopCategories,
  })
  .from(sopAssignments)
  .innerJoin(sopTemplates, eq(sopAssignments.templateId, sopTemplates.id))
  .innerJoin(properties, eq(sopAssignments.propertyId, properties.id))
  .leftJoin(sopCategories, eq(sopTemplates.categoryId, sopCategories.id))
  .where(
    and(
      eq(sopAssignments.userId, userId),
      eq(sopAssignments.isActive, true),
      eq(sopTemplates.isActive, true)
    )
  )
  .orderBy(asc(properties.name), asc(sopTemplates.name))
```

Then in the final `return rows.map((r, i) => { ... })` block, add the category mapping:

```ts
return rows.map((r, i) => {
  const dueDate = dueDates[i]
  const completion = completionMap.get(`${r.assignment.id}_${dueDate}`) ?? null

  return {
    ...r.assignment,
    template: {
      ...r.template,
      items: itemsByTemplate.get(r.template.id) ?? [],
    },
    property: r.property,
    category: r.category
      ? { id: r.category.id, name: r.category.name, sortOrder: r.category.sortOrder }
      : null,
    currentDueDate: dueDate,
    currentCompletion: completion
      ? { ...completion, itemCompletions: itemCompletionsMap.get(completion.id) ?? [] }
      : null,
  }
})
```

- [ ] **Step 3: Group rendering in `my-sops-client.tsx`**

Open `src/components/sops/my-sops-client.tsx`. Find where the assignments list is rendered. Before the render, group by category:

```ts
type Group = {
  key: string
  label: string
  sortOrder: number
  items: typeof assignments
}

const groups = useMemo(() => {
  const map = new Map<string, Group>()
  for (const a of assignments) {
    const key = a.category?.id ?? '__uncategorized__'
    const label = a.category?.name ?? 'Uncategorized'
    const sortOrder = a.category?.sortOrder ?? Number.MAX_SAFE_INTEGER
    if (!map.has(key)) {
      map.set(key, { key, label, sortOrder, items: [] })
    }
    map.get(key)!.items.push(a)
  }
  return Array.from(map.values()).sort((a, b) => a.sortOrder - b.sortOrder)
}, [assignments])
```

Replace the existing flat `.map(...)` over `assignments` with a nested render:

```tsx
{groups.map((group) => (
  <section key={group.key} className="space-y-3">
    <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground/80">
      {group.label}
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
        {group.items.length}
      </span>
    </h2>
    <div className="space-y-2">
      {group.items.map((assignment) => (
        // existing row component / markup
      ))}
    </div>
  </section>
))}
```

(Read the existing render block first to preserve its inner card markup.)

- [ ] **Step 4: Verify build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Manual verification**

Sign in as a user with assignments. On `/sops`:
- Items appear under category headers in the order defined on `/sops/categories`.
- A template without a category renders under "Uncategorized" at the bottom.
- Count badge matches the number of items in each group.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sops/types.ts src/lib/db/queries/sops.ts src/components/sops/my-sops-client.tsx
git commit -m "feat(sops): group My Checklists by category"
```

---

## Task 12: `getExistingAssignmentPairs` query + endpoint

**Files:**
- Modify: `src/lib/db/queries/categories.ts` (or new `src/lib/db/queries/assignments.ts`) — add the query
- Create: `src/app/api/sops/assignments/existing/route.ts`

- [ ] **Step 1: Add the query helper**

Append to `src/lib/db/queries/categories.ts` (or place in `src/lib/db/queries/sops.ts` — pick whichever file already imports from `@/lib/db/schema` and `sopAssignments`; the spec is agnostic about location). Recommended: add to `src/lib/db/queries/sops.ts` to keep assignment-related queries together:

```ts
export async function getExistingAssignmentPairs(
  templateId: string
): Promise<Array<{ userId: string; propertyId: string }>> {
  const rows = await db
    .select({ userId: sopAssignments.userId, propertyId: sopAssignments.propertyId })
    .from(sopAssignments)
    .where(eq(sopAssignments.templateId, templateId))
  return rows
}
```

- [ ] **Step 2: Create the API route**

Create `src/app/api/sops/assignments/existing/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/guards'
import { getExistingAssignmentPairs } from '@/lib/db/queries/sops'

export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const templateId = request.nextUrl.searchParams.get('templateId')
    if (!templateId) {
      return NextResponse.json({ error: 'templateId is required' }, { status: 400 })
    }

    const pairs = await getExistingAssignmentPairs(templateId)
    return NextResponse.json(pairs)
  } catch (error) {
    console.error('GET /api/sops/assignments/existing error:', error)
    return NextResponse.json({ error: 'Failed to fetch existing assignments' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/queries/sops.ts src/app/api/sops/assignments/existing/route.ts
git commit -m "feat(sops): endpoint for existing assignment pairs"
```

---

## Task 13: `batchCreateAssignments` query helper

**Files:**
- Modify: `src/lib/db/queries/sops.ts`

- [ ] **Step 1: Add the helper**

Append to `src/lib/db/queries/sops.ts`:

```ts
export interface BatchAssignmentRow {
  templateId: string
  userId: string
  propertyId: string
  frequency: 'daily' | 'weekly' | 'monthly'
  deadlineTime: string
  deadlineDay: number | null
  notifyOnOverdue: boolean
}

export async function batchCreateAssignments(
  rows: BatchAssignmentRow[]
): Promise<{ created: number; skipped: number }> {
  if (rows.length === 0) return { created: 0, skipped: 0 }

  let created = 0
  let skipped = 0

  for (const row of rows) {
    try {
      await db.insert(sopAssignments).values(row)
      created++
    } catch (e: any) {
      if (e?.code === '23505') {
        skipped++
      } else {
        throw e
      }
    }
  }

  return { created, skipped }
}
```

Note: each insert is its own implicit transaction. Wrapping all inserts in a single explicit transaction would roll back the entire batch on the first unique violation, which is the wrong behavior — the unique constraint is the dedup mechanism, not a fatal error.

- [ ] **Step 2: Verify build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/queries/sops.ts
git commit -m "feat(sops): batch create assignments helper"
```

---

## Task 14: Batch assignments API route

**Files:**
- Create: `src/app/api/sops/assignments/batch/route.ts`

- [ ] **Step 1: Implement POST**

Create `src/app/api/sops/assignments/batch/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getProfile } from '@/lib/auth/guards'
import { batchCreateAssignments, type BatchAssignmentRow } from '@/lib/db/queries/sops'

const rowSchema = z.object({
  userId: z.string().uuid(),
  propertyId: z.string().uuid(),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  deadlineTime: z.string().regex(/^\d{2}:\d{2}$/),
  deadlineDay: z.number().int().min(1).max(31).nullable(),
  notifyOnOverdue: z.boolean(),
})

const batchSchema = z.object({
  templateId: z.string().uuid(),
  rows: z.array(rowSchema).min(1).max(200),
})

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const parsed = batchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten() }, { status: 400 })
    }

    const rows: BatchAssignmentRow[] = parsed.data.rows.map((r) => ({
      templateId: parsed.data.templateId,
      userId: r.userId,
      propertyId: r.propertyId,
      frequency: r.frequency,
      deadlineTime: r.deadlineTime,
      deadlineDay: r.deadlineDay,
      notifyOnOverdue: r.notifyOnOverdue,
    }))

    const result = await batchCreateAssignments(rows)
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('POST /api/sops/assignments/batch error:', error)
    return NextResponse.json({ error: 'Failed to create assignments' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Manual smoke test (optional, can defer to Task 16)**

```bash
curl -X POST -b "<auth>" -H "Content-Type: application/json" \
  -d '{"templateId":"<id>","rows":[{"userId":"<u>","propertyId":"<p>","frequency":"daily","deadlineTime":"09:00","deadlineDay":null,"notifyOnOverdue":false}]}' \
  http://localhost:3000/api/sops/assignments/batch
```
Expected: `{ "created": 1, "skipped": 0 }` on first call, `{ "created": 0, "skipped": 1 }` on second.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sops/assignments/batch/route.ts
git commit -m "feat(sops): batch assignments API"
```

---

## Task 15: Multi-assign dialog component (chip pickers + matrix + submit)

**Files:**
- Create: `src/components/admin/sop-multi-assign-dialog.tsx`

- [ ] **Step 1: Create the component skeleton**

Create `src/components/admin/sop-multi-assign-dialog.tsx`. This is the largest file in the plan (~250-300 lines) — implement in one go since the pieces are tightly coupled.

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Profile, Property } from '@/lib/db/schema'

type Frequency = 'daily' | 'weekly' | 'monthly'

interface RowState {
  userId: string
  propertyId: string
  frequency: Frequency
  deadlineTime: string
  deadlineDay: number | null
  exists: boolean
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string
  users: Profile[]
  properties: Property[]
  onCreated: () => void
}

const DAYS_OF_WEEK = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
]

export function SopMultiAssignDialog({
  open,
  onOpenChange,
  templateId,
  users,
  properties,
  onCreated,
}: Props) {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([])
  const [defaultFrequency, setDefaultFrequency] = useState<Frequency>('daily')
  const [defaultTime, setDefaultTime] = useState('09:00')
  const [defaultDay, setDefaultDay] = useState<number | null>(null)
  const [notifyOnOverdue, setNotifyOnOverdue] = useState(false)
  const [rows, setRows] = useState<RowState[]>([])
  const [existingPairs, setExistingPairs] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelectedUserIds([])
      setSelectedPropertyIds([])
      setDefaultFrequency('daily')
      setDefaultTime('09:00')
      setDefaultDay(null)
      setNotifyOnOverdue(false)
      setRows([])
      // Fetch existing pairs
      fetch(`/api/sops/assignments/existing?templateId=${templateId}`)
        .then((r) => r.ok ? r.json() : [])
        .then((pairs: Array<{ userId: string; propertyId: string }>) => {
          setExistingPairs(new Set(pairs.map((p) => `${p.userId}|${p.propertyId}`)))
        })
        .catch(() => setExistingPairs(new Set()))
    }
  }, [open, templateId])

  // Regenerate matrix when chip selections change
  useEffect(() => {
    const next: RowState[] = []
    for (const userId of selectedUserIds) {
      for (const propertyId of selectedPropertyIds) {
        const exists = existingPairs.has(`${userId}|${propertyId}`)
        const prev = rows.find((r) => r.userId === userId && r.propertyId === propertyId)
        if (prev && !exists) {
          // Preserve previous override
          next.push(prev)
        } else {
          next.push({
            userId,
            propertyId,
            frequency: defaultFrequency,
            deadlineTime: defaultTime,
            deadlineDay: defaultFrequency === 'daily' ? null : defaultDay,
            exists,
          })
        }
      }
    }
    setRows(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserIds, selectedPropertyIds, existingPairs])

  function applyDefaultsToAll() {
    setRows(rows.map((r) =>
      r.exists
        ? r
        : {
            ...r,
            frequency: defaultFrequency,
            deadlineTime: defaultTime,
            deadlineDay: defaultFrequency === 'daily' ? null : defaultDay,
          }
    ))
  }

  function handleDefaultChange<K extends 'frequency' | 'time' | 'day'>(
    field: K,
    value: K extends 'frequency' ? Frequency : K extends 'time' ? string : number | null
  ) {
    if (field === 'frequency') setDefaultFrequency(value as Frequency)
    if (field === 'time') setDefaultTime(value as string)
    if (field === 'day') setDefaultDay(value as number | null)
    if (rows.some((r) => !r.exists) && confirm('Apply this default to all new rows?')) {
      // Compute next defaults including the change just made
      const nextFreq = field === 'frequency' ? (value as Frequency) : defaultFrequency
      const nextTime = field === 'time' ? (value as string) : defaultTime
      const nextDay = field === 'day' ? (value as number | null) : defaultDay
      setRows(rows.map((r) =>
        r.exists
          ? r
          : {
              ...r,
              frequency: nextFreq,
              deadlineTime: nextTime,
              deadlineDay: nextFreq === 'daily' ? null : nextDay,
            }
      ))
    }
  }

  function updateRow(idx: number, patch: Partial<RowState>) {
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const newRowCount = rows.filter((r) => !r.exists).length
  const skipCount = rows.filter((r) => r.exists).length

  async function handleSubmit() {
    const newRows = rows.filter((r) => !r.exists)
    if (newRows.length === 0) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/sops/assignments/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          rows: newRows.map((r) => ({
            userId: r.userId,
            propertyId: r.propertyId,
            frequency: r.frequency,
            deadlineTime: r.deadlineTime,
            deadlineDay: r.deadlineDay,
            notifyOnOverdue,
          })),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? 'Failed to create assignments')
        return
      }
      const result = await res.json()
      toast.success(`Created ${result.created} assignment${result.created === 1 ? '' : 's'}${result.skipped > 0 ? ` (${result.skipped} skipped)` : ''}`)
      onCreated()
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  function toggleUser(id: string) {
    setSelectedUserIds(selectedUserIds.includes(id)
      ? selectedUserIds.filter((u) => u !== id)
      : [...selectedUserIds, id])
  }
  function toggleProperty(id: string) {
    setSelectedPropertyIds(selectedPropertyIds.includes(id)
      ? selectedPropertyIds.filter((p) => p !== id)
      : [...selectedPropertyIds, id])
  }

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const propertyMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add Assignments</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Users */}
          <div>
            <Label>Users</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {users.map((u) => {
                const selected = selectedUserIds.includes(u.id)
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleUser(u.id)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:bg-muted'
                    )}
                  >
                    {u.fullName ?? u.email}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Properties */}
          <div>
            <Label>Properties</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {properties.map((p) => {
                const selected = selectedPropertyIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProperty(p.id)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:bg-muted'
                    )}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Default schedule */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Default schedule (applies to new rows below)</div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs">Frequency</Label>
                <Select value={defaultFrequency} onValueChange={(v) => handleDefaultChange('frequency', v as Frequency)}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {defaultFrequency === 'weekly' && (
                <div>
                  <Label className="text-xs">Day</Label>
                  <Select
                    value={String(defaultDay ?? 1)}
                    onValueChange={(v) => handleDefaultChange('day', Number(v))}
                  >
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((d) => (
                        <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {defaultFrequency === 'monthly' && (
                <div>
                  <Label className="text-xs">Day of month</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={defaultDay ?? 1}
                    onChange={(e) => handleDefaultChange('day', Math.max(1, Math.min(31, Number(e.target.value))))}
                    className="w-20"
                  />
                </div>
              )}
              <div>
                <Label className="text-xs">Deadline</Label>
                <Input
                  type="time"
                  value={defaultTime}
                  onChange={(e) => handleDefaultChange('time', e.target.value)}
                  className="w-28"
                />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Checkbox
                  id="notify"
                  checked={notifyOnOverdue}
                  onCheckedChange={(v) => setNotifyOnOverdue(Boolean(v))}
                />
                <Label htmlFor="notify" className="text-xs cursor-pointer">Notify on overdue</Label>
              </div>
            </div>
          </div>

          {/* Matrix */}
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">User</th>
                    <th className="px-3 py-2 text-left">Property</th>
                    <th className="px-3 py-2 text-left">Frequency</th>
                    <th className="px-3 py-2 text-left">Day</th>
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const user = userMap.get(row.userId)
                    const prop = propertyMap.get(row.propertyId)
                    return (
                      <tr key={`${row.userId}|${row.propertyId}`} className={cn('border-t', row.exists && 'opacity-50')}>
                        <td className="px-3 py-2">{user?.fullName ?? user?.email}</td>
                        <td className="px-3 py-2">{prop?.name}</td>
                        <td className="px-3 py-2">
                          <Select
                            value={row.frequency}
                            disabled={row.exists}
                            onValueChange={(v) => updateRow(idx, {
                              frequency: v as Frequency,
                              deadlineDay: v === 'daily' ? null : (row.deadlineDay ?? 1),
                            })}
                          >
                            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="daily">Daily</SelectItem>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          {row.frequency === 'daily' ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : row.frequency === 'weekly' ? (
                            <Select
                              value={String(row.deadlineDay ?? 1)}
                              disabled={row.exists}
                              onValueChange={(v) => updateRow(idx, { deadlineDay: Number(v) })}
                            >
                              <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {DAYS_OF_WEEK.map((d) => (
                                  <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              type="number"
                              min={1}
                              max={31}
                              value={row.deadlineDay ?? 1}
                              disabled={row.exists}
                              onChange={(e) => updateRow(idx, {
                                deadlineDay: Math.max(1, Math.min(31, Number(e.target.value))),
                              })}
                              className="h-8 w-16"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="time"
                            value={row.deadlineTime}
                            disabled={row.exists}
                            onChange={(e) => updateRow(idx, { deadlineTime: e.target.value })}
                            className="h-8 w-28"
                          />
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {row.exists
                            ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Exists — will skip</span>
                            : <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">New</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 0 && (
            <div className="text-sm text-muted-foreground">
              Will create {newRowCount}.{skipCount > 0 && ` ${skipCount} already exist${skipCount === 1 ? 's' : ''} — will skip.`}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={newRowCount === 0 || submitting}>
            {submitting ? 'Creating…' : `Create ${newRowCount}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```
Expected: build succeeds. If `Checkbox` or any other shadcn primitive is missing in `src/components/ui/`, add it via the standard `npx shadcn@latest add checkbox` and commit the new file separately.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/sop-multi-assign-dialog.tsx
git commit -m "feat(sops): multi-assign matrix dialog component"
```

---

## Task 16: Wire the dialog into `sop-assignments.tsx`

**Files:**
- Modify: `src/components/admin/sop-assignments.tsx`

- [ ] **Step 1: Replace the inline Add form**

Open `src/components/admin/sop-assignments.tsx`. The component already imports `useRouter` from `next/navigation` and calls `router.refresh()` after create/delete mutations (see lines ~69, 116, 132). Use the same pattern.

Replace the inline create form with a button that opens `SopMultiAssignDialog`:

```tsx
import { SopMultiAssignDialog } from './sop-multi-assign-dialog'
// (existing imports preserved)

// inside the component (router is already declared at line ~69)
const [multiAssignOpen, setMultiAssignOpen] = useState(false)

// in the render, replace the existing "Add Assignment" trigger/form with:
<Button onClick={() => setMultiAssignOpen(true)}>Add Assignments</Button>
<SopMultiAssignDialog
  open={multiAssignOpen}
  onOpenChange={setMultiAssignOpen}
  templateId={templateId}
  users={users}
  properties={properties}
  onCreated={() => router.refresh()}
/>
```

If the existing inline form uses any local state (e.g., a single `selectedUserId` or schedule fields), remove that state and its handlers as part of this step — the matrix dialog owns all of it now. The list-and-edit-existing portion of the file stays unchanged.

- [ ] **Step 2: Verify build**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Manual verification**

Navigate to a template's assignments view in `/sops/templates/<id>`. Click "Add Assignments":
- Dialog opens.
- Pick 2 users + 2 properties → 4 rows generate.
- Set default frequency to Weekly Mon 14:00 → confirm "Apply to all new rows?" prompt → click Yes → all rows update.
- Override one row to Daily 09:00.
- Click Create → toast confirms creation, dialog closes, list refreshes with 4 new rows.
- Re-open dialog with the same selections → rows appear greyed-out as "Exists — will skip", create button disabled.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/sop-assignments.tsx
git commit -m "feat(sops): wire multi-assign dialog into template assignments page"
```

---

## Task 17: End-to-end manual verification

**Files:** none

- [ ] **Step 1: Run the full test plan from the spec**

Open `docs/superpowers/specs/2026-04-29-sop-categories-and-multi-assign-design.md`, scroll to "Testing approach", and run each of the 8 manual tests. Note any failures and circle back to fix in their owning task.

- [ ] **Step 2: Update MEMORY.md with new learnings**

If any patterns emerged during implementation that future sessions should know about (e.g., a quirk in shadcn primitives, a Drizzle gotcha), add them to `/Users/sonaljayawickrama/.claude/projects/-Users-sonaljayawickrama-Desktop-GitHub-Repos-Taru-Villas/memory/MEMORY.md`.

- [ ] **Step 3: Final commit (if MEMORY.md updated, that's outside the repo — skip)**

```bash
git status
```
Expected: clean working tree (or only the manual-test cleanup commits).

- [ ] **Step 4: Deploy**

```bash
npx vercel deploy --prod --yes
```
Expected: deploy succeeds. Run a final smoke test on production: open `/sops/categories`, create one category, see it on `/sops` after assigning a template to it.
