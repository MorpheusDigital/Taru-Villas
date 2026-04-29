import type {
  SopTemplate,
  SopSection,
  SopItem,
  SopAssignment,
  SopCompletion,
  SopItemCompletion,
  Property,
  Profile,
} from '@/lib/db/schema'

// ---------------------------------------------------------------------------
// Composite types used by both server and client
// ---------------------------------------------------------------------------

export type SopSectionWithItems = SopSection & { items: SopItem[] }

export type SopTemplateWithContent = SopTemplate & {
  sections: SopSectionWithItems[]
  ungroupedItems: SopItem[]
}

export type SopTemplateWithCounts = SopTemplate & {
  itemCount: number
  assignmentCount: number
}

export type SopAssignmentWithDetails = SopAssignment & {
  template: SopTemplate
  property: Property
  user: Profile
}

export type SopCompletionWithItems = SopCompletion & {
  itemCompletions: SopItemCompletion[]
}

export type SopAssignmentForUser = SopAssignment & {
  template: SopTemplate & { items: SopItem[] }
  property: Property
  category: { id: string; name: string; sortOrder: number } | null
  currentCompletion: SopCompletionWithItems | null
  currentDueDate: string
}

export type SopDashboardRow = {
  completion: SopCompletion
  assignment: SopAssignment
  template: SopTemplate
  property: Property
  user: Profile
  checkedCount: number
  totalItems: number
}

// ---------------------------------------------------------------------------
// Pure helper functions (no DB imports)
// ---------------------------------------------------------------------------

/**
 * Check if a completion is overdue.
 */
export function isOverdue(dueDate: string, deadlineTime: string): boolean {
  const now = new Date()
  const [hours, minutes] = deadlineTime.split(':').map(Number)
  const deadline = new Date(dueDate + 'T00:00:00')
  deadline.setHours(hours, minutes, 0, 0)
  return now > deadline
}
