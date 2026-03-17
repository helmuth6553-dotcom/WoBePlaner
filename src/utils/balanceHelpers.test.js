import { describe, it, expect } from 'vitest'
import { calculateGenericBalance } from './balanceHelpers'

describe('calculateGenericBalance', () => {
    // ==========================================================================
    // BASIC CALCULATION TESTS
    // ==========================================================================

    it('calculates perfect week (0 balance)', () => {
        // Mock Profile: 40h week, started Jan 1st
        const profile = {
            start_date: '2024-01-01',
            weekly_hours: 40
        }

        // Current Date: End of Jan week 1 (Friday Jan 5th)
        // Target: Mon-Fri = 5 days * 8h = 40h
        const currentDate = new Date('2024-01-05T18:00:00')

        // Worked: 5 shifts of 8 hours
        const timeEntries = [
            { shift_id: '1', calculated_hours: 8 },
            { shift_id: '2', calculated_hours: 8 },
            { shift_id: '3', calculated_hours: 8 },
            { shift_id: '4', calculated_hours: 8 },
            { shift_id: '5', calculated_hours: 8 }
        ]

        // Mock shifts to match IDs (dates needed for filter)
        // MUST use start_time string
        const historyShifts = [
            { id: '1', start_time: '2024-01-01T08:00:00' },
            { id: '2', start_time: '2024-01-02T08:00:00' },
            { id: '3', start_time: '2024-01-03T08:00:00' },
            { id: '4', start_time: '2024-01-04T08:00:00' },
            { id: '5', start_time: '2024-01-05T08:00:00' }
        ]

        const balance = calculateGenericBalance(
            profile,
            historyShifts,
            [], // uses historyAbsences 
            timeEntries,
            currentDate
        )

        // MONTHLY Based Result
        // Target Jan 2024 (22 workdays * 8h) = 176h
        // Actual: 40h
        expect(balance.actual).toBeCloseTo(40)
        expect(balance.target).toBe(176)
    })

    it('detects overtime correctly (10h work)', () => {
        const profile = { start_date: '2024-01-01', weekly_hours: 40 }
        const currentDate = new Date('2024-01-01T18:00:00')

        // Worked 10 hours on Jan 1st
        const timeEntries = [{ shift_id: '1', calculated_hours: 10 }]
        const historyShifts = [{ id: '1', start_time: '2024-01-01T08:00:00' }]

        const balance = calculateGenericBalance(
            profile,
            historyShifts,
            [],
            timeEntries,
            currentDate
        )

        expect(balance.actual).toBeCloseTo(10)
        expect(balance.target).toBe(176)
    })

    it('credits public holidays automatically (reduces target)', () => {
        // Scenario: May 2024 (Austrian Holidays)
        // Profile: 40h/week -> 8h/day
        const profile = { start_date: '2024-01-01', weekly_hours: 40 }

        // May 2024 Analysis:
        // Total Weekdays: 23
        // Holidays (Austria): 
        // - 01.05 (Staatsfeiertag)
        // - 09.05 (Christi Himmelfahrt)
        // - 20.05 (Pfingstmontag)
        // - 30.05 (Fronleichnam)
        // Total Holidays on Weekdays: 4

        // Expected Work Days: 23 - 4 = 19 days
        // Expected Target: 19 * 8 = 152 hours

        const currentDate = new Date('2024-05-31T12:00:00')

        const balance = calculateGenericBalance(
            profile,
            [],
            [],
            [],
            currentDate
        )

        expect(balance.target).toBe(152)
    })

    // ==========================================================================
    // CARRYOVER TESTS (Übertrag)
    // ==========================================================================

    describe('Carryover (Übertrag)', () => {
        it('calculates positive carryover from previous month', () => {
            // Employee started Jan 1st, worked 180h in January (4h overtime)
            // Now in February
            const profile = { start_date: '2024-01-01', weekly_hours: 40 }
            const currentDate = new Date('2024-02-15T12:00:00')

            // January shifts: 23 workdays * 8h = 184h target
            // Worked: 188h (4h overtime)
            const januaryShifts = []
            for (let day = 2; day <= 31; day++) {
                const dateStr = `2024-01-${day.toString().padStart(2, '0')}`
                const dayOfWeek = new Date(dateStr).getDay()
                // Skip weekends (0 = Sunday, 6 = Saturday)
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    januaryShifts.push({
                        id: `jan-${day}`,
                        start_time: `${dateStr}T08:00:00`,
                        end_time: `${dateStr}T16:30:00` // 8.5h each
                    })
                }
            }

            const timeEntries = januaryShifts.map(s => ({
                shift_id: s.id,
                calculated_hours: 8.5
            }))

            const balance = calculateGenericBalance(
                profile,
                januaryShifts,
                [],
                timeEntries,
                currentDate
            )

            // Carryover should be positive (overtime from January)
            expect(balance.carryover).toBeGreaterThan(0)
        })

        it('calculates negative carryover (Minusstunden)', () => {
            // Employee started Jan 1st, worked only 160h in January (16h less than required)
            const profile = { start_date: '2024-01-01', weekly_hours: 40 }
            const currentDate = new Date('2024-02-15T12:00:00')

            // Only 20 workdays of shifts instead of 23 (missing 3 days)
            const januaryShifts = []
            let shiftCount = 0
            for (let day = 2; day <= 28 && shiftCount < 20; day++) {
                const dateStr = `2024-01-${day.toString().padStart(2, '0')}`
                const dayOfWeek = new Date(dateStr).getDay()
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    januaryShifts.push({
                        id: `jan-${day}`,
                        start_time: `${dateStr}T08:00:00`,
                        end_time: `${dateStr}T16:00:00` // 8h each
                    })
                    shiftCount++
                }
            }

            const timeEntries = januaryShifts.map(s => ({
                shift_id: s.id,
                calculated_hours: 8
            }))

            const balance = calculateGenericBalance(
                profile,
                januaryShifts,
                [],
                timeEntries,
                currentDate
            )

            // Carryover should be negative (Minusstunden)
            expect(balance.carryover).toBeLessThan(0)
        })
    })

    // ==========================================================================
    // ADMIN CORRECTIONS TESTS
    // ==========================================================================

    describe('Admin Corrections (Korrekturen)', () => {
        it('applies positive correction to current month', () => {
            const profile = { start_date: '2024-01-01', weekly_hours: 40 }
            const currentDate = new Date('2024-02-15T12:00:00')

            // Admin adds +5 hours correction for February
            const corrections = [{
                id: 'corr-1',
                effective_month: '2024-02-01',
                correction_hours: 5,
                notes: 'Nachbuchung Fortbildung'
            }]

            const balance = calculateGenericBalance(
                profile,
                [],
                [],
                [],
                currentDate,
                corrections
            )

            expect(balance.correction).toBe(5)
            expect(balance.actual).toBe(5) // Correction adds to actual
        })

        it('applies negative correction (deduction)', () => {
            const profile = { start_date: '2024-01-01', weekly_hours: 40 }
            const currentDate = new Date('2024-02-15T12:00:00')

            // Admin deducts 3 hours
            const corrections = [{
                id: 'corr-1',
                effective_month: '2024-02-01',
                correction_hours: -3,
                notes: 'Korrektur Fehlbuchung'
            }]

            const balance = calculateGenericBalance(
                profile,
                [],
                [],
                [],
                currentDate,
                corrections
            )

            expect(balance.correction).toBe(-3)
            expect(balance.actual).toBe(-3)
        })

        it('ignores corrections from other months', () => {
            const profile = { start_date: '2024-01-01', weekly_hours: 40 }
            const currentDate = new Date('2024-02-15T12:00:00')

            // Correction is for January, not February
            const corrections = [{
                id: 'corr-1',
                effective_month: '2024-01-01',
                correction_hours: 10,
                notes: 'January correction'
            }]

            const balance = calculateGenericBalance(
                profile,
                [],
                [],
                [],
                currentDate,
                corrections
            )

            // Should NOT affect current month's calculation
            expect(balance.correction).toBe(0)
        })

        it('sums multiple corrections for same month', () => {
            const profile = { start_date: '2024-01-01', weekly_hours: 40 }
            const currentDate = new Date('2024-02-15T12:00:00')

            const corrections = [
                { id: 'corr-1', effective_month: '2024-02-01', correction_hours: 3 },
                { id: 'corr-2', effective_month: '2024-02-15', correction_hours: 2 },
                { id: 'corr-3', effective_month: '2024-02-28', correction_hours: -1 }
            ]

            const balance = calculateGenericBalance(
                profile,
                [],
                [],
                [],
                currentDate,
                corrections
            )

            expect(balance.correction).toBe(4) // 3 + 2 - 1
        })
    })

    // ==========================================================================
    // INITIAL BALANCE TESTS
    // ==========================================================================

    describe('Initial Balance (Anfangssaldo)', () => {
        it('includes initial balance in carryover', () => {
            // Employee migrated with +15h existing balance
            const profile = {
                start_date: '2024-01-01',
                weekly_hours: 40,
                initial_balance: 15
            }
            const currentDate = new Date('2024-01-15T12:00:00')

            const balance = calculateGenericBalance(
                profile,
                [],
                [],
                [],
                currentDate
            )

            // Initial balance should be part of carryover
            expect(balance.carryover).toBe(15)
        })

        it('combines initial balance with calculated carryover', () => {
            // Employee has +10h initial balance BUT massive negative carryover from low work
            const profile = {
                start_date: '2024-01-01',
                weekly_hours: 40,
                initial_balance: 10
            }
            const currentDate = new Date('2024-02-15T12:00:00')

            // Minimal test: January with only 10h work (target ~176h)
            // This creates MASSIVE negative carryover
            const januaryShifts = [{
                id: 'jan-1',
                start_time: '2024-01-02T08:00:00',
                end_time: '2024-01-02T18:00:00' // 10h on one day
            }]

            const timeEntries = [{ shift_id: 'jan-1', calculated_hours: 10 }]

            const balance = calculateGenericBalance(
                profile,
                januaryShifts,
                [],
                timeEntries,
                currentDate
            )

            // Carryover = initial_balance (10) + calculated_carryover (negative ~166h)
            // The initial balance increases the carryover by 10 compared to if it was 0
            // We verify the function considers initial_balance by checking it's not just the raw negative
            expect(balance.carryover).toBeLessThan(0) // Still negative due to massive underhours
            // But with initial_balance = 10, it's 10 higher than without it
            const balanceWithoutInitial = calculateGenericBalance(
                { ...profile, initial_balance: 0 },
                januaryShifts,
                [],
                timeEntries,
                currentDate
            )
            expect(balance.carryover - balanceWithoutInitial.carryover).toBe(10)
        })

    })

    // ==========================================================================
    // PART-TIME AND MID-MONTH START
    // ==========================================================================

    describe('Part-Time and Prorated Months', () => {
        it('calculates correct target for 20h/week employee', () => {
            const profile = { start_date: '2024-01-01', weekly_hours: 20 }
            const currentDate = new Date('2024-01-31T12:00:00')

            const balance = calculateGenericBalance(
                profile,
                [],
                [],
                [],
                currentDate
            )

            // January 2024: 23 workdays
            // 20h/week = 4h/day
            // Target: 23 * 4 = 92h (adjusted for Heilige Drei Könige: 22 * 4 = 88h)
            expect(balance.target).toBe(88)
        })

        it('prorates target for mid-month start', () => {
            // Employee starts on Jan 15th
            const profile = { start_date: '2024-01-15', weekly_hours: 40 }
            const currentDate = new Date('2024-01-31T12:00:00')

            const balance = calculateGenericBalance(
                profile,
                [],
                [],
                [],
                currentDate
            )

            // From Jan 15-31: count only workdays from 15th onwards
            // Less than full month target
            expect(balance.target).toBeLessThan(176)
            expect(balance.target).toBeGreaterThan(0)
        })

        it('returns 0 target for future start date', () => {
            // Employee starts next month
            const profile = { start_date: '2024-02-01', weekly_hours: 40 }
            const currentDate = new Date('2024-01-15T12:00:00')

            const balance = calculateGenericBalance(
                profile,
                [],
                [],
                [],
                currentDate
            )

            expect(balance.target).toBe(0)
        })
    })

    // ==========================================================================
    // RETURN VALUE STRUCTURE
    // ==========================================================================

    describe('Return Value Structure', () => {
        it('returns all required fields', () => {
            const profile = { start_date: '2024-01-01', weekly_hours: 40 }
            const currentDate = new Date('2024-01-15T12:00:00')

            const balance = calculateGenericBalance(
                profile,
                [],
                [],
                [],
                currentDate
            )

            expect(balance).toHaveProperty('target')
            expect(balance).toHaveProperty('actual')
            expect(balance).toHaveProperty('vacation')
            expect(balance).toHaveProperty('diff')
            expect(balance).toHaveProperty('carryover')
            expect(balance).toHaveProperty('correction')
            expect(balance).toHaveProperty('total')
        })

        it('returns null for missing profile', () => {
            const balance = calculateGenericBalance(null, [], [], [])
            expect(balance).toBeNull()
        })

        it('returns null for invalid start date', () => {
            const profile = { start_date: 'invalid-date', weekly_hours: 40 }
            const balance = calculateGenericBalance(profile, [], [], [])
            expect(balance).toBeNull()
        })
    })

    // ==========================================================================
    // DETAILED MODE TESTS
    // ==========================================================================

    describe('detailed mode (options.detailed = true)', () => {
        const detailedOpts = { detailed: true }

        it('returns shiftTypeHours, absenceBreakdown, interruptions when detailed', () => {
            const profile = { start_date: '2024-01-01', weekly_hours: 40 }
            const currentDate = new Date('2024-01-15T18:00:00')
            const shifts = [{ id: '1', start_time: '2024-01-15T08:00:00', end_time: '2024-01-15T16:00:00', type: 'TD1' }]
            const entries = [{ shift_id: '1', calculated_hours: 8 }]

            const b = calculateGenericBalance(profile, shifts, [], entries, currentDate, [], detailedOpts)

            expect(b).toHaveProperty('shiftTypeHours')
            expect(b).toHaveProperty('absenceBreakdown')
            expect(b).toHaveProperty('interruptions')
            expect(b.shiftTypeHours.TD1.hours).toBe(8)
            expect(b.shiftTypeHours.TD1.count).toBe(1)
        })

        it('does NOT return detailed fields without options.detailed', () => {
            const profile = { start_date: '2024-01-01', weekly_hours: 40 }
            const currentDate = new Date('2024-01-15T18:00:00')
            const b = calculateGenericBalance(profile, [], [], [], currentDate, [])

            expect(b).not.toHaveProperty('shiftTypeHours')
            expect(b).not.toHaveProperty('absenceBreakdown')
            expect(b).not.toHaveProperty('interruptions')
        })

        it('shiftTypeHours sum matches actual (without corrections)', () => {
            const profile = { start_date: '2024-01-01', weekly_hours: 40 }
            const currentDate = new Date('2024-01-15T18:00:00')
            const shifts = [
                { id: '1', start_time: '2024-01-15T08:00:00', end_time: '2024-01-15T16:00:00', type: 'TD1' },
                { id: '2', start_time: '2024-01-16T20:00:00', end_time: '2024-01-17T08:00:00', type: 'ND' }
            ]
            const entries = [
                { shift_id: '1', calculated_hours: 8 },
                { shift_id: '2', calculated_hours: 9.25 }
            ]

            const b = calculateGenericBalance(profile, shifts, [], entries, currentDate, [], detailedOpts)

            const totalShiftHours = Object.values(b.shiftTypeHours).reduce((sum, v) => sum + v.hours, 0)
            expect(totalShiftHours).toBeCloseTo(b.actual)
        })

        it('tracks merged TD1+TD2 as type TD', () => {
            const profile = { start_date: '2024-01-01', weekly_hours: 40 }
            const currentDate = new Date('2024-01-15T18:00:00')
            const shifts = [
                { id: 'td1', start_time: '2024-01-15T08:00:00', end_time: '2024-01-15T16:30:00', type: 'TD1' },
                { id: 'td2', start_time: '2024-01-15T16:00:00', end_time: '2024-01-15T22:00:00', type: 'TD2' }
            ]
            // Merged entries: identical actual_start/actual_end
            const entries = [
                { shift_id: 'td1', calculated_hours: 14, actual_start: '2024-01-15T08:00:00', actual_end: '2024-01-15T22:00:00' },
                { shift_id: 'td2', calculated_hours: 14, actual_start: '2024-01-15T08:00:00', actual_end: '2024-01-15T22:00:00' }
            ]

            const b = calculateGenericBalance(profile, shifts, [], entries, currentDate, [], detailedOpts)

            expect(b.shiftTypeHours.TD.hours).toBe(14)
            expect(b.shiftTypeHours.TD.count).toBe(1)
            expect(b.shiftTypeHours.TD1.hours).toBe(0)
            expect(b.shiftTypeHours.TD2.hours).toBe(0)
            expect(b.actual).toBe(14)
        })

        it('tracks non-merged TD1+TD2 with overlap subtracted from TD2', () => {
            const profile = { start_date: '2024-01-01', weekly_hours: 40 }
            const currentDate = new Date('2024-01-15T18:00:00')
            const shifts = [
                { id: 'td1', start_time: '2024-01-15T08:00:00', end_time: '2024-01-15T16:30:00', type: 'TD1' },
                { id: 'td2', start_time: '2024-01-15T16:00:00', end_time: '2024-01-15T22:00:00', type: 'TD2' }
            ]
            // No entries = use shift times, overlap = 30min
            const b = calculateGenericBalance(profile, shifts, [], [], currentDate, [], detailedOpts)

            // TD1: 8.5h, TD2: 6h - 0.5h overlap = 5.5h
            expect(b.shiftTypeHours.TD1.hours).toBeCloseTo(8.5)
            expect(b.shiftTypeHours.TD2.hours).toBeCloseTo(5.5)
            expect(b.shiftTypeHours.TD1.count).toBe(1)
            expect(b.shiftTypeHours.TD2.count).toBe(1)
            expect(b.actual).toBeCloseTo(14) // 8.5 + 5.5
        })

        it('tracks TEAM shifts correctly (excluded on absence days)', () => {
            const profile = { start_date: '2024-01-01', weekly_hours: 40 }
            const currentDate = new Date('2024-01-15T18:00:00')
            const shifts = [
                { id: 'team1', start_time: '2024-01-15T14:00:00', end_time: '2024-01-15T15:00:00', type: 'TEAM' },
                { id: 'team2', start_time: '2024-01-16T14:00:00', end_time: '2024-01-16T15:00:00', type: 'TEAM' }
            ]
            // Absence on Jan 16 = TEAM excluded
            const absences = [{
                start_date: '2024-01-16',
                end_date: '2024-01-16',
                type: 'Urlaub'
            }]

            const b = calculateGenericBalance(profile, shifts, absences, [], currentDate, [], detailedOpts)

            expect(b.shiftTypeHours.TEAM.count).toBe(1) // Only team1 counted
            expect(b.shiftTypeHours.TEAM.hours).toBeCloseTo(1)
        })

        it('tracks vacation in absenceBreakdown', () => {
            const profile = { start_date: '2024-01-01', weekly_hours: 40 }
            const currentDate = new Date('2024-01-15T18:00:00')
            // 3 workdays of vacation (Mon-Wed)
            const absences = [{
                start_date: '2024-01-15',
                end_date: '2024-01-17',
                type: 'Urlaub'
            }]

            const b = calculateGenericBalance(profile, [], absences, [], currentDate, [], detailedOpts)

            expect(b.absenceBreakdown.Urlaub.hours).toBeCloseTo(24) // 3 days * 8h
            expect(b.absenceBreakdown.Urlaub.days).toBe(3)
        })

        it('tracks sick with planned_hours in absenceBreakdown', () => {
            const profile = { start_date: '2024-01-01', weekly_hours: 40 }
            const currentDate = new Date('2024-01-15T18:00:00')
            const absences = [{
                start_date: '2024-01-15',
                end_date: '2024-01-15',
                type: 'Krank',
                planned_hours: 8.5
            }]

            const b = calculateGenericBalance(profile, [], absences, [], currentDate, [], detailedOpts)

            expect(b.absenceBreakdown.Krank.hours).toBeCloseTo(8.5)
            // Days not tracked for planned_hours path (no per-day iteration)
            expect(b.absenceBreakdown.Krank.days).toBe(0)
        })

        it('base fields are identical with and without detailed mode', () => {
            const profile = { start_date: '2024-01-01', weekly_hours: 40 }
            const currentDate = new Date('2024-01-15T18:00:00')
            const shifts = [
                { id: '1', start_time: '2024-01-15T08:00:00', end_time: '2024-01-15T16:00:00', type: 'TD1' },
                { id: '2', start_time: '2024-01-16T20:00:00', end_time: '2024-01-17T08:00:00', type: 'ND' }
            ]
            const entries = [
                { shift_id: '1', calculated_hours: 8 },
                { shift_id: '2', calculated_hours: 9.25 }
            ]
            const absences = [{ start_date: '2024-01-10', end_date: '2024-01-10', type: 'Urlaub' }]

            const normal = calculateGenericBalance(profile, shifts, absences, entries, currentDate)
            const detail = calculateGenericBalance(profile, shifts, absences, entries, currentDate, [], detailedOpts)

            expect(detail.target).toBe(normal.target)
            expect(detail.actual).toBe(normal.actual)
            expect(detail.vacation).toBe(normal.vacation)
            expect(detail.diff).toBe(normal.diff)
            expect(detail.carryover).toBe(normal.carryover)
            expect(detail.correction).toBe(normal.correction)
            expect(detail.total).toBe(normal.total)
        })
    })
})

