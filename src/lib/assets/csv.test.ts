import { describe, it, expect } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('joins headers and rows and escapes commas/quotes', () => {
    const csv = toCsv(
      ['Code', 'Name'],
      [['A-1', 'Bed, teak'], ['A-2', 'Chair "oak"']],
    )
    expect(csv).toBe('Code,Name\r\n"A-1","Bed, teak"\r\n"A-2","Chair ""oak"""')
  })
})
