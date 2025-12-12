import { describe, it, expect } from 'vitest'
import { calculateWorkHours, calculateDailyAbsenceHours } from './timeCalculations'

describe('calculateWorkHours', () => {
    it('calculates simple day shift duration', () => {
        const start = '2025-05-10T08:00:00'
        const end = '2025-05-10T16:00:00'
        const hours = calculateWorkHours(start, end, 'Tag')
        expect(hours).toBe(8.0)
    })

    it('handles night duty (ND) readiness window logic', () => {
        // Start 18:00, End 08:00 next day
        // Readiness: 00:30 - 06:00 (5.5 hours) -> Credited at 50% = 2.75h
        // Active: 18:00-00:30 (6.5h) + 06:00-08:00 (2h) = 8.5h
        // Total Expected: 8.5 + 2.75 = 11.25h

        const start = '2025-05-10T18:00:00'
        const end = '2025-05-11T08:00:00'
        const hours = calculateWorkHours(start, end, 'ND')
        expect(hours).toBe(11.25)
    })

    it('inflates short interruptions during readiness to 30 mins', () => {
        // Readiness window is 00:30-06:00
        // Interruption: 02:00 - 02:10 (10 mins)
        // Inflated: 02:00 - 02:30 (30 mins)
        // Credit: 30 mins active (0.5h)
        // Deduction from passive: 10 mins (0.166h)

        const start = '2025-05-10T18:00:00'
        const end = '2025-05-11T08:00:00'

        const interruptionStart = '2025-05-11T02:00:00'
        const interruptionEnd = '2025-05-11T02:10:00'

        const hours = calculateWorkHours(start, end, 'ND', [
            { start: interruptionStart, end: interruptionEnd }
        ])

        // Base ND (without interruption): 11.25
        // Change:
        // + 30 mins active (0.5h)
        // - 10 mins passive (10 mins * 0.5 = 5 mins = 0.0833h lost from passive)
        // Net Change: +0.5 - 0.0833 = +0.4166
        // Expected: 11.25 + 0.4166 = 11.666... -> 11.67

        expect(hours).toBe(11.67)
    })

    it('handles null/undefined inputs gracefully', () => {
        expect(calculateWorkHours(null, null, 'Tag')).toBe(0)
        expect(calculateWorkHours(undefined, undefined, 'ND')).toBe(0)
        expect(calculateWorkHours('2025-05-10T08:00:00', null, 'Tag')).toBe(0)
    })
})

// =============================================================================
// ABSENCE CALCULATION TESTS
// =============================================================================

describe('calculateDailyAbsenceHours', () => {
    // Standard test profile: 40h week = 8h/day
    const profile40h = { weekly_hours: 40 }
    // Part-time profile: 20h week = 4h/day
    const profile20h = { weekly_hours: 20 }

    // ----- VACATION TESTS -----
    describe('Vacation (Urlaub)', () => {
        it('credits daily hours for weekday vacation (40h week)', () => {
            // Wednesday, 15 Jan 2025 (no holiday)
            const date = new Date(2025, 0, 15)
            const absence = { type: 'Urlaub' }

            const hours = calculateDailyAbsenceHours(date, absence, [], profile40h)
            expect(hours).toBe(8) // 40h / 5 = 8h
        })

        it('credits correct hours for part-time (20h week)', () => {
            // Thursday, 16 Jan 2025
            const date = new Date(2025, 0, 16)
            const absence = { type: 'Urlaub' }

            const hours = calculateDailyAbsenceHours(date, absence, [], profile20h)
            expect(hours).toBe(4) // 20h / 5 = 4h
        })

        it('returns 0 for weekend vacation (Saturday)', () => {
            // Saturday, 18 Jan 2025
            const date = new Date(2025, 0, 18)
            const absence = { type: 'Urlaub' }

            const hours = calculateDailyAbsenceHours(date, absence, [], profile40h)
            expect(hours).toBe(0)
        })

        it('returns 0 for weekend vacation (Sunday)', () => {
            // Sunday, 19 Jan 2025
            const date = new Date(2025, 0, 19)
            const absence = { type: 'Urlaub' }

            const hours = calculateDailyAbsenceHours(date, absence, [], profile40h)
            expect(hours).toBe(0)
        })

        it('returns 0 for vacation on public holiday (1. Mai)', () => {
            // 1 May 2025 = Staatsfeiertag (Thursday)
            const date = new Date(2025, 4, 1)
            const absence = { type: 'Urlaub' }

            const hours = calculateDailyAbsenceHours(date, absence, [], profile40h)
            expect(hours).toBe(0)
        })

        it('returns 0 for vacation on Heilige Drei Könige', () => {
            // 6 Jan 2025 = Heilige Drei Könige (Monday)
            const date = new Date(2025, 0, 6)
            const absence = { type: 'Urlaub' }

            const hours = calculateDailyAbsenceHours(date, absence, [], profile40h)
            expect(hours).toBe(0)
        })

        it('ignores planned shifts for vacation (only uses standard hours)', () => {
            // Wednesday with a 10h shift planned - should still return 8h
            const date = new Date(2025, 0, 15)
            const absence = { type: 'Urlaub' }
            const plannedShifts = [{
                id: 'shift-1',
                start_time: '2025-01-15T08:00:00',
                end_time: '2025-01-15T18:00:00', // 10h shift
                type: 'Tag'
            }]

            const hours = calculateDailyAbsenceHours(date, absence, plannedShifts, profile40h)
            expect(hours).toBe(8) // Standard hours, NOT shift hours
        })
    })

    // ----- SICK LEAVE TESTS -----
    describe('Sick Leave (Krankenstand)', () => {
        it('uses planned shift hours for sick day', () => {
            // Wednesday with 8h shift
            const date = new Date(2025, 0, 15)
            const absence = { type: 'Krankenstand' }
            const plannedShifts = [{
                id: 'shift-1',
                start_time: '2025-01-15T08:00:00',
                end_time: '2025-01-15T16:00:00', // 8h shift
                type: 'Tag'
            }]

            const hours = calculateDailyAbsenceHours(date, absence, plannedShifts, profile40h)
            expect(hours).toBe(8)
        })

        it('sums multiple planned shifts for sick day', () => {
            // Day with 2 shifts
            const date = new Date(2025, 0, 15)
            const absence = { type: 'Krankenstand' }
            const plannedShifts = [
                {
                    id: 'shift-1',
                    start_time: '2025-01-15T08:00:00',
                    end_time: '2025-01-15T12:00:00', // 4h
                    type: 'Tag'
                },
                {
                    id: 'shift-2',
                    start_time: '2025-01-15T14:00:00',
                    end_time: '2025-01-15T18:00:00', // 4h
                    type: 'Tag'
                }
            ]

            const hours = calculateDailyAbsenceHours(date, absence, plannedShifts, profile40h)
            expect(hours).toBe(8) // 4h + 4h
        })

        it('returns 0 for sick day without planned shift', () => {
            // No shift planned for this day
            const date = new Date(2025, 0, 15)
            const absence = { type: 'Krankenstand' }

            const hours = calculateDailyAbsenceHours(date, absence, [], profile40h)
            expect(hours).toBe(0)
        })

        it('returns 0 for sick weekend even if shift existed', () => {
            // Saturday with no shift - should be 0
            const date = new Date(2025, 0, 18)
            const absence = { type: 'Krankenstand' }

            const hours = calculateDailyAbsenceHours(date, absence, [], profile40h)
            expect(hours).toBe(0)
        })

        it('uses stored planned_hours when available (single day)', () => {
            // Absence with stored planned_hours (happens when shift was deleted after sick report)
            const date = new Date(2025, 0, 15)
            const absence = {
                type: 'Krankenstand',
                planned_hours: 10.25, // Night shift hours
                start_date: '2025-01-15',
                end_date: '2025-01-15'
            }

            const hours = calculateDailyAbsenceHours(date, absence, [], profile40h)
            expect(hours).toBe(10.25)
        })

        it('divides stored planned_hours by days for multi-day sick leave', () => {
            // 3-day sick leave with total 24 planned hours
            const date = new Date(2025, 0, 15) // One of the 3 days
            const absence = {
                type: 'Krankenstand',
                planned_hours: 24, // Total for 3 days
                start_date: '2025-01-15',
                end_date: '2025-01-17' // 3 days
            }

            const hours = calculateDailyAbsenceHours(date, absence, [], profile40h)
            expect(hours).toBe(8) // 24h / 3 days = 8h
        })

        it('recognizes "krank" in type name (case insensitive)', () => {
            const date = new Date(2025, 0, 15)
            const absence = { type: 'Krankmeldung' } // Contains "krank"

            const hours = calculateDailyAbsenceHours(date, absence, [], profile40h)
            expect(hours).toBe(0) // No shift, so 0 (not standard hours like vacation)
        })

        it('recognizes reason: sick as sick leave', () => {
            const date = new Date(2025, 0, 15)
            const absence = { reason: 'sick', type: 'Something' }

            const hours = calculateDailyAbsenceHours(date, absence, [], profile40h)
            expect(hours).toBe(0) // Treated as sick leave (no shift = 0)
        })
    })

    // ----- EDGE CASES -----
    describe('Edge Cases', () => {
        it('handles string date input', () => {
            const absence = { type: 'Urlaub' }
            const hours = calculateDailyAbsenceHours('2025-01-15', absence, [], profile40h)
            expect(hours).toBe(8)
        })

        it('defaults to 40h week when profile is null', () => {
            const date = new Date(2025, 0, 15) // Wednesday
            const absence = { type: 'Urlaub' }

            const hours = calculateDailyAbsenceHours(date, absence, [], null)
            expect(hours).toBe(8) // 40h / 5 = 8
        })

        it('handles ND shift calculation for sick leave', () => {
            // Night shift should calculate correctly
            const date = new Date(2025, 0, 15)
            const absence = { type: 'Krankenstand' }
            const ndShift = [{
                id: 'nd-1',
                start_time: '2025-01-15T18:00:00',
                end_time: '2025-01-16T08:00:00',
                type: 'ND'
            }]

            const hours = calculateDailyAbsenceHours(date, absence, ndShift, profile40h)
            // ND: 14h total, Readiness 5.5h at 50% = 2.75h
            // Active: 8.5h, Total: 11.25h
            expect(hours).toBe(11.25)
        })
    })
})
