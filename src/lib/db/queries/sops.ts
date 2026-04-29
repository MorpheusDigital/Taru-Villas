import { eq, and, asc, inArray, desc, count } from 'drizzle-orm'
import { db } from '..'
import {
  sopTemplates,
  sopSections,
  sopItems,
  sopAssignments,
  sopCategories,
  sopCompletions,
  sopItemCompletions,
  properties,
  profiles,
  type SopTemplate,
  type NewSopTemplate,
  type SopSection,
  type NewSopSection,
  type SopItem,
  type NewSopItem,
  type SopAssignment,
  type NewSopAssignment,
  type SopCompletion,
  type NewSopCompletion,
  type SopItemCompletion,
  type Profile,
} from '../schema'
import { startOfDay, startOfWeek, startOfMonth, format } from 'date-fns'

// Re-export types and client-safe helpers from shared module
export type {
  SopSectionWithItems,
  SopTemplateWithContent,
  SopTemplateWithCounts,
  SopAssignmentWithDetails,
  SopCompletionWithItems,
  SopAssignmentForUser,
  SopDashboardRow,
} from '@/lib/sops/types'
export { isOverdue } from '@/lib/sops/types'

import type {
  SopSectionWithItems,
  SopTemplateWithContent,
  SopTemplateWithCounts,
  SopAssignmentWithDetails,
  SopCompletionWithItems,
  SopAssignmentForUser,
  SopDashboardRow,
} from '@/lib/sops/types'

// ---------------------------------------------------------------------------
// Helpers: due date computation (server-only, uses date-fns)
// ---------------------------------------------------------------------------

/**
 * Compute the current due date for an assignment based on its frequency.
 */
export function computeCurrentDueDate(
  frequency: 'daily' | 'weekly' | 'monthly',
  deadlineDay: number | null
): string {
  const now = new Date()

  if (frequency === 'daily') {
    return format(startOfDay(now), 'yyyy-MM-dd')
  }

  if (frequency === 'weekly') {
    const weekStart = startOfWeek(now, { weekStartsOn: 1 })
    const day = deadlineDay ?? 0
    const dueDate = new Date(weekStart)
    dueDate.setDate(dueDate.getDate() + day)
    return format(dueDate, 'yyyy-MM-dd')
  }

  // monthly
  const monthStart = startOfMonth(now)
  const day = Math.min(deadlineDay ?? 1, 28)
  const dueDate = new Date(monthStart)
  dueDate.setDate(day)
  return format(dueDate, 'yyyy-MM-dd')
}

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

export async function getTemplatesForOrg(
  orgId: string
): Promise<SopTemplateWithCounts[]> {
  const templates = await db
    .select()
    .from(sopTemplates)
    .where(eq(sopTemplates.orgId, orgId))
    .orderBy(desc(sopTemplates.createdAt))

  if (templates.length === 0) return []

  const templateIds = templates.map((t) => t.id)

  // Count items per template
  const itemCounts = await db
    .select({
      templateId: sopItems.templateId,
      count: count(),
    })
    .from(sopItems)
    .where(inArray(sopItems.templateId, templateIds))
    .groupBy(sopItems.templateId)

  // Count assignments per template
  const assignmentCounts = await db
    .select({
      templateId: sopAssignments.templateId,
      count: count(),
    })
    .from(sopAssignments)
    .where(inArray(sopAssignments.templateId, templateIds))
    .groupBy(sopAssignments.templateId)

  const itemCountMap = new Map(itemCounts.map((r) => [r.templateId, Number(r.count)]))
  const assignCountMap = new Map(assignmentCounts.map((r) => [r.templateId, Number(r.count)]))

  return templates.map((t) => ({
    ...t,
    itemCount: itemCountMap.get(t.id) ?? 0,
    assignmentCount: assignCountMap.get(t.id) ?? 0,
  }))
}

export async function getTemplateById(
  id: string
): Promise<SopTemplateWithContent | undefined> {
  const results = await db
    .select()
    .from(sopTemplates)
    .where(eq(sopTemplates.id, id))
    .limit(1)

  const template = results[0]
  if (!template) return undefined

  const sections = await db
    .select()
    .from(sopSections)
    .where(eq(sopSections.templateId, id))
    .orderBy(asc(sopSections.sortOrder), asc(sopSections.createdAt))

  const items = await db
    .select()
    .from(sopItems)
    .where(eq(sopItems.templateId, id))
    .orderBy(asc(sopItems.sortOrder), asc(sopItems.createdAt))

  // Group items by section using Map pattern
  const itemsBySection = new Map<string, SopItem[]>()
  const ungroupedItems: SopItem[] = []

  for (const item of items) {
    if (item.sectionId) {
      const list = itemsBySection.get(item.sectionId) ?? []
      list.push(item)
      itemsBySection.set(item.sectionId, list)
    } else {
      ungroupedItems.push(item)
    }
  }

  return {
    ...template,
    sections: sections.map((s) => ({
      ...s,
      items: itemsBySection.get(s.id) ?? [],
    })),
    ungroupedItems,
  }
}

export async function createTemplate(
  data: NewSopTemplate
): Promise<SopTemplate> {
  const results = await db.insert(sopTemplates).values(data).returning()
  return results[0]
}

export async function updateTemplate(
  id: string,
  data: Partial<Omit<NewSopTemplate, 'id'>>
): Promise<SopTemplate | undefined> {
  const results = await db
    .update(sopTemplates)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(sopTemplates.id, id))
    .returning()
  return results[0]
}

export async function deleteTemplate(id: string): Promise<void> {
  await db.delete(sopTemplates).where(eq(sopTemplates.id, id))
}

// ---------------------------------------------------------------------------
// Section CRUD
// ---------------------------------------------------------------------------

export async function createSection(
  data: NewSopSection
): Promise<SopSection> {
  const results = await db.insert(sopSections).values(data).returning()
  return results[0]
}

export async function updateSection(
  id: string,
  data: Partial<Omit<NewSopSection, 'id'>>
): Promise<SopSection | undefined> {
  const results = await db
    .update(sopSections)
    .set(data)
    .where(eq(sopSections.id, id))
    .returning()
  return results[0]
}

export async function deleteSection(id: string): Promise<void> {
  await db.delete(sopSections).where(eq(sopSections.id, id))
}

// ---------------------------------------------------------------------------
// Item CRUD
// ---------------------------------------------------------------------------

export async function createItem(data: NewSopItem): Promise<SopItem> {
  const results = await db.insert(sopItems).values(data).returning()
  return results[0]
}

export async function updateItem(
  id: string,
  data: Partial<Omit<NewSopItem, 'id'>>
): Promise<SopItem | undefined> {
  const results = await db
    .update(sopItems)
    .set(data)
    .where(eq(sopItems.id, id))
    .returning()
  return results[0]
}

export async function deleteItem(id: string): Promise<void> {
  await db.delete(sopItems).where(eq(sopItems.id, id))
}

// ---------------------------------------------------------------------------
// Assignment CRUD
// ---------------------------------------------------------------------------

export async function getAssignmentsForTemplate(
  templateId: string
): Promise<SopAssignmentWithDetails[]> {
  const rows = await db
    .select({
      assignment: sopAssignments,
      property: properties,
      user: profiles,
    })
    .from(sopAssignments)
    .innerJoin(properties, eq(sopAssignments.propertyId, properties.id))
    .innerJoin(profiles, eq(sopAssignments.userId, profiles.id))
    .where(eq(sopAssignments.templateId, templateId))
    .orderBy(asc(properties.name), asc(profiles.fullName))

  // Need template for the return type
  const template = await db
    .select()
    .from(sopTemplates)
    .where(eq(sopTemplates.id, templateId))
    .limit(1)

  if (!template[0]) return []

  return rows.map((r) => ({
    ...r.assignment,
    template: template[0],
    property: r.property,
    user: r.user,
  }))
}

export async function getAssignmentsForUser(
  userId: string
): Promise<SopAssignmentForUser[]> {
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

  if (rows.length === 0) return []

  // Get all template IDs to fetch items
  const templateIds = [...new Set(rows.map((r) => r.template.id))]
  const allItems = await db
    .select()
    .from(sopItems)
    .where(inArray(sopItems.templateId, templateIds))
    .orderBy(asc(sopItems.sortOrder), asc(sopItems.createdAt))

  const itemsByTemplate = new Map<string, SopItem[]>()
  for (const item of allItems) {
    const list = itemsByTemplate.get(item.templateId) ?? []
    list.push(item)
    itemsByTemplate.set(item.templateId, list)
  }

  // Get current completions for each assignment
  const assignmentIds = rows.map((r) => r.assignment.id)
  const dueDates = rows.map((r) =>
    computeCurrentDueDate(r.assignment.frequency, r.assignment.deadlineDay)
  )

  // Fetch all completions for these assignments that might be current
  const completions = await db
    .select()
    .from(sopCompletions)
    .where(inArray(sopCompletions.assignmentId, assignmentIds))

  const completionMap = new Map<string, SopCompletion>()
  for (const c of completions) {
    completionMap.set(`${c.assignmentId}_${c.dueDate}`, c)
  }

  // Get item completions for existing completions
  const completionIds = completions.map((c) => c.id)
  let itemCompletionsMap = new Map<string, SopItemCompletion[]>()
  if (completionIds.length > 0) {
    const itemCompletions = await db
      .select()
      .from(sopItemCompletions)
      .where(inArray(sopItemCompletions.completionId, completionIds))

    for (const ic of itemCompletions) {
      const list = itemCompletionsMap.get(ic.completionId) ?? []
      list.push(ic)
      itemCompletionsMap.set(ic.completionId, list)
    }
  }

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
        ? {
            ...completion,
            itemCompletions: itemCompletionsMap.get(completion.id) ?? [],
          }
        : null,
    }
  })
}

export async function createAssignment(
  data: NewSopAssignment
): Promise<SopAssignment> {
  const results = await db.insert(sopAssignments).values(data).returning()
  return results[0]
}

export async function updateAssignment(
  id: string,
  data: Partial<Omit<NewSopAssignment, 'id'>>
): Promise<SopAssignment | undefined> {
  const results = await db
    .update(sopAssignments)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(sopAssignments.id, id))
    .returning()
  return results[0]
}

export async function deleteAssignment(id: string): Promise<void> {
  await db.delete(sopAssignments).where(eq(sopAssignments.id, id))
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

/**
 * Get or create a completion record for a given assignment + due date.
 */
export async function getOrCreateCompletion(
  assignmentId: string,
  dueDate: string
): Promise<SopCompletionWithItems> {
  // Try to find existing
  const existing = await db
    .select()
    .from(sopCompletions)
    .where(
      and(
        eq(sopCompletions.assignmentId, assignmentId),
        eq(sopCompletions.dueDate, dueDate)
      )
    )
    .limit(1)

  let completion: SopCompletion
  if (existing[0]) {
    completion = existing[0]
  } else {
    const results = await db
      .insert(sopCompletions)
      .values({ assignmentId, dueDate })
      .returning()
    completion = results[0]
  }

  // Get item completions
  const itemCompletions = await db
    .select()
    .from(sopItemCompletions)
    .where(eq(sopItemCompletions.completionId, completion.id))

  return { ...completion, itemCompletions }
}

/**
 * Check/uncheck an item. Auto-marks parent completion as 'completed'
 * when all items in the template are checked.
 */
export async function upsertItemCompletion(
  completionId: string,
  itemId: string,
  isChecked: boolean,
  note?: string | null
): Promise<SopItemCompletion> {
  const existing = await db
    .select()
    .from(sopItemCompletions)
    .where(
      and(
        eq(sopItemCompletions.completionId, completionId),
        eq(sopItemCompletions.itemId, itemId)
      )
    )
    .limit(1)

  let itemCompletion: SopItemCompletion
  if (existing[0]) {
    const results = await db
      .update(sopItemCompletions)
      .set({
        isChecked,
        note: note !== undefined ? note : existing[0].note,
        checkedAt: isChecked ? new Date() : null,
      })
      .where(eq(sopItemCompletions.id, existing[0].id))
      .returning()
    itemCompletion = results[0]
  } else {
    const results = await db
      .insert(sopItemCompletions)
      .values({
        completionId,
        itemId,
        isChecked,
        note: note ?? null,
        checkedAt: isChecked ? new Date() : null,
      })
      .returning()
    itemCompletion = results[0]
  }

  // Check if all items are now checked → auto-complete parent
  const completion = await db
    .select()
    .from(sopCompletions)
    .where(eq(sopCompletions.id, completionId))
    .limit(1)

  if (completion[0]) {
    const assignment = await db
      .select()
      .from(sopAssignments)
      .where(eq(sopAssignments.id, completion[0].assignmentId))
      .limit(1)

    if (assignment[0]) {
      const totalItems = await db
        .select({ count: count() })
        .from(sopItems)
        .where(eq(sopItems.templateId, assignment[0].templateId))

      const checkedItems = await db
        .select({ count: count() })
        .from(sopItemCompletions)
        .where(
          and(
            eq(sopItemCompletions.completionId, completionId),
            eq(sopItemCompletions.isChecked, true)
          )
        )

      const total = Number(totalItems[0]?.count ?? 0)
      const checked = Number(checkedItems[0]?.count ?? 0)

      if (total > 0 && checked >= total) {
        await db
          .update(sopCompletions)
          .set({ status: 'completed', completedAt: new Date() })
          .where(eq(sopCompletions.id, completionId))
      } else if (completion[0].status === 'completed') {
        // If unchecking an item, revert to pending
        await db
          .update(sopCompletions)
          .set({ status: 'pending', completedAt: null })
          .where(eq(sopCompletions.id, completionId))
      }
    }
  }

  return itemCompletion
}

export async function getCompletionWithItems(
  id: string
): Promise<SopCompletionWithItems | undefined> {
  const results = await db
    .select()
    .from(sopCompletions)
    .where(eq(sopCompletions.id, id))
    .limit(1)

  if (!results[0]) return undefined

  const itemCompletions = await db
    .select()
    .from(sopItemCompletions)
    .where(eq(sopItemCompletions.completionId, id))

  return { ...results[0], itemCompletions }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardFilters {
  propertyId?: string
  userId?: string
  dateFrom?: string
  dateTo?: string
  status?: 'pending' | 'completed' | 'overdue'
}

export async function getCompletionsForDashboard(
  orgId: string,
  filters: DashboardFilters,
  propertyIds?: string[] | null // null = admin (all), array = PM-scoped
): Promise<SopDashboardRow[]> {
  // Build conditions
  const conditions = [eq(sopTemplates.orgId, orgId)]

  if (filters.propertyId) {
    conditions.push(eq(sopAssignments.propertyId, filters.propertyId))
  }
  if (filters.userId) {
    conditions.push(eq(sopAssignments.userId, filters.userId))
  }
  if (propertyIds) {
    conditions.push(inArray(sopAssignments.propertyId, propertyIds))
  }

  // Get completions joined with assignments, templates, properties, users
  const rows = await db
    .select({
      completion: sopCompletions,
      assignment: sopAssignments,
      template: sopTemplates,
      property: properties,
      user: profiles,
    })
    .from(sopCompletions)
    .innerJoin(sopAssignments, eq(sopCompletions.assignmentId, sopAssignments.id))
    .innerJoin(sopTemplates, eq(sopAssignments.templateId, sopTemplates.id))
    .innerJoin(properties, eq(sopAssignments.propertyId, properties.id))
    .innerJoin(profiles, eq(sopAssignments.userId, profiles.id))
    .where(and(...conditions))
    .orderBy(desc(sopCompletions.dueDate), asc(properties.name))

  if (rows.length === 0) return []

  // Get checked counts for each completion
  const completionIds = rows.map((r) => r.completion.id)
  const checkedCounts = await db
    .select({
      completionId: sopItemCompletions.completionId,
      count: count(),
    })
    .from(sopItemCompletions)
    .where(
      and(
        inArray(sopItemCompletions.completionId, completionIds),
        eq(sopItemCompletions.isChecked, true)
      )
    )
    .groupBy(sopItemCompletions.completionId)

  const checkedMap = new Map(checkedCounts.map((r) => [r.completionId, Number(r.count)]))

  // Get total item counts per template
  const templateIds = [...new Set(rows.map((r) => r.template.id))]
  const totalCounts = await db
    .select({
      templateId: sopItems.templateId,
      count: count(),
    })
    .from(sopItems)
    .where(inArray(sopItems.templateId, templateIds))
    .groupBy(sopItems.templateId)

  const totalMap = new Map(totalCounts.map((r) => [r.templateId, Number(r.count)]))

  return rows.map((r) => ({
    completion: r.completion,
    assignment: r.assignment,
    template: r.template,
    property: r.property,
    user: r.user,
    checkedCount: checkedMap.get(r.completion.id) ?? 0,
    totalItems: totalMap.get(r.template.id) ?? 0,
  }))
}

/**
 * Get all active users in the org (for dashboard filter dropdown).
 */
export async function getActiveUsersForOrg(orgId: string): Promise<Profile[]> {
  return db
    .select()
    .from(profiles)
    .where(and(eq(profiles.orgId, orgId), eq(profiles.isActive, true)))
    .orderBy(asc(profiles.fullName))
}
