import { describe, it, expect } from 'vitest'
import { buildAssetCode } from './asset-code'

describe('buildAssetCode', () => {
  it('builds a zero-padded code from property code, category and sequence', () => {
    expect(buildAssetCode('RAMPART', 'ffe', 1)).toBe('RAMPART-FFE-001')
    expect(buildAssetCode('MAIA', 'it', 42)).toBe('MAIA-IT-042')
  })
  it('uppercases and strips spaces from the property code', () => {
    expect(buildAssetCode('the lake house', 'kitchen', 7)).toBe('THELAKEHOUSE-KIT-007')
  })
  it('does not truncate sequences beyond 999', () => {
    expect(buildAssetCode('906', 'vehicles', 1000)).toBe('906-VEH-1000')
  })
})
