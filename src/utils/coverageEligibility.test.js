/**
 * Coverage Eligibility Tests
 *
 * Tests the business rules for shift coverage eligibility.
 *
 * Run with: npx vitest run src/utils/coverageEligibility.test.js
 */

import { describe, it, expect } from 'vitest'
import { checkEligibility, getEligibleUsers } from './coverageEligibility'

describe('checkEligibility', () => {

    it('should exclude the sick person', () => {
        const result = checkEligibility(
            { start_time: '2025-01-15T08:00:00', type: 'TD1' },
            'user-1',      // candidate
            'user-1',      // sick person (same!)
            [],
            []
        )
        expect(result.eligible).toBe(false)
        expect(result.reason).toContain('krankgemeldet')
    })

    it('should exclude user with approved absence on that day', () => {
        const result = checkEligibility(
            { start_time: '2025-01-15T08:00:00', type: 'TD1' },
            'user-2',
            'user-1',
            [],
            [{ user_id: 'user-2', status: 'genehmigt', type: 'Urlaub', start_date: '2025-01-14', end_date: '2025-01-16' }]
        )
        expect(result.eligible).toBe(false)
        expect(result.reason).toContain('Urlaub')
    })

    it('should allow user with no conflicts', () => {
        const result = checkEligibility(
            { start_time: '2025-01-15T08:00:00', type: 'TD1' },
            'user-2',
            'user-1',
            [],
            []
        )
        expect(result.eligible).toBe(true)
    })

    it('should exclude user who already has the same shift type', () => {
        const result = checkEligibility(
            { start_time: '2025-01-15T08:00:00', type: 'TD1' },
            'user-2',
            'user-1',
            [{ start_time: '2025-01-15T08:00:00', type: 'TD1', interests: [{ user_id: 'user-2' }] }],
            []
        )
        expect(result.eligible).toBe(false)
        expect(result.reason).toContain('TD1')
    })

    it('should not combine TD2 and ND on same day', () => {
        const result = checkEligibility(
            { start_time: '2025-01-15T19:00:00', type: 'ND' },
            'user-2',
            'user-1',
            [{ start_time: '2025-01-15T12:00:00', type: 'TD2', interests: [{ user_id: 'user-2' }] }],
            []
        )
        expect(result.eligible).toBe(false)
        expect(result.reason).toContain('nicht kombinierbar')
    })

    it('should not combine ND and DBD on same day', () => {
        const result = checkEligibility(
            { start_time: '2025-01-15T19:00:00', type: 'ND' },
            'user-2',
            'user-1',
            [{ start_time: '2025-01-15T07:00:00', type: 'DBD', interests: [{ user_id: 'user-2' }] }],
            []
        )
        expect(result.eligible).toBe(false)
    })

    it('should enforce rest period: no TD1 after ND', () => {
        const result = checkEligibility(
            { start_time: '2025-01-16T08:00:00', type: 'TD1' },
            'user-2',
            'user-1',
            [{ start_time: '2025-01-15T19:00:00', type: 'ND', interests: [{ user_id: 'user-2' }] }],
            []
        )
        expect(result.eligible).toBe(false)
        expect(result.reason).toContain('Ruhezeit')
    })

    it('should allow TD1 + ND on same day (enough break)', () => {
        const result = checkEligibility(
            { start_time: '2025-01-15T19:00:00', type: 'ND' },
            'user-2',
            'user-1',
            [{ start_time: '2025-01-15T08:00:00', type: 'TD1', interests: [{ user_id: 'user-2' }] }],
            []
        )
        expect(result.eligible).toBe(true)
    })

    it('should allow TD1 + TD2 on same day (shift handover)', () => {
        const result = checkEligibility(
            { start_time: '2025-01-15T12:00:00', type: 'TD2' },
            'user-2',
            'user-1',
            [{ start_time: '2025-01-15T08:00:00', type: 'TD1', interests: [{ user_id: 'user-2' }] }],
            []
        )
        expect(result.eligible).toBe(true)
    })

    it('should be eligible when shift has no start_time', () => {
        const result = checkEligibility(
            { type: 'TD1' },
            'user-2',
            'user-1',
            [],
            []
        )
        expect(result.eligible).toBe(true)
    })

    it('should ignore non-approved absences', () => {
        const result = checkEligibility(
            { start_time: '2025-01-15T08:00:00', type: 'TD1' },
            'user-2',
            'user-1',
            [],
            [{ user_id: 'user-2', status: 'ausstehend', type: 'Urlaub', start_date: '2025-01-14', end_date: '2025-01-16' }]
        )
        expect(result.eligible).toBe(true)
    })
})

describe('getEligibleUsers', () => {

    const profiles = [
        { id: 'user-1', role: 'employee' },
        { id: 'user-2', role: 'employee' },
        { id: 'user-3', role: 'employee' },
        { id: 'admin-1', role: 'admin' }
    ]

    it('should return eligibility for all non-admin employees', () => {
        const result = getEligibleUsers(
            { start_time: '2025-01-15T08:00:00', type: 'TD1' },
            'user-1',
            profiles,
            [],
            []
        )

        expect(result).toHaveLength(3) // 3 employees, admin excluded
        expect(result.find(r => r.userId === 'admin-1')).toBeUndefined()
    })

    it('should mark sick user as ineligible', () => {
        const result = getEligibleUsers(
            { start_time: '2025-01-15T08:00:00', type: 'TD1' },
            'user-1',
            profiles,
            [],
            []
        )

        const sickUser = result.find(r => r.userId === 'user-1')
        expect(sickUser.eligible).toBe(false)

        const otherUsers = result.filter(r => r.userId !== 'user-1')
        otherUsers.forEach(u => expect(u.eligible).toBe(true))
    })
})
