import { describe, it, expect } from 'vitest'
import { getHolidays, isHoliday } from './holidays'
import { format } from 'date-fns'

// Helper to get local date string (avoids timezone issues)
const toLocalDateString = (date) => format(date, 'yyyy-MM-dd')

describe('Austrian Holidays', () => {
    describe('getHolidays', () => {
        it('returns all 13 Austrian public holidays', () => {
            // Austria has 13 public holidays
            const holidays2025 = getHolidays(2025)
            expect(holidays2025).toHaveLength(13)
        })

        it('includes all fixed holidays', () => {
            const holidays2025 = getHolidays(2025)
            const names = holidays2025.map(h => h.name)

            // Fixed holidays
            expect(names).toContain('Neujahr')
            expect(names).toContain('Heilige Drei Könige')
            expect(names).toContain('Staatsfeiertag')
            expect(names).toContain('Mariä Himmelfahrt')
            expect(names).toContain('Nationalfeiertag')
            expect(names).toContain('Allerheiligen')
            expect(names).toContain('Mariä Empfängnis')
            expect(names).toContain('Christtag')
            expect(names).toContain('Stefanitag')
        })

        it('includes all Easter-dependent holidays', () => {
            const holidays2025 = getHolidays(2025)
            const names = holidays2025.map(h => h.name)

            // Easter-dependent holidays
            expect(names).toContain('Ostermontag')
            expect(names).toContain('Christi Himmelfahrt')
            expect(names).toContain('Pfingstmontag')
            expect(names).toContain('Fronleichnam')
        })

        it('calculates correct fixed dates for 2025', () => {
            const holidays2025 = getHolidays(2025)

            const findDate = (name) => holidays2025.find(h => h.name === name)?.date

            // Using local date to avoid timezone issues
            expect(toLocalDateString(findDate('Neujahr'))).toBe('2025-01-01')
            expect(toLocalDateString(findDate('Heilige Drei Könige'))).toBe('2025-01-06')
            expect(toLocalDateString(findDate('Staatsfeiertag'))).toBe('2025-05-01')
            expect(toLocalDateString(findDate('Mariä Himmelfahrt'))).toBe('2025-08-15')
            expect(toLocalDateString(findDate('Nationalfeiertag'))).toBe('2025-10-26')
            expect(toLocalDateString(findDate('Allerheiligen'))).toBe('2025-11-01')
            expect(toLocalDateString(findDate('Mariä Empfängnis'))).toBe('2025-12-08')
            expect(toLocalDateString(findDate('Christtag'))).toBe('2025-12-25')
            expect(toLocalDateString(findDate('Stefanitag'))).toBe('2025-12-26')
        })

        it('calculates Easter Sunday correctly for 2025', () => {
            // Easter Sunday 2025 is April 20
            const holidays2025 = getHolidays(2025)

            const ostermontag = holidays2025.find(h => h.name === 'Ostermontag')
            // Ostermontag = Easter Sunday + 1 = April 21
            expect(toLocalDateString(ostermontag.date)).toBe('2025-04-21')
        })

        it('calculates Easter-dependent holidays correctly for 2025', () => {
            // Easter Sunday 2025 = April 20
            const holidays2025 = getHolidays(2025)

            const findDate = (name) => holidays2025.find(h => h.name === name)?.date

            // Ostermontag = Easter + 1 = April 21
            expect(toLocalDateString(findDate('Ostermontag'))).toBe('2025-04-21')

            // Christi Himmelfahrt = Easter + 39 = May 29
            expect(toLocalDateString(findDate('Christi Himmelfahrt'))).toBe('2025-05-29')

            // Pfingstmontag = Easter + 50 = June 9
            expect(toLocalDateString(findDate('Pfingstmontag'))).toBe('2025-06-09')

            // Fronleichnam = Easter + 60 = June 19
            expect(toLocalDateString(findDate('Fronleichnam'))).toBe('2025-06-19')
        })

        it('calculates Easter correctly for 2024 (different year)', () => {
            // Easter Sunday 2024 = March 31
            const holidays2024 = getHolidays(2024)

            const ostermontag = holidays2024.find(h => h.name === 'Ostermontag')
            // Ostermontag = March 31 + 1 = April 1
            expect(toLocalDateString(ostermontag.date)).toBe('2024-04-01')
        })

        it('returns holidays sorted by date', () => {
            const holidays2025 = getHolidays(2025)

            for (let i = 1; i < holidays2025.length; i++) {
                const prev = holidays2025[i - 1].date
                const curr = holidays2025[i].date
                expect(prev.getTime()).toBeLessThanOrEqual(curr.getTime())
            }
        })
    })

    describe('isHoliday', () => {
        it('returns truthy for Dec 25 (Christtag)', () => {
            const holidays2025 = getHolidays(2025)
            const christtag = new Date(2025, 11, 25)

            const result = isHoliday(christtag, holidays2025)
            expect(result).toBeTruthy()
            expect(result.name).toBe('Christtag')
        })

        it('returns truthy for Jan 1 (Neujahr)', () => {
            const holidays2025 = getHolidays(2025)
            const neujahr = new Date(2025, 0, 1)

            const result = isHoliday(neujahr, holidays2025)
            expect(result).toBeTruthy()
            expect(result.name).toBe('Neujahr')
        })

        it('returns falsy for regular workday (Jan 15)', () => {
            const holidays2025 = getHolidays(2025)
            const workday = new Date(2025, 0, 15) // Wednesday

            const result = isHoliday(workday, holidays2025)
            expect(result).toBeFalsy()
        })

        it('returns falsy for weekend (not checking weekend, just holidays)', () => {
            const holidays2025 = getHolidays(2025)
            const saturday = new Date(2025, 0, 18) // Random Saturday

            // isHoliday only checks holidays, not weekends
            const result = isHoliday(saturday, holidays2025)
            expect(result).toBeFalsy()
        })

        it('correctly identifies 1. Mai as holiday', () => {
            const holidays2025 = getHolidays(2025)
            const ersterMai = new Date(2025, 4, 1)

            const result = isHoliday(ersterMai, holidays2025)
            expect(result).toBeTruthy()
            expect(result.name).toBe('Staatsfeiertag')
        })

        it('correctly identifies Pfingstmontag 2025', () => {
            const holidays2025 = getHolidays(2025)
            // Pfingstmontag 2025 = June 9
            const pfingstmontag = new Date(2025, 5, 9)

            const result = isHoliday(pfingstmontag, holidays2025)
            expect(result).toBeTruthy()
            expect(result.name).toBe('Pfingstmontag')
        })
    })
})
