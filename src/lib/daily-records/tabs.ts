export type DailyRecordTab = 'water' | 'electricity' | 'waste'

export function getDailyRecordTab(tab: string | undefined): DailyRecordTab {
  if (tab === 'electricity' || tab === 'waste') return tab
  return 'water'
}

export function buildDailyRecordsPath(
  propertyId: string,
  tab: string | undefined,
  searchParams = new URLSearchParams()
): string {
  const params = new URLSearchParams(searchParams)
  const activeTab = getDailyRecordTab(tab)

  if (activeTab === 'water') params.delete('tab')
  else params.set('tab', activeTab)

  const query = params.toString()
  return `/properties/${propertyId}/daily-records${query ? `?${query}` : ''}`
}
