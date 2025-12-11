import { describe, it, expect } from 'vitest'
import { calculateGenericBalance } from './balanceHelpers'

describe('calculateGenericBalance', () => {
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
})
