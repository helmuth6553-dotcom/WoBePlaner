/**
 * Tests for useHolidays hook
 */
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useHolidays } from './useHolidays'

describe('useHolidays', () => {
    it('returns getHoliday function', () => {
        const { result } = renderHook(() => useHolidays())
        expect(typeof result.current.getHoliday).toBe('function')
    })

    it('detects Neujahr (Jan 1st) as holiday', () => {
        const { result } = renderHook(() => useHolidays())
        const holiday = result.current.getHoliday('2025-01-01')
        expect(holiday).toBeTruthy()
    })

    it('detects Weihnachten (Dec 25th) as holiday', () => {
        const { result } = renderHook(() => useHolidays())
        const holiday = result.current.getHoliday('2025-12-25')
        expect(holiday).toBeTruthy()
    })

    it('detects Nationalfeiertag (Oct 26th) as holiday', () => {
        const { result } = renderHook(() => useHolidays())
        const holiday = result.current.getHoliday('2025-10-26')
        expect(holiday).toBeTruthy()
    })

    it('returns falsy for a regular working day', () => {
        const { result } = renderHook(() => useHolidays())
        const holiday = result.current.getHoliday('2025-03-12') // Wed in March
        expect(holiday).toBeFalsy()
    })

    it('returns null for null/undefined input', () => {
        const { result } = renderHook(() => useHolidays())
        expect(result.current.getHoliday(null)).toBeNull()
        expect(result.current.getHoliday(undefined)).toBeNull()
    })

    it('handles Date objects', () => {
        const { result } = renderHook(() => useHolidays())
        const holiday = result.current.getHoliday(new Date(2025, 0, 1)) // Jan 1st
        expect(holiday).toBeTruthy()
    })

    it('caches holiday calculations (same year)', () => {
        const { result } = renderHook(() => useHolidays())

        // Call twice for same year
        result.current.getHoliday('2025-01-01')
        result.current.getHoliday('2025-12-25')

        // Both should work (cache hit for second call)
        const h1 = result.current.getHoliday('2025-01-01')
        const h2 = result.current.getHoliday('2025-12-25')
        expect(h1).toBeTruthy()
        expect(h2).toBeTruthy()
    })

    it('handles different years', () => {
        const { result } = renderHook(() => useHolidays())
        const h2024 = result.current.getHoliday('2024-01-01')
        const h2025 = result.current.getHoliday('2025-01-01')
        expect(h2024).toBeTruthy()
        expect(h2025).toBeTruthy()
    })
})
