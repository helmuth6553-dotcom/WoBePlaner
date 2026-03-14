/**
 * Roster Rules Tests
 *
 * Tests shift validation rules for the WoBePlaner.
 *
 * Run with: npx vitest run src/utils/rosterRules.test.js
 */

import { describe, it, expect } from 'vitest'
import { validateShiftRules } from './rosterRules'

const user = { id: 'user-1' }

describe('validateShiftRules', () => {

    it('should return null (valid) when no conflicts', () => {
        const result = validateShiftRules(
            { start_time: '2025-01-15T08:00:00', type: 'TD1' },
            [],
            user,
            []
        )
        expect(result).toBeNull()
    })

    it('should return null for shift without start_time', () => {
        const result = validateShiftRules(
            { type: 'TD1' },
            [],
            user,
            []
        )
        expect(result).toBeNull()
    })

    it('should block user who is sick on that day', () => {
        const result = validateShiftRules(
            { start_time: '2025-01-15T08:00:00', type: 'TD1' },
            [{
                user_id: 'user-1',
                type: 'Krank',
                status: 'genehmigt',
                start_date: '2025-01-14',
                end_date: '2025-01-16'
            }],
            user,
            []
        )
        expect(result).toContain('krankgemeldet')
    })

    it('should block TD2 + ND on same day', () => {
        const result = validateShiftRules(
            { start_time: '2025-01-15T19:00:00', type: 'ND' },
            [],
            user,
            [{ start_time: '2025-01-15T12:00:00', type: 'TD2', assigned_to: 'user-1' }]
        )
        expect(result).toContain('nicht kombinierbar')
    })

    it('should block ND + DBD on same day', () => {
        const result = validateShiftRules(
            { start_time: '2025-01-15T19:00:00', type: 'ND' },
            [],
            user,
            [{ start_time: '2025-01-15T07:00:00', type: 'DBD', assigned_to: 'user-1' }]
        )
        expect(result).toContain('nicht kombinierbar')
    })

    it('should enforce rest period: no TD1 after ND', () => {
        const result = validateShiftRules(
            { start_time: '2025-01-16T08:00:00', type: 'TD1' },
            [],
            user,
            [{ start_time: '2025-01-15T19:00:00', type: 'ND', assigned_to: 'user-1' }]
        )
        expect(result).toContain('Ruhezeit')
    })

    it('should enforce rest period: no ND if TD1 next day', () => {
        const result = validateShiftRules(
            { start_time: '2025-01-15T19:00:00', type: 'ND' },
            [],
            user,
            [{ start_time: '2025-01-16T08:00:00', type: 'TD1', assigned_to: 'user-1' }]
        )
        expect(result).toContain('Ruhezeit')
    })

    it('should allow TD1 + TD2 on same day', () => {
        const result = validateShiftRules(
            { start_time: '2025-01-15T12:00:00', type: 'TD2' },
            [],
            user,
            [{ start_time: '2025-01-15T08:00:00', type: 'TD1', assigned_to: 'user-1' }]
        )
        expect(result).toBeNull()
    })

    it('should allow TD1 + ND on same day', () => {
        const result = validateShiftRules(
            { start_time: '2025-01-15T19:00:00', type: 'ND' },
            [],
            user,
            [{ start_time: '2025-01-15T08:00:00', type: 'TD1', assigned_to: 'user-1' }]
        )
        expect(result).toBeNull()
    })

    it('should normalize shift type aliases', () => {
        // 'Tagdienst' should be treated as 'TD1'
        const result = validateShiftRules(
            { start_time: '2025-01-16T08:00:00', type: 'Tagdienst' },
            [],
            user,
            [{ start_time: '2025-01-15T19:00:00', type: 'Nachtdienst', assigned_to: 'user-1' }]
        )
        expect(result).toContain('Ruhezeit')
    })

    it('should only check shifts relevant to the user', () => {
        // Another user's ND should not block this user's TD1
        const result = validateShiftRules(
            { start_time: '2025-01-16T08:00:00', type: 'TD1' },
            [],
            user,
            [{ start_time: '2025-01-15T19:00:00', type: 'ND', assigned_to: 'user-2' }]
        )
        expect(result).toBeNull()
    })

    it('should check shifts where user has interest', () => {
        const result = validateShiftRules(
            { start_time: '2025-01-16T08:00:00', type: 'TD1' },
            [],
            user,
            [{
                start_time: '2025-01-15T19:00:00',
                type: 'ND',
                assigned_to: 'user-2',
                interests: [{ user_id: 'user-1' }]
            }]
        )
        expect(result).toContain('Ruhezeit')
    })
})
