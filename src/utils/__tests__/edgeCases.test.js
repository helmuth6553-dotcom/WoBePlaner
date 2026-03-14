/**
 * Edge Case Tests for WoBePlaner
 *
 * Tests critical business logic edge cases using REAL functions
 * from the codebase (not mocks).
 *
 * Run with: npx vitest run src/utils/__tests__/edgeCases.test.js
 */

import { describe, it, expect } from 'vitest'
import {
    eachDayOfInterval,
    parseISO,
    isWeekend,
    startOfMonth,
    endOfMonth,
    format,
    getYear,
    getMonth
} from 'date-fns'

import { calculateWorkHours, calculateDailyAbsenceHours } from '../timeCalculations'
import { calculateGenericBalance } from '../balanceHelpers'
import { getHolidays, isHoliday } from '../holidays'

describe('Edge Case Tests', () => {

    describe('Year-End Vacation Requests', () => {

        it('should correctly count vacation days across year boundary', () => {
            // Vacation from Dec 30, 2025 to Jan 2, 2026
            const absence = { reason: 'vacation', type: 'Urlaub', start_date: '2025-12-30', end_date: '2026-01-02' }
            const profile = { weekly_hours: 38.5 }

            const days = eachDayOfInterval({
                start: parseISO('2025-12-30'),
                end: parseISO('2026-01-02')
            })

            let totalHours = 0
            days.forEach(day => {
                totalHours += calculateDailyAbsenceHours(day, absence, [], profile)
            })

            // Dec 30 (Tue) = 7.7h, Dec 31 (Wed) = 7.7h
            // Jan 1 (Thu - Neujahr = Holiday) = 0h, Jan 2 (Fri) = 7.7h
            // 3 workdays * 7.7h = 23.1h
            const dailyHours = 38.5 / 5
            expect(totalHours).toBeCloseTo(dailyHours * 3, 1)
        })

        it('should handle vacation entirely within Christmas holidays', () => {
            // Dec 24-26
            const absence = { reason: 'vacation', type: 'Urlaub', start_date: '2025-12-24', end_date: '2025-12-26' }
            const profile = { weekly_hours: 38.5 }

            const days = eachDayOfInterval({
                start: parseISO('2025-12-24'),
                end: parseISO('2025-12-26')
            })

            let totalHours = 0
            days.forEach(day => {
                totalHours += calculateDailyAbsenceHours(day, absence, [], profile)
            })

            // Dec 24 (Wed - not a public holiday in Austria) = 7.7h
            // Dec 25 (Thu - Weihnachten = Holiday) = 0h
            // Dec 26 (Fri - Stefanitag = Holiday) = 0h
            // Only 1 workday
            const dailyHours = 38.5 / 5
            expect(totalHours).toBeCloseTo(dailyHours, 1)
        })

        it('should handle vacation starting on Saturday', () => {
            const absence = { reason: 'vacation', type: 'Urlaub', start_date: '2025-12-27', end_date: '2026-01-02' }
            const profile = { weekly_hours: 38.5 }

            const days = eachDayOfInterval({
                start: parseISO('2025-12-27'),
                end: parseISO('2026-01-02')
            })

            let totalHours = 0
            days.forEach(day => {
                totalHours += calculateDailyAbsenceHours(day, absence, [], profile)
            })

            // Dec 27 (Sat) = 0, Dec 28 (Sun) = 0, Dec 29 (Mon) = 7.7h, Dec 30 (Tue) = 7.7h
            // Dec 31 (Wed) = 7.7h, Jan 1 (Holiday) = 0, Jan 2 (Fri) = 7.7h
            // 4 workdays * 7.7h = 30.8h
            const dailyHours = 38.5 / 5
            expect(totalHours).toBeCloseTo(dailyHours * 4, 1)
        })
    })

    describe('Sick Leave Edge Cases', () => {

        it('should credit hours for planned shift on sick day (via snapshot)', () => {
            const absence = {
                reason: 'sick',
                type: 'Krank',
                start_date: '2025-01-15',
                end_date: '2025-01-15',
                planned_shifts_snapshot: [
                    {
                        start_time: '2025-01-15T08:00:00',
                        end_time: '2025-01-15T16:30:00',
                        type: 'TD1'
                    }
                ]
            }

            const hours = calculateDailyAbsenceHours('2025-01-15', absence, [], { weekly_hours: 38.5 })

            // 08:00 to 16:30 = 8.5 hours (TD1, no standby)
            expect(hours).toBe(8.5)
        })

        it('should credit ND hours for night shift sick leave (via snapshot)', () => {
            const absence = {
                reason: 'sick',
                type: 'Krank',
                start_date: '2025-01-15',
                end_date: '2025-01-15',
                planned_shifts_snapshot: [
                    {
                        start_time: '2025-01-15T19:00:00',
                        end_time: '2025-01-16T08:00:00',
                        type: 'ND'
                    }
                ]
            }

            const hours = calculateDailyAbsenceHours('2025-01-15', absence, [], { weekly_hours: 38.5 })

            // ND 19:00-08:00 with readiness 00:30-06:00 at 50% = 10.25h
            expect(hours).toBe(10.25)
        })

        it('should handle sick leave on holiday with planned shift', () => {
            // Sick on Jan 1 (Neujahr) but shift was planned
            const absence = {
                reason: 'sick',
                type: 'Krank',
                start_date: '2025-01-01',
                end_date: '2025-01-01',
                planned_shifts_snapshot: [
                    {
                        start_time: '2025-01-01T08:00:00',
                        end_time: '2025-01-01T16:30:00',
                        type: 'TD1'
                    }
                ]
            }

            const hours = calculateDailyAbsenceHours('2025-01-01', absence, [], { weekly_hours: 38.5 })

            // Sick leave uses planned hours regardless of holiday
            expect(hours).toBe(8.5)
        })

        it('should return 0 for sick leave with no planned shifts', () => {
            const absence = {
                reason: 'sick',
                type: 'Krank',
                start_date: '2025-01-15',
                end_date: '2025-01-15',
                planned_shifts_snapshot: []
            }

            const hours = calculateDailyAbsenceHours('2025-01-15', absence, [], { weekly_hours: 38.5 })

            // No shifts planned = 0h sick credit
            expect(hours).toBe(0)
        })

        it('should handle multi-day sick leave with varying shifts via live shifts fallback', () => {
            const absence = {
                reason: 'sick',
                type: 'Krank',
                start_date: '2025-01-13',
                end_date: '2025-01-15'
                // No snapshot - falls back to live planned shifts
            }

            const plannedShifts = [
                { start_time: '2025-01-13T08:00:00', end_time: '2025-01-13T16:30:00', type: 'TD1' }, // 8.5h
                { start_time: '2025-01-14T08:00:00', end_time: '2025-01-14T16:30:00', type: 'TD1' }, // 8.5h
                // No shift on Jan 15
            ]

            let totalHours = 0
            const days = eachDayOfInterval({ start: parseISO('2025-01-13'), end: parseISO('2025-01-15') })
            days.forEach(day => {
                totalHours += calculateDailyAbsenceHours(day, absence, plannedShifts, { weekly_hours: 38.5 })
            })

            expect(totalHours).toBe(17) // 8.5 + 8.5 + 0
        })
    })

    describe('Balance Calculation Edge Cases', () => {

        it('should show negative diff when no shifts worked', () => {
            const profile = { weekly_hours: 38.5, start_date: '2024-01-01' }
            const shifts = []
            const absences = []

            const balance = calculateGenericBalance(profile, shifts, absences, [], new Date('2025-01-15'))

            expect(balance.diff).toBeLessThan(0)
            expect(balance.actual).toBe(0)
            expect(balance.target).toBeGreaterThan(0)
        })

        it('should return null for invalid start date', () => {
            const profile = { weekly_hours: 38.5, start_date: 'not-a-date' }

            const balance = calculateGenericBalance(profile, [], [], [], new Date('2025-01-15'))

            expect(balance).toBeNull()
        })

        it('should handle initial_balance from profile', () => {
            const profile = {
                weekly_hours: 38.5,
                start_date: '2025-01-01',
                initial_balance: 20
            }

            const balance = calculateGenericBalance(profile, [], [], [], new Date('2025-01-15'))

            // Carryover should include the initial balance
            expect(balance.carryover).toBe(20) // No past months yet, just initial
        })

        it('should apply corrections to correct month only', () => {
            const profile = { weekly_hours: 38.5, start_date: '2025-01-01' }
            const corrections = [
                { effective_month: '2025-01-01', correction_hours: 5 },
                { effective_month: '2025-02-01', correction_hours: -3 }
            ]

            const janBalance = calculateGenericBalance(profile, [], [], [], new Date('2025-01-15'), corrections)
            const febBalance = calculateGenericBalance(profile, [], [], [], new Date('2025-02-15'), corrections)

            expect(janBalance.correction).toBe(5)
            expect(febBalance.correction).toBe(-3)
        })

        it('should sum multiple corrections in same month', () => {
            const profile = { weekly_hours: 38.5, start_date: '2025-01-01' }
            const corrections = [
                { effective_month: '2025-01-01', correction_hours: 5 },
                { effective_month: '2025-01-01', correction_hours: 2 },
                { effective_month: '2025-01-01', correction_hours: -1 }
            ]

            const balance = calculateGenericBalance(profile, [], [], [], new Date('2025-01-15'), corrections)

            expect(balance.correction).toBe(6) // 5 + 2 - 1
        })
    })

    describe('DST (Daylight Saving Time) Edge Cases', () => {

        it('should handle ND shift on DST spring forward (March)', () => {
            // In Austria, DST starts last Sunday of March
            // 2025: March 30, 2:00 AM -> 3:00 AM (lose 1 hour)
            // ND shift spanning the transition
            const hours = calculateWorkHours(
                '2025-03-29T19:00:00',
                '2025-03-30T08:00:00',
                'ND'
            )

            // The real function handles DST via date-fns differenceInMinutes
            // Result depends on system timezone but should be reasonable
            expect(hours).toBeGreaterThan(8)
            expect(hours).toBeLessThan(12)
        })

        it('should handle ND shift on DST fall back (October)', () => {
            // 2025: October 26, 3:00 AM -> 2:00 AM (gain 1 hour)
            const hours = calculateWorkHours(
                '2025-10-25T19:00:00',
                '2025-10-26T08:00:00',
                'ND'
            )

            // Should be reasonable regardless of system timezone
            expect(hours).toBeGreaterThan(9)
            expect(hours).toBeLessThan(13)
        })
    })

    describe('Month Boundary Edge Cases', () => {

        it('should handle shift spanning midnight on month boundary', () => {
            // Night shift from Jan 31 to Feb 1
            const hours = calculateWorkHours(
                '2025-01-31T21:00:00',
                '2025-02-01T07:00:00',
                'ND'
            )

            // ND shift 21:00-07:00 = 10h base
            // Readiness 00:30-06:00 (5.5h at 50% = 2.75h)
            // Active: 21:00-00:30 (3.5h) + 06:00-07:00 (1h) = 4.5h
            // Total: 4.5 + 2.75 = 7.25h
            expect(hours).toBeGreaterThan(0)
            expect(hours).toBeCloseTo(7.25, 1)
        })

        it('should correctly count shifts in February of leap year', () => {
            // 2024 was a leap year (Feb 29)
            const days = eachDayOfInterval({
                start: new Date('2024-02-01'),
                end: new Date('2024-02-29')
            })
            expect(days.length).toBe(29)
        })

        it('should correctly count shifts in February of non-leap year', () => {
            const days = eachDayOfInterval({
                start: new Date('2025-02-01'),
                end: new Date('2025-02-28')
            })
            expect(days.length).toBe(28)
        })
    })

    describe('Employee Start Date Edge Cases', () => {

        it('should pro-rate target for mid-month start', () => {
            const profile = {
                weekly_hours: 38.5,
                start_date: '2025-02-15' // Started mid-February
            }

            const balance = calculateGenericBalance(profile, [], [], [], new Date('2025-02-20'))

            // Target should be pro-rated (fewer work days)
            const fullMonthTarget = balance.target
            const dailyHours = 38.5 / 5

            // Feb 15-28 has ~10 workdays, full month ~20 workdays
            // Pro-rated target should be roughly half
            expect(fullMonthTarget).toBeLessThan(dailyHours * 20)
            expect(fullMonthTarget).toBeGreaterThan(0)
        })

        it('should return 0 target for future start date', () => {
            const profile = {
                weekly_hours: 38.5,
                start_date: '2026-01-01' // Starts next year
            }

            const balance = calculateGenericBalance(profile, [], [], [], new Date('2025-02-15'))

            // Future employee - no target
            expect(balance.target).toBe(0)
        })
    })

    describe('Shift Type Edge Cases', () => {

        it('should calculate TD1 shift correctly', () => {
            const hours = calculateWorkHours('2025-01-15T08:00:00', '2025-01-15T16:30:00', 'TD1')
            expect(hours).toBe(8.5)
        })

        it('should calculate FORTBILDUNG as regular shift (no standby)', () => {
            const hours = calculateWorkHours('2025-01-15T08:00:00', '2025-01-15T16:00:00', 'FORTBILDUNG')
            expect(hours).toBe(8)
        })

        it('should calculate DBD (24h shift) correctly', () => {
            const hours = calculateWorkHours('2025-01-15T07:00:00', '2025-01-16T07:00:00', 'DBD')
            expect(hours).toBe(24)
        })

        it('should calculate TEAM shift as regular hours', () => {
            const hours = calculateWorkHours('2025-01-15T09:00:00', '2025-01-15T12:00:00', 'TEAM')
            expect(hours).toBe(3)
        })
    })
})
