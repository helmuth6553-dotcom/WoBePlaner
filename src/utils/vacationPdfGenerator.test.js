/**
 * Tests for Vacation PDF Generator
 *
 * Focuses on the exported getFirstWorkingDayAfter() utility
 * which calculates the return-to-work date skipping weekends & Austrian holidays.
 */
import { describe, it, expect } from 'vitest'
import { getFirstWorkingDayAfter } from './vacationPdfGenerator'

describe('getFirstWorkingDayAfter', () => {
    it('returns next day when it is a weekday', () => {
        // Tuesday → Wednesday
        const date = new Date(2025, 0, 7) // Tue 7.Jan
        const result = getFirstWorkingDayAfter(date)
        expect(result.getDay()).not.toBe(0) // not Sunday
        expect(result.getDay()).not.toBe(6) // not Saturday
        expect(result.getDate()).toBe(8)
    })

    it('skips Saturday and Sunday', () => {
        // Friday → Monday
        const friday = new Date(2025, 0, 10) // Fri 10.Jan
        const result = getFirstWorkingDayAfter(friday)
        expect(result.getDate()).toBe(13) // Mon 13.Jan
        expect(result.getDay()).toBe(1) // Monday
    })

    it('skips Sunday', () => {
        // Saturday → Monday
        const saturday = new Date(2025, 0, 11) // Sat 11.Jan
        const result = getFirstWorkingDayAfter(saturday)
        expect(result.getDate()).toBe(13) // Mon 13.Jan
    })

    it('skips Austrian holiday (Neujahr)', () => {
        // 31.Dec (Wed) → 2.Jan (Fri), skipping 1.Jan (Neujahr)
        const silvester = new Date(2024, 11, 31) // Tue 31.Dec.2024
        const result = getFirstWorkingDayAfter(silvester)
        expect(result.getDate()).toBe(2)
        expect(result.getMonth()).toBe(0) // January
    })

    it('skips combined weekend + holiday (Weihnachten)', () => {
        // 24.Dec.2025 (Wed) → next working day after 25+26 Dec holidays
        const dec24 = new Date(2025, 11, 24)
        const result = getFirstWorkingDayAfter(dec24)
        // 25 Dec = Christtag, 26 Dec = Stefanitag, 27 Dec = Sat, 28 Dec = Sun
        expect(result.getDate()).toBe(29) // Mon 29.Dec
    })

    it('skips Easter Monday', () => {
        // Easter 2025: Sun 20.April → Mon 21.April is Ostermontag
        // So Fri 18.April → skip Sat 19, Sun 20, Mon 21 (Ostermontag) → Tue 22
        const goodFriday = new Date(2025, 3, 18) // Fri 18.Apr
        const result = getFirstWorkingDayAfter(goodFriday)
        expect(result.getDate()).toBe(22) // Tue 22.Apr
    })

    it('skips Nationalfeiertag (26. Oktober)', () => {
        // 25.Oct.2025 (Sat) → 26.Oct is Nationalfeiertag (Sun in 2025)
        // Actually 26.Oct.2025 is Sunday, so it's both holiday and weekend
        // 25 Sat, 26 Sun+holiday, 27 Mon → should return Mon 27
        const oct25 = new Date(2025, 9, 25)
        const result = getFirstWorkingDayAfter(oct25)
        expect(result.getDate()).toBe(27)
        expect(result.getMonth()).toBe(9) // October
    })

    it('handles year boundary (Dec to Jan)', () => {
        // Dec 30, 2025 (Tue) → next day is 31.Dec (Wed), which is a regular working day
        const dec30 = new Date(2025, 11, 30)
        const result = getFirstWorkingDayAfter(dec30)
        // 31.Dec 2025 is Wednesday, not a holiday → should return 31.Dec
        expect(result.getDate()).toBe(31)
        expect(result.getMonth()).toBe(11) // December
        expect(result.getFullYear()).toBe(2025)
    })

    it('returns a Date object', () => {
        const result = getFirstWorkingDayAfter(new Date(2025, 5, 15))
        expect(result).toBeInstanceOf(Date)
    })

    it('does not modify the input date', () => {
        const input = new Date(2025, 0, 10)
        const originalTime = input.getTime()
        getFirstWorkingDayAfter(input)
        expect(input.getTime()).toBe(originalTime)
    })
})
