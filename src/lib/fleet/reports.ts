import { z } from 'zod/v4'

export function reportDeadline(completedAt: Date) {
  return new Date(completedAt.getTime() + 48 * 60 * 60 * 1000)
}

export const visitReportDetailsSchema = z.object({
  visitPurpose: z.string().trim().min(1).max(2000),
  visitLocation: z.string().trim().min(1).max(1000),
  visitDate: z.iso.date(),
  peopleMet: z.string().trim().max(3000).optional(),
  findings: z.string().trim().max(5000).optional(),
  outcomes: z.string().trim().min(1).max(5000),
  followUpActions: z.string().trim().max(5000).optional(),
})
export type VisitReportDetails = z.infer<typeof visitReportDetailsSchema>

export const visitReportSubmissionSchema = z.object({
  summary: z.string().trim().min(1, 'Work completed is required').max(5000),
  details: visitReportDetailsSchema,
  attachmentUrls: z.array(z.string().trim().max(2000).refine(value => {
    try { return ['https:', 'http:'].includes(new URL(value).protocol) } catch { return false }
  }, 'Use an http or https link')).max(20).default([]),
  linkedTaskIds: z.array(z.uuid()).max(20).default([]),
  newTasks: z.array(z.object({
    title: z.string().trim().min(1).max(500), description: z.string().trim().max(5000).optional(),
    projectId: z.uuid(), assigneeIds: z.array(z.uuid()).min(1).max(20),
    priority: z.enum(['low', 'medium', 'high']), dueDate: z.iso.date().nullable().optional(),
  })).max(10).default([]),
})
export type VisitReportSubmission = z.infer<typeof visitReportSubmissionSchema>

// Drafts preserve incomplete fields without creating linked/follow-up work.
export const visitReportDraftSchema = visitReportSubmissionSchema.extend({
  summary: z.string().trim().max(5000),
  details: visitReportDetailsSchema.extend({
    visitPurpose: z.string().trim().max(2000),
    visitLocation: z.string().trim().max(1000),
    visitDate: z.union([z.iso.date(), z.literal('')]),
    outcomes: z.string().trim().max(5000),
  }),
  newTasks: z.array(visitReportSubmissionSchema.shape.newTasks.unwrap().element.extend({
    title: z.string().trim().max(500),
    projectId: z.union([z.uuid(), z.literal('')]),
    assigneeIds: z.array(z.uuid()).max(20),
  })).max(10).default([]),
})
export type VisitReportDraft = z.infer<typeof visitReportDraftSchema>

export type TripReportStatus = 'pending' | 'submitted' | 'overdue'

export function getReportStatus(
  dueAt: Date | null,
  submittedAt: Date | null,
  now = new Date()
): TripReportStatus {
  if (submittedAt) return 'submitted'
  return dueAt && now > dueAt ? 'overdue' : 'pending'
}
