/**
 * Tests for shiftDefaults utility
 * Verifies default start/end times for all shift types including weekday rules.
 */
import { describe, it, expect } from 'vitest'
import { getDefaultTimes } from './shiftDefaults'

describe('getDefaultTimes', () => {
    // =============================================================================
    // TD1 - Tagdienst 1
    // =============================================================================

    it('TD1 weekday: 07:30-14:30', () => {
        const { start, end } = getDefaultTimes('2025-01-08', 'TD1') // Wed
        expect(start.getHours()).toBe(7)
        expect(start.getMinutes()).toBe(30)
        expect(end.getHours()).toBe(14)
        expect(end.getMinutes()).toBe(30)
    })

    it('TD1 Saturday: 09:30-14:30', () => {
        const { start, end } = getDefaultTimes('2025-01-11', 'TD1') // Sat
        expect(start.getHours()).toBe(9)
        expect(start.getMinutes()).toBe(30)
    })

    it('TD1 Sunday: 09:30-14:30', () => {
        const { start } = getDefaultTimes('2025-01-12', 'TD1') // Sun
        expect(start.getHours()).toBe(9)
        expect(start.getMinutes()).toBe(30)
    })

    it('TD1 Holiday: 09:30-14:30', () => {
        // Jan 1 is Neujahr — pass as holiday
        const holidays = [{ date: new Date(2025, 0, 1) }]
        const { start } = getDefaultTimes('2025-01-01', 'TD1', holidays)
        expect(start.getHours()).toBe(9)
        expect(start.getMinutes()).toBe(30)
    })

    // =============================================================================
    // TD2 - Tagdienst 2
    // =============================================================================

    it('TD2: always 14:00-19:30', () => {
        const { start, end } = getDefaultTimes('2025-01-08', 'TD2') // Wed
        expect(start.getHours()).toBe(14)
        expect(start.getMinutes()).toBe(0)
        expect(end.getHours()).toBe(19)
        expect(end.getMinutes()).toBe(30)
    })

    // =============================================================================
    // ND - Nachtdienst
    // =============================================================================

    it('ND weekday: 19:00 → 08:00 next day', () => {
        const { start, end } = getDefaultTimes('2025-01-08', 'ND') // Wed
        expect(start.getHours()).toBe(19)
        expect(end.getHours()).toBe(8)
        expect(end.getDate()).toBe(9) // next day
    })

    it('ND Friday: 19:00 → 10:00 next day (weekend extension)', () => {
        const { start, end } = getDefaultTimes('2025-01-10', 'ND') // Fri
        expect(start.getHours()).toBe(19)
        expect(end.getHours()).toBe(10)
    })

    it('ND Saturday: 19:00 → 10:00 next day', () => {
        const { end } = getDefaultTimes('2025-01-11', 'ND') // Sat
        expect(end.getHours()).toBe(10)
    })

    // =============================================================================
    // DBD - Doppeltbesetzter Dienst
    // =============================================================================

    it('DBD: 20:00 → 00:00 next day', () => {
        const { start, end } = getDefaultTimes('2025-01-08', 'DBD')
        expect(start.getHours()).toBe(20)
        expect(end.getHours()).toBe(0)
        expect(end.getDate()).toBe(9)
    })

    // =============================================================================
    // TEAM
    // =============================================================================

    it('TEAM: 09:30-11:30', () => {
        const { start, end } = getDefaultTimes('2025-01-09', 'TEAM')
        expect(start.getHours()).toBe(9)
        expect(start.getMinutes()).toBe(30)
        expect(end.getHours()).toBe(11)
        expect(end.getMinutes()).toBe(30)
    })

    // =============================================================================
    // FORTBILDUNG
    // =============================================================================

    it('FORTBILDUNG: 09:00-17:00', () => {
        const { start, end } = getDefaultTimes('2025-01-08', 'FORTBILDUNG')
        expect(start.getHours()).toBe(9)
        expect(end.getHours()).toBe(17)
    })

    // =============================================================================
    // EINSCHULUNG
    // =============================================================================

    it('EINSCHULUNG: 13:00-15:00', () => {
        const { start, end } = getDefaultTimes('2025-01-08', 'EINSCHULUNG')
        expect(start.getHours()).toBe(13)
        expect(end.getHours()).toBe(15)
    })

    // =============================================================================
    // MITARBEITERGESPRAECH
    // =============================================================================

    it('MITARBEITERGESPRAECH: 10:00-11:00', () => {
        const { start, end } = getDefaultTimes('2025-01-08', 'MITARBEITERGESPRAECH')
        expect(start.getHours()).toBe(10)
        expect(end.getHours()).toBe(11)
    })

    // =============================================================================
    // SONSTIGES
    // =============================================================================

    it('SONSTIGES: 10:00-11:00', () => {
        const { start, end } = getDefaultTimes('2025-01-08', 'SONSTIGES')
        expect(start.getHours()).toBe(10)
        expect(end.getHours()).toBe(11)
    })

    // =============================================================================
    // Unknown type
    // =============================================================================

    it('unknown type returns null start and end', () => {
        const { start, end } = getDefaultTimes('2025-01-08', 'UNKNOWN_TYPE')
        expect(start).toBeNull()
        expect(end).toBeNull()
    })

    // =============================================================================
    // Return type
    // =============================================================================

    it('returns Date objects', () => {
        const { start, end } = getDefaultTimes('2025-01-08', 'TD1')
        expect(start).toBeInstanceOf(Date)
        expect(end).toBeInstanceOf(Date)
    })
})
