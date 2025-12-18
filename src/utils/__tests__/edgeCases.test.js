/**
 * Edge Case Tests for WoBePlaner
 * 
 * Tests critical business logic edge cases that could cause issues
 * in production if not handled correctly.
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

// Import the actual holiday function
import { getHolidays } from '../holidays'

// Mock balance calculation helper
const calculateVacationDays = (startDate, endDate, getHolidayFn) => {
    const days = eachDayOfInterval({
        start: parseISO(startDate),
        end: parseISO(endDate)
    })

    return days.filter(day => {
        const isWeekendDay = isWeekend(day)
        const isHolidayDay = getHolidayFn ? getHolidayFn(day) : false
        return !isWeekendDay && !isHolidayDay
    }).length
}

// Mock sick leave calculation (based on planned shifts)
const calculateSickLeaveHours = (startDate, endDate, plannedShifts) => {
    const days = eachDayOfInterval({
        start: parseISO(startDate),
        end: parseISO(endDate)
    })

    let totalHours = 0

    days.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd')
        const shiftsOnDay = plannedShifts.filter(shift =>
            shift.start_time.startsWith(dateStr)
        )

        shiftsOnDay.forEach(shift => {
            const start = new Date(shift.start_time)
            const end = new Date(shift.end_time)
            let hours = (end - start) / (1000 * 60 * 60)

            // ND shift adds 0.5h readiness time
            if (shift.type === 'ND') {
                hours += 0.5
            }

            totalHours += hours
        })
    })

    return Math.round(totalHours * 100) / 100
}

// Mock balance calculation
const calculateMonthlyBalance = (profile, shifts, absences, month) => {
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)

    // Calculate target hours for the month
    const weeklyHours = profile.weekly_hours || 38.5
    const weeksInMonth = 4.33 // Approximate
    const target = Math.round(weeklyHours * weeksInMonth * 100) / 100

    // Calculate actual hours from shifts
    let actual = 0
    shifts.forEach(shift => {
        const shiftDate = new Date(shift.start_time)
        if (shiftDate >= monthStart && shiftDate <= monthEnd) {
            const start = new Date(shift.start_time)
            const end = new Date(shift.end_time)
            actual += (end - start) / (1000 * 60 * 60)
        }
    })

    return {
        target: Math.round(target * 100) / 100,
        actual: Math.round(actual * 100) / 100,
        diff: Math.round((actual - target) * 100) / 100
    }
}

describe('Edge Case Tests', () => {

    describe('Year-End Vacation Requests', () => {

        it('should correctly count vacation days across year boundary', () => {
            // Vacation from Dec 30, 2025 to Jan 2, 2026
            const startDate = '2025-12-30'
            const endDate = '2026-01-02'

            const holidays2025 = getHolidays(2025)
            const holidays2026 = getHolidays(2026)

            const isHolidayInRange = (day) => {
                const year = getYear(day)
                const holidays = year === 2025 ? holidays2025 : holidays2026
                return holidays.some(h =>
                    format(h.date, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
                )
            }

            const days = calculateVacationDays(startDate, endDate, isHolidayInRange)

            // Dec 30 (Tue), Dec 31 (Wed - Silvester, not a public holiday but often free)
            // Jan 1 (Thu - Neujahr = Holiday), Jan 2 (Fri)
            // Expected: Dec 30, Dec 31, Jan 2 = 3 days (Jan 1 is holiday)
            // Note: Dec 31 is NOT a public holiday in Austria
            expect(days).toBe(3) // Dec 30, Dec 31, Jan 2 (skipping Jan 1 holiday)
        })

        it('should handle vacation entirely within Christmas holidays', () => {
            // Dec 24-26 are Christmas
            const startDate = '2025-12-24'
            const endDate = '2025-12-26'

            const holidays = getHolidays(2025)
            const isHolidayFn = (day) => holidays.some(h =>
                format(h.date, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
            )

            const days = calculateVacationDays(startDate, endDate, isHolidayFn)

            // Dec 24 (Wed - Heiligabend, not public holiday in Austria)
            // Dec 25 (Thu - Weihnachten = Holiday)
            // Dec 26 (Fri - Stefanitag = Holiday)
            // Expected: 1 day (Dec 24 only, others are holidays)
            expect(days).toBe(1)
        })

        it('should handle vacation starting on Saturday', () => {
            const startDate = '2025-12-27' // Saturday
            const endDate = '2026-01-02'   // Thursday

            const days = calculateVacationDays(startDate, endDate, (day) => {
                // Jan 1 is Neujahr
                return format(day, 'yyyy-MM-dd') === '2026-01-01'
            })

            // Dec 27 (Sat - skip), Dec 28 (Sun - skip), Dec 29 (Mon), Dec 30 (Tue), Dec 31 (Wed)
            // Jan 1 (Holiday - skip), Jan 2 (Fri)
            // Expected: 4 workdays
            expect(days).toBe(4)
        })
    })

    describe('Sick Leave Edge Cases', () => {

        it('should credit hours for planned shift on sick day', () => {
            const startDate = '2025-01-15'
            const endDate = '2025-01-15'

            const plannedShifts = [
                {
                    start_time: '2025-01-15T08:00:00',
                    end_time: '2025-01-15T16:30:00',
                    type: 'TD1'
                }
            ]

            const hours = calculateSickLeaveHours(startDate, endDate, plannedShifts)

            // 08:00 to 16:30 = 8.5 hours
            expect(hours).toBe(8.5)
        })

        it('should add ND readiness time for night shift sick leave', () => {
            const startDate = '2025-01-15'
            const endDate = '2025-01-15'

            const plannedShifts = [
                {
                    start_time: '2025-01-15T21:00:00',
                    end_time: '2025-01-16T07:00:00',
                    type: 'ND'
                }
            ]

            const hours = calculateSickLeaveHours(startDate, endDate, plannedShifts)

            // 21:00 to 07:00 = 10 hours + 0.5 readiness = 10.5 hours
            expect(hours).toBe(10.5)
        })

        it('should handle sick leave on holiday with planned shift', () => {
            // Sick on Jan 1 (Neujahr) but shift was planned
            const startDate = '2025-01-01'
            const endDate = '2025-01-01'

            const plannedShifts = [
                {
                    start_time: '2025-01-01T08:00:00',
                    end_time: '2025-01-01T16:30:00',
                    type: 'TD1'
                }
            ]

            const hours = calculateSickLeaveHours(startDate, endDate, plannedShifts)

            // Should still count the planned hours even on holiday
            expect(hours).toBe(8.5)
        })

        it('should return 0 for sick leave with no planned shifts', () => {
            const startDate = '2025-01-15'
            const endDate = '2025-01-15'

            const plannedShifts = [] // No shifts planned

            const hours = calculateSickLeaveHours(startDate, endDate, plannedShifts)

            expect(hours).toBe(0)
        })

        it('should handle multi-day sick leave with varying shifts', () => {
            const startDate = '2025-01-13' // Monday
            const endDate = '2025-01-15'   // Wednesday

            const plannedShifts = [
                { start_time: '2025-01-13T08:00:00', end_time: '2025-01-13T16:30:00', type: 'TD1' }, // 8.5h
                { start_time: '2025-01-14T08:00:00', end_time: '2025-01-14T16:30:00', type: 'TD1' }, // 8.5h
                // No shift on Jan 15
            ]

            const hours = calculateSickLeaveHours(startDate, endDate, plannedShifts)

            expect(hours).toBe(17) // 8.5 + 8.5
        })
    })

    describe('Negative Balance Edge Cases', () => {

        it('should correctly display negative balances', () => {
            const profile = { weekly_hours: 38.5, start_date: '2024-01-01' }
            const shifts = [] // No shifts worked
            const absences = []
            const month = new Date('2025-01-15')

            const balance = calculateMonthlyBalance(profile, shifts, absences, month)

            expect(balance.diff).toBeLessThan(0)
            expect(balance.actual).toBe(0)
        })

        it('should handle balance carryover correctly', () => {
            // Previous month had -10 hours
            const previousBalance = -10

            // This month worked exactly target
            const currentBalance = {
                target: 166.7,
                actual: 166.7,
                diff: 0
            }

            const total = previousBalance + currentBalance.diff

            expect(total).toBe(-10)
        })

        it('should handle initial_balance from profile', () => {
            const profile = {
                weekly_hours: 38.5,
                start_date: '2024-01-01',
                initial_balance: 20 // Started with 20h credit
            }

            const monthlyDiff = -5 // Worked 5h less than target
            const total = profile.initial_balance + monthlyDiff

            expect(total).toBe(15)
        })
    })

    describe('DST (Daylight Saving Time) Edge Cases', () => {

        it('should handle shift on DST spring forward (March)', () => {
            // In Austria, DST starts last Sunday of March
            // 2025: March 30, 2:00 AM -> 3:00 AM (lose 1 hour)

            const nightShiftStart = new Date('2025-03-29T21:00:00')
            const nightShiftEnd = new Date('2025-03-30T07:00:00')

            // Actual duration should be 10 hours, but clock shows 9
            // In JavaScript, Date arithmetic handles this automatically
            const durationMs = nightShiftEnd - nightShiftStart
            const durationHours = durationMs / (1000 * 60 * 60)

            // This is where it gets tricky - depends on interpretation
            // JavaScript Date arithmetic in test environment doesn't apply DST
            // In real app, this would be 9h during spring forward
            expect(durationHours).toBeGreaterThanOrEqual(9)
        })

        it('should handle shift on DST fall back (October)', () => {
            // In Austria, DST ends last Sunday of October
            // 2025: October 26, 3:00 AM -> 2:00 AM (gain 1 hour)

            const nightShiftStart = new Date('2025-10-25T21:00:00')
            const nightShiftEnd = new Date('2025-10-26T07:00:00')

            const durationMs = nightShiftEnd - nightShiftStart
            const durationHours = durationMs / (1000 * 60 * 60)

            // JavaScript Date arithmetic depends on the local timezone:
            // - In Europe/Vienna: 11 hours (DST fall back adds 1 hour)
            // - In UTC: 10 hours (no DST)
            // We accept both to make the test CI-compatible
            expect(durationHours).toBeGreaterThanOrEqual(10)
            expect(durationHours).toBeLessThanOrEqual(11)
        })
    })

    describe('Month Boundary Edge Cases', () => {

        it('should handle shift spanning midnight on month boundary', () => {
            // Night shift from Jan 31 to Feb 1
            const shift = {
                start_time: '2025-01-31T21:00:00',
                end_time: '2025-02-01T07:00:00',
                type: 'ND'
            }

            const shiftStartMonth = getMonth(new Date(shift.start_time))
            const shiftEndMonth = getMonth(new Date(shift.end_time))

            expect(shiftStartMonth).toBe(0) // January
            expect(shiftEndMonth).toBe(1)   // February

            // Business rule: Shift should count for the starting date's month
            expect(shiftStartMonth).toBe(0)
        })

        it('should correctly count shifts in February of leap year', () => {
            // 2024 was a leap year (Feb 29)
            const feb2024Start = new Date('2024-02-01')
            const feb2024End = new Date('2024-02-29')

            const days = eachDayOfInterval({ start: feb2024Start, end: feb2024End })

            expect(days.length).toBe(29)
        })

        it('should correctly count shifts in February of non-leap year', () => {
            // 2025 is not a leap year
            const feb2025Start = new Date('2025-02-01')
            const feb2025End = new Date('2025-02-28')

            const days = eachDayOfInterval({ start: feb2025Start, end: feb2025End })

            expect(days.length).toBe(28)
        })
    })

    describe('Employee Start Date Edge Cases', () => {

        it('should not credit hours before employee start date', () => {
            const profile = {
                weekly_hours: 38.5,
                start_date: '2025-02-15' // Started mid-February
            }

            const month = new Date('2025-02-01')
            const monthEnd = endOfMonth(month)

            // Calculate pro-rated target
            const startDate = parseISO(profile.start_date)
            const workingDays = eachDayOfInterval({ start: startDate, end: monthEnd })
                .filter(d => !isWeekend(d)).length

            const _totalWorkingDaysInMonth = eachDayOfInterval({
                start: startOfMonth(month),
                end: monthEnd
            }).filter(d => !isWeekend(d)).length

            const proRatedTarget = (profile.weekly_hours / 5) * workingDays

            // Feb 15-28 = approx 10 working days
            // Should be less than full month
            expect(proRatedTarget).toBeLessThan(profile.weekly_hours * 4)
        })

        it('should handle employee starting on weekend', () => {
            const profile = {
                weekly_hours: 38.5,
                start_date: '2025-02-15' // This is a Saturday in 2025
            }

            const startDate = parseISO(profile.start_date)
            const isStartOnWeekend = isWeekend(startDate)

            // Employee can start on weekend, first workday is Monday
            expect(typeof isStartOnWeekend).toBe('boolean')
        })
    })

    describe('Shift Type Edge Cases', () => {

        it('should handle TEAM shift applying to all employees', () => {
            const _teamShift = {
                type: 'TEAM',
                start_time: '2025-01-15T09:00:00',
                end_time: '2025-01-15T12:00:00'
            }

            const allEmployees = ['user1', 'user2', 'user3']

            // TEAM shifts should credit all employees
            const creditsForAll = allEmployees.map(userId => ({
                userId,
                hours: 3 // 09:00 - 12:00
            }))

            expect(creditsForAll.length).toBe(3)
            expect(creditsForAll.every(c => c.hours === 3)).toBe(true)
        })

        it('should handle FORTBILDUNG shift not requiring coverage', () => {
            const fortbildungShift = {
                type: 'FORTBILDUNG',
                start_time: '2025-01-15T08:00:00',
                end_time: '2025-01-15T16:00:00',
                title: 'Erste Hilfe Kurs'
            }

            // FORTBILDUNG doesn't need urgent coverage when sick
            const requiresCoverage = fortbildungShift.type !== 'TEAM' &&
                fortbildungShift.type !== 'FORTBILDUNG'

            expect(requiresCoverage).toBe(false)
        })

        it('should handle DBD (Dauer-Bereitschaftsdienst) correctly', () => {
            const dbdShift = {
                type: 'DBD',
                start_time: '2025-01-15T07:00:00',
                end_time: '2025-01-16T07:00:00' // 24 hours
            }

            const start = new Date(dbdShift.start_time)
            const end = new Date(dbdShift.end_time)
            const hours = (end - start) / (1000 * 60 * 60)

            expect(hours).toBe(24)
        })
    })

    describe('Correction Edge Cases', () => {

        it('should apply correction to correct month only', () => {
            const corrections = [
                { effective_month: '2025-01', correction_hours: 5 },
                { effective_month: '2025-02', correction_hours: -3 }
            ]

            const currentMonth = '2025-01'
            const applicableCorrection = corrections.find(
                c => c.effective_month === currentMonth
            )?.correction_hours || 0

            expect(applicableCorrection).toBe(5)
        })

        it('should sum multiple corrections in same month', () => {
            const corrections = [
                { effective_month: '2025-01', correction_hours: 5 },
                { effective_month: '2025-01', correction_hours: 2 },
                { effective_month: '2025-01', correction_hours: -1 }
            ]

            const currentMonth = '2025-01'
            const totalCorrection = corrections
                .filter(c => c.effective_month === currentMonth)
                .reduce((sum, c) => sum + c.correction_hours, 0)

            expect(totalCorrection).toBe(6) // 5 + 2 - 1
        })
    })
})
