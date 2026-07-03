import { describe, it, expect } from 'vitest'
import { buildActivityFeed } from './activity'

describe('buildActivityFeed', () => {
  it('maps event types to human labels, newest first', () => {
    const feed = buildActivityFeed([
      { id: '1', assetId: 'a', assetName: 'Teak Bed', eventType: 'created', detail: null, actorName: 'Alvin', createdAt: new Date('2026-07-01T10:00:00Z') },
      { id: '2', assetId: 'a', assetName: 'Teak Bed', eventType: 'repair_flagged', detail: 'Broken leg', actorName: 'Sunil', createdAt: new Date('2026-07-02T10:00:00Z') },
      { id: '3', assetId: 'b', assetName: 'AC Unit', eventType: 'moved', detail: 'Room 2', actorName: null, createdAt: new Date('2026-07-03T10:00:00Z') },
    ])
    expect(feed[0].label).toBe('AC Unit moved to Room 2')
    expect(feed[1].label).toBe('Teak Bed flagged for repair: Broken leg')
    expect(feed[2].label).toBe('Teak Bed added by Alvin')
  })
})
