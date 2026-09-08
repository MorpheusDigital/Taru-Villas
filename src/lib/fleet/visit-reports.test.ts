import { describe, expect, it } from 'vitest'
import { reportDeadline, visitReportSubmissionSchema } from './reports'

describe('visit report contract', () => {
  it('sets a precise 48-hour deadline across a Colombo date boundary', () => {
    expect(reportDeadline(new Date('2026-09-08T20:30:00Z')).toISOString()).toBe('2026-09-10T20:30:00.000Z')
  })
  const valid = { summary: 'Inspected equipment', details: { visitPurpose: 'Site visit', visitLocation: 'Property',
    visitDate: '2026-09-08', outcomes: 'Repairs needed' }, attachmentUrls: ['https://example.com/report?a=1'],
    linkedTaskIds: [], newTasks: [] }
  it('requires the core report fields and valid calendar dates', () => {
    expect(visitReportSubmissionSchema.safeParse(valid).success).toBe(true)
    expect(visitReportSubmissionSchema.safeParse({ ...valid, summary: ' ' }).success).toBe(false)
    expect(visitReportSubmissionSchema.safeParse({ ...valid, details: { ...valid.details, visitDate: '2026-02-30' } }).success).toBe(false)
  })
  it('rejects executable attachment links and unassigned follow-up tasks', () => {
    expect(visitReportSubmissionSchema.safeParse({ ...valid, attachmentUrls: ['javascript:alert(1)'] }).success).toBe(false)
    expect(visitReportSubmissionSchema.safeParse({ ...valid, newTasks: [{ title: 'Repair', projectId: crypto.randomUUID(), assigneeIds: [], priority: 'high' }] }).success).toBe(false)
  })
})
