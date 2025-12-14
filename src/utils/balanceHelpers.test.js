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
})

