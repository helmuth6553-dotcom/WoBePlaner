import { describe, it, expect } from 'vitest'
import {
    constructIso,
    constructInterruptionIso,
    filterShiftsByStartDate,
    deduplicateEntries,
    expandAbsencesToItems
} from './timeTrackingHelpers'

// =============================================================================
// TESTS
// =============================================================================

describe('constructIso', () => {
    it('creates correct ISO from reference and time string', () => {
        const ref = '2025-01-15T08:00:00.000Z'
        const result = constructIso(ref, '14:30')

        expect(result).toContain('2025-01-15')
        const date = new Date(result)
        expect(date.getHours()).toBe(14)
        expect(date.getMinutes()).toBe(30)
    })

    it('returns null for null reference', () => {
        expect(constructIso(null, '08:00')).toBeNull()
    })

    it('returns null for null time string', () => {
        expect(constructIso('2025-01-15T08:00:00.000Z', null)).toBeNull()
    })

    it('returns null for empty time string', () => {
        expect(constructIso('2025-01-15T08:00:00.000Z', '')).toBeNull()
    })

    it('handles midnight correctly', () => {
        const ref = '2025-01-15T18:00:00.000Z'
        const result = constructIso(ref, '00:00')
        const date = new Date(result)
        expect(date.getHours()).toBe(0)
        expect(date.getMinutes()).toBe(0)
    })
})

describe('constructInterruptionIso', () => {
    it('keeps same day for afternoon time on afternoon shift', () => {
        const shiftStart = '2025-01-15T18:00:00.000Z'
        const result = constructInterruptionIso(shiftStart, '20:30')

        expect(result).toContain('2025-01-15')
        const date = new Date(result)
        expect(date.getHours()).toBe(20)
    })

    it('adds a day for morning time on afternoon shift (overnight)', () => {
        const shiftStart = '2025-01-15T18:00:00.000Z'
        const result = constructInterruptionIso(shiftStart, '03:00')

        // Should be Jan 16, not Jan 15
        expect(result).toContain('2025-01-16')
        const date = new Date(result)
        expect(date.getHours()).toBe(3)
    })

    it('returns null for null shift start', () => {
        expect(constructInterruptionIso(null, '08:00')).toBeNull()
    })

    it('returns null for null time string', () => {
        expect(constructInterruptionIso('2025-01-15T18:00:00.000Z', null)).toBeNull()
    })
})

describe('filterShiftsByStartDate', () => {
    const shifts = [
        { id: 1, start_time: '2025-01-10T08:00:00Z' },
        { id: 2, start_time: '2025-01-15T08:00:00Z' },
        { id: 3, start_time: '2025-01-20T08:00:00Z' },
    ]

    it('filters out shifts before start date', () => {
        const startDate = new Date('2025-01-15')
        const result = filterShiftsByStartDate(shifts, startDate)

        expect(result).toHaveLength(2)
        expect(result.map(s => s.id)).toEqual([2, 3])
    })

    it('returns all shifts if no start date', () => {
        const result = filterShiftsByStartDate(shifts, null)
        expect(result).toHaveLength(3)
    })

    it('filters out shifts without start_time', () => {
        const badShifts = [{ id: 1 }, { id: 2, start_time: '2025-01-20T08:00:00Z' }]
        const result = filterShiftsByStartDate(badShifts, new Date('2025-01-01'))
        expect(result).toHaveLength(1)
    })
})

describe('deduplicateEntries', () => {
    it('removes duplicate entries by ID', () => {
        const entries = [
            { id: 'a', value: 1 },
            { id: 'b', value: 2 },
            { id: 'a', value: 3 }, // duplicate ID, should be overwritten
        ]
        const result = deduplicateEntries(entries)

        expect(result).toHaveLength(2)
        // The last entry with id 'a' should win
        expect(result.find(e => e.id === 'a').value).toBe(3)
    })

    it('handles empty array', () => {
        expect(deduplicateEntries([])).toEqual([])
    })
})

describe('expandAbsencesToItems', () => {
    // Mock functions
    const mockCalculateHours = () => 8 // Always return 8 hours
    const mockCalculateWorkHours = (start, end, type) => 8

    const monthStart = new Date('2025-01-01')
    const monthEnd = new Date('2025-01-31')
    const profile = { weekly_hours: 40 }

    it('expands a single-day vacation into one item', () => {
        const absences = [{
            id: 'vac-1',
            start_date: '2025-01-15',
            end_date: '2025-01-15',
            type: 'Urlaub',
            status: 'genehmigt'
        }]

        const result = expandAbsencesToItems(
            absences, monthStart, monthEnd, [], profile,
            mockCalculateHours, mockCalculateWorkHours
        )

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('abs-vac-1-2025-01-15')
        expect(result[0].date).toBe('2025-01-15')
        expect(result[0].type).toBe('Urlaub')
        expect(result[0].itemType).toBe('absence')
    })

    it('expands a multi-day vacation into multiple items', () => {
        const absences = [{
            id: 'vac-2',
            start_date: '2025-01-10',
            end_date: '2025-01-12',
            type: 'Urlaub',
            status: 'genehmigt'
        }]

        const result = expandAbsencesToItems(
            absences, monthStart, monthEnd, [], profile,
            mockCalculateHours, mockCalculateWorkHours
        )

        expect(result).toHaveLength(3) // 10, 11, 12
        expect(result.map(r => r.date)).toEqual(['2025-01-10', '2025-01-11', '2025-01-12'])
    })

    it('clamps absence to month boundaries', () => {
        const absences = [{
            id: 'vac-3',
            start_date: '2024-12-28', // Before month
            end_date: '2025-01-03',   // Within month
            type: 'Urlaub',
            status: 'genehmigt'
        }]

        const result = expandAbsencesToItems(
            absences, monthStart, monthEnd, [], profile,
            mockCalculateHours, mockCalculateWorkHours
        )

        // Should only include Jan 1, 2, 3 (not Dec 28-31)
        expect(result).toHaveLength(3)
        expect(result[0].date).toBe('2025-01-01')
    })

    it('creates separate entries for sick leave with planned shifts', () => {
        const absences = [{
            id: 'sick-1',
            start_date: '2025-01-15',
            end_date: '2025-01-15',
            type: 'Krank',
            status: 'genehmigt',
            planned_shifts_snapshot: [
                { id: 's1', start_time: '2025-01-15T08:00:00Z', end_time: '2025-01-15T12:00:00Z', type: 'TD1' },
                { id: 's2', start_time: '2025-01-15T14:00:00Z', end_time: '2025-01-15T18:00:00Z', type: 'TD2' }
            ]
        }]

        const result = expandAbsencesToItems(
            absences, monthStart, monthEnd, [], profile,
            mockCalculateHours, mockCalculateWorkHours
        )

        // Should create 2 entries, one per shift
        expect(result).toHaveLength(2)
        expect(result[0].id).toBe('abs-sick-1-2025-01-15-0')
        expect(result[1].id).toBe('abs-sick-1-2025-01-15-1')
        expect(result[0].plannedShift.type).toBe('TD1')
        expect(result[1].plannedShift.type).toBe('TD2')
    })

    it('returns empty array for null absences', () => {
        const result = expandAbsencesToItems(
            null, monthStart, monthEnd, [], profile,
            mockCalculateHours, mockCalculateWorkHours
        )
        expect(result).toEqual([])
    })

    it('returns empty array for empty absences', () => {
        const result = expandAbsencesToItems(
            [], monthStart, monthEnd, [], profile,
            mockCalculateHours, mockCalculateWorkHours
        )
        expect(result).toEqual([])
    })

    it('skips days where calculateDailyAbsenceHours returns 0', () => {
        const absences = [{
            id: 'vac-4',
            start_date: '2025-01-15',
            end_date: '2025-01-17',
            type: 'Urlaub',
            status: 'genehmigt'
        }]

        // Mock that returns 0 for weekends
        const mockZeroHours = (day) => {
            const dow = day.getDay()
            return (dow === 0 || dow === 6) ? 0 : 8
        }

        const result = expandAbsencesToItems(
            absences, monthStart, monthEnd, [], profile,
            mockZeroHours, mockCalculateWorkHours
        )

        // 15=Wed, 16=Thu, 17=Fri - all weekdays, should have 3 items
        expect(result).toHaveLength(3)
    })
})
