export type TripReportStatus = 'pending' | 'submitted' | 'overdue'

export function getReportStatus(
  dueAt: Date,
  submittedAt: Date | null,
  now = new Date()
): TripReportStatus {
  if (submittedAt) return 'submitted'
  return now > dueAt ? 'overdue' : 'pending'
}
