import { describe, it, expect } from 'vitest'
import { formatOriginLabel, formatDestinationLabel, formatTripRoute } from './labels'

describe('formatOriginLabel', () => {
  it('names the head office', () => {
    expect(formatOriginLabel({ originKind: 'head_office', originPropertyName: null, originText: null }))
      .toBe('Head Office')
  })

  it('uses the property name', () => {
    expect(formatOriginLabel({ originKind: 'property', originPropertyName: 'The Long House', originText: null }))
      .toBe('The Long House')
  })

  it('degrades to Unknown property when the pick-up property was deleted', () => {
    expect(formatOriginLabel({ originKind: 'property', originPropertyName: null, originText: null }))
      .toBe('Unknown property')
  })

  it('uses the free text for other', () => {
    expect(formatOriginLabel({ originKind: 'other', originPropertyName: null, originText: 'Bandaranaike Airport' }))
      .toBe('Bandaranaike Airport')
  })

  it('falls back to an em dash when other has no text', () => {
    expect(formatOriginLabel({ originKind: 'other', originPropertyName: null, originText: null }))
      .toBe('—')
  })

  it('ignores a property name that does not belong to the kind', () => {
    expect(formatOriginLabel({ originKind: 'head_office', originPropertyName: 'The Long House', originText: 'x' }))
      .toBe('Head Office')
  })
})

describe('formatDestinationLabel', () => {
  it('uses the property name for a visit', () => {
    expect(formatDestinationLabel({ requestType: 'visit', propertyName: 'The Long House', destinationText: null }))
      .toBe('The Long House')
  })

  it('degrades to Unknown property for a visit with no property', () => {
    expect(formatDestinationLabel({ requestType: 'visit', propertyName: null, destinationText: null }))
      .toBe('Unknown property')
  })

  it('uses the free text for a standalone trip', () => {
    expect(formatDestinationLabel({ requestType: 'standalone', propertyName: null, destinationText: 'Airport' }))
      .toBe('Airport')
  })

  it('falls back to an em dash for a standalone trip with no destination', () => {
    expect(formatDestinationLabel({ requestType: 'standalone', propertyName: null, destinationText: null }))
      .toBe('—')
  })
})

describe('formatTripRoute', () => {
  it('joins pick-up and destination with an arrow', () => {
    expect(
      formatTripRoute({
        originKind: 'head_office',
        originPropertyName: null,
        originText: null,
        requestType: 'visit',
        propertyName: 'The Long House',
        destinationText: null,
      })
    ).toBe('Head Office → The Long House')
  })

  it('renders the head office half even though it is the default', () => {
    // A pick-up that is sometimes shown and sometimes implied would force the
    // reader to know the omission rule to tell "starts from Head Office" from
    // "nobody set a pick-up".
    expect(
      formatTripRoute({
        originKind: 'other',
        originPropertyName: null,
        originText: 'Airport',
        requestType: 'standalone',
        propertyName: null,
        destinationText: 'Head Office',
      })
    ).toBe('Airport → Head Office')
  })
})
