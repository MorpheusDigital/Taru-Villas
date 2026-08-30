import { describe, expect, it } from 'vitest'
import {
  belongsToOrganization,
  referencesBelongToOrganization,
} from './organization-scope'

const orgId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherOrgId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const firstId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const secondId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

describe('organization mutation boundaries', () => {
  it('rejects a target owned by another organization', () => {
    expect(belongsToOrganization({ id: firstId, orgId: otherOrgId }, orgId)).toBe(false)
  })

  it('rejects missing and cross-organization assignment references', () => {
    expect(referencesBelongToOrganization(
      [firstId, secondId],
      [
        { id: firstId, orgId },
        { id: secondId, orgId: otherOrgId },
      ],
      orgId
    )).toBe(false)

    expect(referencesBelongToOrganization(
      [firstId, secondId],
      [{ id: firstId, orgId }],
      orgId
    )).toBe(false)
  })

  it('accepts unique references only when every record belongs to the caller organization', () => {
    expect(referencesBelongToOrganization(
      [firstId, secondId, firstId],
      [
        { id: firstId, orgId },
        { id: secondId, orgId },
      ],
      orgId
    )).toBe(true)
  })
})
