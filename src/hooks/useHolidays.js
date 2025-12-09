import { useRef, useCallback } from 'react'
import { getYear } from 'date-fns'
import { getHolidays, isHoliday } from '../utils/holidays'

export function useHolidays() {
    // Cache für bereits berechnete Jahre: { 2024: [...], 2025: [...] }
    const cache = useRef({})

    const getHoliday = useCallback((date) => {
        if (!date) return null
        const d = new Date(date)
        const year = getYear(d)

        if (!cache.current[year]) {
            cache.current[year] = getHolidays(year)
        }

        return isHoliday(d, cache.current[year])
    }, [])

    return { getHoliday }
}
