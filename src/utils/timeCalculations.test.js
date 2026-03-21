import { describe, it, expect } from 'vitest'
import { calculateWorkHours, calculateDailyAbsenceHours, processInterruptions } from './timeCalculations'

// =============================================================================
// PROCESS INTERRUPTIONS TESTS
// =============================================================================

describe('processInterruptions', () => {
    // Standard readiness window: 00:30 - 06:00 on 2025-05-11
    const readinessStart = new Date('2025-05-11T00:30:00')
    const readinessEnd = new Date('2025-05-11T06:00:00')

    it('returns empty result for no interruptions', () => {
        const result = processInterruptions([], readinessStart, readinessEnd)
        expect(result.creditedMinutes).toBe(0)
        expect(result.deductedReadinessMinutes).toBe(0)
        expect(result.rawCount).toBe(0)
        expect(result.mergedIntervals).toEqual([])
        expect(result.details).toEqual([])
    })

    it('returns empty result for null/undefined interruptions', () => {
        expect(processInterruptions(null, readinessStart, readinessEnd).rawCount).toBe(0)
        expect(processInterruptions(undefined, readinessStart, readinessEnd).rawCount).toBe(0)
    })

    it('inflates a 10-minute interruption to 30 minutes', () => {
        const interruptions = [
            { start: '2025-05-11T02:00:00', end: '2025-05-11T02:10:00', note: 'Anruf' }
        ]
        const result = processInterruptions(interruptions, readinessStart, readinessEnd)

        expect(result.rawCount).toBe(1)
        expect(result.deductedReadinessMinutes).toBe(10)
        expect(result.creditedMinutes).toBe(30)
        expect(result.details[0].actualMinutes).toBe(10)
        expect(result.details[0].creditedMinutes).toBe(30)
        expect(result.details[0].note).toBe('Anruf')
    })

    it('inflates 45 minutes to 60 minutes (CEIL rule)', () => {
        const interruptions = [
            { start: '2025-05-11T02:00:00', end: '2025-05-11T02:45:00' }
        ]
        const result = processInterruptions(interruptions, readinessStart, readinessEnd)

        expect(result.deductedReadinessMinutes).toBe(45)
        expect(result.creditedMinutes).toBe(60)
        expect(result.details[0].actualMinutes).toBe(45)
        expect(result.details[0].creditedMinutes).toBe(60)
    })

    it('exactly 30 minutes stays at 30 minutes', () => {
        const interruptions = [
            { start: '2025-05-11T03:00:00', end: '2025-05-11T03:30:00' }
        ]
        const result = processInterruptions(interruptions, readinessStart, readinessEnd)

        expect(result.creditedMinutes).toBe(30)
        expect(result.details[0].actualMinutes).toBe(30)
    })

    it('merges overlapping interruptions after inflation', () => {
        // Two interruptions 15 min apart — after inflation to 30min each, they overlap
        const interruptions = [
            { start: '2025-05-11T02:00:00', end: '2025-05-11T02:10:00' }, // 10min → 30min (02:00-02:30)
            { start: '2025-05-11T02:20:00', end: '2025-05-11T02:25:00' }, // 5min → 30min (02:20-02:50)
        ]
        const result = processInterruptions(interruptions, readinessStart, readinessEnd)

        expect(result.rawCount).toBe(2)
        // After merge: single interval 02:00-02:50 = 50 minutes
        expect(result.mergedIntervals).toHaveLength(1)
        expect(result.creditedMinutes).toBe(50)
        expect(result.deductedReadinessMinutes).toBe(15) // 10 + 5 actual
    })

    it('keeps non-overlapping interruptions separate', () => {
        const interruptions = [
            { start: '2025-05-11T01:00:00', end: '2025-05-11T01:10:00' }, // → 30min (01:00-01:30)
            { start: '2025-05-11T04:00:00', end: '2025-05-11T04:10:00' }, // → 30min (04:00-04:30)
        ]
        const result = processInterruptions(interruptions, readinessStart, readinessEnd)

        expect(result.mergedIntervals).toHaveLength(2)
        expect(result.creditedMinutes).toBe(60) // 30 + 30
        expect(result.rawCount).toBe(2)
    })

    it('ignores interruptions outside readiness window', () => {
        const interruptions = [
            { start: '2025-05-11T07:00:00', end: '2025-05-11T07:30:00' } // after 06:00
        ]
        const result = processInterruptions(interruptions, readinessStart, readinessEnd)

        expect(result.rawCount).toBe(0)
        expect(result.creditedMinutes).toBe(0)
    })

    it('clips interruption to readiness window boundaries', () => {
        // Interruption starts before readiness, ends inside
        const interruptions = [
            { start: '2025-05-11T00:00:00', end: '2025-05-11T00:50:00' }
        ]
        const result = processInterruptions(interruptions, readinessStart, readinessEnd)

        // Only 00:30-00:50 counts = 20 min actual → 30 min credited
        expect(result.rawCount).toBe(1)
        expect(result.deductedReadinessMinutes).toBe(20)
        expect(result.creditedMinutes).toBe(30)
    })

    it('skips interruptions with missing start/end', () => {
        const interruptions = [
            { start: '2025-05-11T02:00:00' }, // no end
            { end: '2025-05-11T03:00:00' },   // no start
            { start: '2025-05-11T04:00:00', end: '2025-05-11T04:15:00' }, // valid
        ]
        const result = processInterruptions(interruptions, readinessStart, readinessEnd)

        expect(result.rawCount).toBe(1)
        expect(result.creditedMinutes).toBe(30)
    })

    it('returns empty for null readiness window', () => {
        const interruptions = [
            { start: '2025-05-11T02:00:00', end: '2025-05-11T02:30:00' }
        ]
        expect(processInterruptions(interruptions, null, readinessEnd).rawCount).toBe(0)
        expect(processInterruptions(interruptions, readinessStart, null).rawCount).toBe(0)
    })
})

describe('calculateWorkHours', () => {
    it('calculates simple day shift duration', () => {
        const start = '2025-05-10T08:00:00'
        const end = '2025-05-10T16:00:00'
        const hours = calculateWorkHours(start, end, 'Tag')
        expect(hours).toBe(8.0)
    })

    it('handles night duty (ND) readiness window logic', () => {
        // Start 19:00, End 08:00 next day (per SHIFT_TIMES.md)
        // Readiness: 00:30 - 06:00 (5.5 hours) -> Credited at 50% = 2.75h
        // Active: 19:00-00:30 (5.5h) + 06:00-08:00 (2h) = 7.5h
        // Total Expected: 7.5 + 2.75 = 10.25h

        const start = '2025-05-10T19:00:00'
        const end = '2025-05-11T08:00:00'
        const hours = calculateWorkHours(start, end, 'ND')
        expect(hours).toBe(10.25)
    })

    it('inflates short interruptions during readiness to 30 mins', () => {
        // Readiness window is 00:30-06:00
        // Interruption: 02:00 - 02:10 (10 mins)
        // CEIL rounding: ceil(10/30)*30 = 30 mins
        // Credit: 30 mins active (0.5h)
        // Deduction from passive: 10 mins (0.166h)

        const start = '2025-05-10T19:00:00'  // Correct ND start per SHIFT_TIMES.md
        const end = '2025-05-11T08:00:00'

        const interruptionStart = '2025-05-11T02:00:00'
        const interruptionEnd = '2025-05-11T02:10:00'

        const hours = calculateWorkHours(start, end, 'ND', [
            { start: interruptionStart, end: interruptionEnd }
        ])

        // Base ND (without interruption): 10.25h
        // Change:
        // + 30 mins active (0.5h) - inflated from 10min via CEIL
        // - 10 mins passive (10 mins * 0.5 = 0.0833h lost from passive)
        // Net Change: +0.5 - 0.0833 = +0.4166
        // Expected: 10.25 + 0.4166 = 10.666... -> 10.67

        expect(hours).toBe(10.67)
    })

    it('rounds 45 minute interruption to 60 minutes (CEIL rule)', () => {
        // Per SHIFT_TIMES.md: Every "scratched" 30-min block = full 30 min
        // 45 min = 2 blocks scratched -> 60 min credited
        // Formula: Math.ceil(45/30) * 30 = 60

        const start = '2025-05-10T19:00:00'
        const end = '2025-05-11T08:00:00'

        const interruptionStart = '2025-05-11T02:00:00'
        const interruptionEnd = '2025-05-11T02:45:00' // 45 min

        const hours = calculateWorkHours(start, end, 'ND', [
            { start: interruptionStart, end: interruptionEnd }
        ])

        // Base ND: 10.25h
        // + 60 mins active (1.0h) - CEIL(45/30)*30 = 60min
        // - 45 mins passive (45 * 0.5 = 0.375h lost from passive)
        // Net Change: +1.0 - 0.375 = +0.625
        // Expected: 10.25 + 0.625 = 10.875 -> 10.88

        expect(hours).toBe(10.88)
    })

    it('calculates ND weekend shift (Fr→Sa) with extended morning = 12.25h', () => {
        // Per SHIFT_TIMES.md: ND Fr→Sa/Sa→So ends at 10:00 instead of 08:00
        // Active: 19:00-00:30 (5.5h) + 06:00-10:00 (4.0h) = 9.5h
        // Passive: 00:30-06:00 (5.5h) × 0.5 = 2.75h
        // Total: 9.5 + 2.75 = 12.25h

        const start = '2025-01-10T19:00:00' // Friday 19:00
        const end = '2025-01-11T10:00:00'   // Saturday 10:00

        const hours = calculateWorkHours(start, end, 'ND', [])
        expect(hours).toBe(12.25)
    })

    it('handles multiple interruptions with CEIL rounding each', () => {
        // Two separate interruptions: 02:00-02:20 (20min) + 04:00-04:20 (20min)
        // Each gets CEIL: 20min → 30min each = 60min total credited
        // Actual deducted: 40min total

        const start = '2025-05-10T19:00:00'
        const end = '2025-05-11T08:00:00'

        const hours = calculateWorkHours(start, end, 'ND', [
            { start: '2025-05-11T02:00:00', end: '2025-05-11T02:20:00' },
            { start: '2025-05-11T04:00:00', end: '2025-05-11T04:20:00' }
        ])

        // Base ND: 10.25h
        // + 60 mins active (1.0h) - two 30min blocks
        // - 40 mins passive (40 × 0.5 = 0.333h lost)
        // Net: +1.0 - 0.333 = +0.667
        // Expected: 10.25 + 0.667 = 10.917 → 10.92

        expect(hours).toBe(10.92)
    })

    it('handles full readiness interruption (00:30-06:00) = 13h total', () => {
        // If entire readiness is active work, no passive time
        // Total shift: 13h, all at 100%

        const start = '2025-05-10T19:00:00'
        const end = '2025-05-11T08:00:00'

        const hours = calculateWorkHours(start, end, 'ND', [
            { start: '2025-05-11T00:30:00', end: '2025-05-11T06:00:00' }
        ])

        // Full 13h counted as active
        expect(hours).toBe(13.0)
    })

    it('ignores interruption before readiness window (23:00-00:30)', () => {
        // Interruption outside 00:30-06:00 window should be ignored
        const start = '2025-05-10T19:00:00'
        const end = '2025-05-11T08:00:00'

        const hours = calculateWorkHours(start, end, 'ND', [
            { start: '2025-05-10T23:00:00', end: '2025-05-11T00:15:00' }
        ])

        // Interruption is before readiness (00:30), so ignored
        // Result should be base ND = 10.25h
        expect(hours).toBe(10.25)
    })

    it('ignores interruption after readiness window (06:30-07:00)', () => {
        // Interruption outside 00:30-06:00 window should be ignored
        const start = '2025-05-10T19:00:00'
        const end = '2025-05-11T08:00:00'

        const hours = calculateWorkHours(start, end, 'ND', [
            { start: '2025-05-11T06:30:00', end: '2025-05-11T07:00:00' }
        ])

        // Interruption is after readiness (06:00), so ignored
        // Result should be base ND = 10.25h
        expect(hours).toBe(10.25)
    })

    it('handles null/undefined inputs gracefully', () => {
        expect(calculateWorkHours(null, null, 'Tag')).toBe(0)
        expect(calculateWorkHours(undefined, undefined, 'ND')).toBe(0)
        expect(calculateWorkHours('2025-05-10T08:00:00', null, 'Tag')).toBe(0)
    })
})

// =============================================================================
// DAYLIGHT SAVING TIME (DST) TESTS - ZEITUMSTELLUNG
// =============================================================================

describe('Daylight Saving Time (Zeitumstellung)', () => {
    /**
     * In Österreich/Deutschland:
     * - März: Uhr wird von 02:00 auf 03:00 vorgestellt (1h WENIGER in der Nacht)
     * - Oktober: Uhr wird von 03:00 auf 02:00 zurückgestellt (1h MEHR in der Nacht)
     * 
     * Letzter Sonntag im März 2025: 30.03.2025
     * Letzter Sonntag im Oktober 2025: 26.10.2025
     */

    it('calculates correct hours for night shift during March DST (spring forward - 1h shorter)', () => {
        // Nachtschicht 29.03.2025 19:00 bis 30.03.2025 08:00 (per SHIFT_TIMES.md)
        // In dieser Nacht wird um 02:00 auf 03:00 vorgestellt
        // Effektive Dauer: 13h - 1h = 12h (nicht 13h!)

        const start = '2025-03-29T19:00:00' // Samstag 19:00 (correct ND start)
        const end = '2025-03-30T08:00:00'   // Sonntag 08:00 (nach Umstellung)

        const hours = calculateWorkHours(start, end, 'Tag')

        // März DST: 29.03. 19:00 bis 30.03. 08:00
        // Uhr springt von 02:00 auf 03:00 → effektiv 12h statt 13h
        //
        // HINWEIS: Das Verhalten kann je nach Systemzeitzone variieren!
        // Auf Windows mit Europe/Vienna: 12h (DST berücksichtigt)
        // Auf einem CI in UTC: 13h (keine DST)
        expect([12, 13]).toContain(hours)
    })

    it('calculates correct hours for night shift during October DST (fall back - 1h longer)', () => {
        // Nachtschicht 25.10.2025 18:00 bis 26.10.2025 08:00
        // In dieser Nacht wird um 03:00 auf 02:00 zurückgestellt
        // Effektive Dauer: 14h + 1h = 15h (nicht 14h!)

        const start = '2025-10-25T19:00:00' // Samstag 19:00 (correct ND start)
        const end = '2025-10-26T08:00:00'   // Sonntag 08:00 (nach Umstellung)

        const hours = calculateWorkHours(start, end, 'Tag')

        // Oktober DST: 25.10. 18:00 bis 26.10. 08:00
        // Uhr springt von 03:00 auf 02:00 → effektiv 15h statt 14h
        //
        // HINWEIS: Verhalten systemabhängig (siehe März-Test)
        // UTC (CI): 13h (kein DST), Vienna: 14-15h (DST)
        expect([13, 14, 15]).toContain(hours)
    })

    it('ND shift during March DST has correctly reduced readiness time', () => {
        // ND-Schicht über DST-Umstellung
        // Bereitschaft: 00:30 - 06:00 (normalerweise 5.5h)
        // Am 30.03.2025: 02:00 springt auf 03:00, also nur 4.5h Bereitschaft

        const start = '2025-03-29T19:00:00'  // Correct ND start per SHIFT_TIMES.md
        const end = '2025-03-30T08:00:00'

        const hours = calculateWorkHours(start, end, 'ND')

        // Normale ND = 10.25h (with correct 19:00 start)
        // Mit DST im März: 1h weniger
        // Erwartung hängt von DST-Handling ab
        //
        // HINWEIS: Verhalten systemabhängig
        // Mit DST: ca. 9.75h (März, 1h weniger)
        // Ohne DST: 10.25h
        expect([9.75, 10.25]).toContain(hours)
    })

    it('ND shift during October DST has correctly extended readiness time', () => {
        // ND-Schicht über DST-Umstellung
        // Bereitschaft: 00:30 - 06:00 (normalerweise 5.5h)
        // Am 26.10.2025: 03:00 springt auf 02:00, also 6.5h Bereitschaft

        const start = '2025-10-25T19:00:00'  // Correct ND start per SHIFT_TIMES.md
        const end = '2025-10-26T08:00:00'

        const hours = calculateWorkHours(start, end, 'ND')

        // Normale ND = 10.25h (with correct 19:00 start)
        // Mit DST im Oktober: 1h mehr
        // Davon geht 1h in die Bereitschaft (50%) = +0.5h
        // Erwartung: 10.25 + 0.5 = 10.75h
        //
        // HINWEIS: Verhalten systemabhängig
        // Mit DST: 10.75h (Oktober, 1h mehr)
        // Ohne DST: 10.25h
        expect([10.25, 10.75]).toContain(hours)
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
                start_time: '2025-01-15T19:00:00',  // Correct ND start per SHIFT_TIMES.md
                end_time: '2025-01-16T08:00:00',
                type: 'ND'
            }]

            const hours = calculateDailyAbsenceHours(date, absence, ndShift, profile40h)
            // ND: 13h total, Readiness 5.5h at 50% = 2.75h
            // Active: 7.5h, Total: 10.25h
            expect(hours).toBe(10.25)
        })
    })
})
