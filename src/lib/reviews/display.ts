export const REVIEW_PAGE_SIZE = 25

type ReviewMetadata = Record<string, unknown> | null

export function reviewDateLabel(date: Date, metadata: ReviewMetadata) {
  const estimated = metadata?.reviewed_at_is_estimate === true
  const precision = metadata?.date_precision
  const label = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    ...(estimated && precision === 'year' ? {} : { month: 'short' as const }),
    ...(estimated && (precision === 'year' || precision === 'month') ? {} : { day: 'numeric' as const }),
    timeZone: 'UTC',
  }).format(date)
  if (metadata?.date_event === 'edited') return `Edited ${estimated ? 'around ' : ''}${label}`
  return `${estimated ? 'Around ' : ''}${label}`
}

export function reviewListingUrl(metadata: ReviewMetadata) {
  const cid = metadata?.google_maps_cid
  return typeof cid === 'string' && /^\d{1,30}$/.test(cid)
    ? `https://www.google.com/maps?cid=${cid}` : null
}

export function reviewPagination(requested: string | undefined, total: number) {
  const pages = Math.max(1, Math.ceil(total / REVIEW_PAGE_SIZE))
  const parsed = Number(requested)
  const page = Number.isFinite(parsed) ? Math.max(1, Math.min(pages, Math.floor(parsed))) : 1
  return { page, pages, offset: (page - 1) * REVIEW_PAGE_SIZE }
}
