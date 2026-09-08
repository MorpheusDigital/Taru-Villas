import { describe, expect, it, vi } from 'vitest'
vi.mock('..', () => ({ db: {} }))
import { assertVisitReportTaskEdit, assertTaskReportDeletion } from './tasks'

const task = { status: 'todo' as const, projectId: 'reports', dueDate: '2026-09-10' }

describe('visit report task guards', () => {
  it('requires report submission for manual completion', () => {
    expect(() => assertVisitReportTaskEdit(task, { submittedAt: null }, { status: 'done' }, ['owner'])).toThrow(/submit/i)
  })
  it('prevents reopening a submitted report', () => {
    expect(() => assertVisitReportTaskEdit({ ...task, status: 'done' }, { submittedAt: new Date() }, { status: 'todo' }, ['owner'])).toThrow(/submitted/i)
  })
  it.each(['in_progress', 'stuck', 'todo'] as const)('allows %s before submission', status => {
    expect(() => assertVisitReportTaskEdit(task, { submittedAt: null }, { status }, ['owner'])).not.toThrow()
  })
  it.each([{ projectId: 'other' }, { dueDate: '2027-01-01' }, { dueDate: null }])('protects report-managed project and deadline', patch => {
    expect(() => assertVisitReportTaskEdit(task, { submittedAt: null }, patch, ['owner'])).toThrow(/managed/i)
  })
  it('protects report owner assignment including clearing all assignees', () => {
    expect(() => assertVisitReportTaskEdit(task, { submittedAt: null }, {}, ['owner'], [])).toThrow(/managed/i)
    expect(() => assertVisitReportTaskEdit(task, { submittedAt: null }, {}, ['owner'], ['other'])).toThrow(/managed/i)
  })
  it('allows unchanged managed fields and descriptive edits after submission', () => {
    expect(() => assertVisitReportTaskEdit({ ...task, status: 'done' }, { submittedAt: new Date() }, { status: 'done', projectId: 'reports', dueDate: '2026-09-10', title: 'Updated title' }, ['owner'], ['owner'])).not.toThrow()
  })
  it('does not limit regular tasks', () => {
    expect(() => assertVisitReportTaskEdit(task, null, { status: 'done', projectId: 'other' }, [], ['new'])).not.toThrow()
  })
  it('retains tasks with report history but permits unrelated deletion', () => {
    expect(() => assertTaskReportDeletion(true)).toThrow(/history/i)
    expect(() => assertTaskReportDeletion(false)).not.toThrow()
  })
})
