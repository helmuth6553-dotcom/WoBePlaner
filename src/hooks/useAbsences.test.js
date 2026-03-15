/**
 * Tests for useAbsences hook
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAbsences } from './useAbsences'

// Mock supabase
let fromMock

const createChain = (data = [], error = null) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    then: (resolve) => resolve({ data, error }),
})

vi.mock('../supabase', () => ({
    supabase: {
        from: (...args) => fromMock(...args),
    },
}))

// Mock dependent utils
vi.mock('../utils/timeTrackingHelpers', () => ({
    expandAbsencesToItems: vi.fn(() => []),
}))

vi.mock('../utils/timeCalculations', () => ({
    calculateWorkHours: vi.fn(() => 0),
    calculateDailyAbsenceHours: vi.fn(() => 7.7),
}))

beforeEach(() => {
    vi.clearAllMocks()
    fromMock = vi.fn(() => createChain([]))
})

describe('useAbsences', () => {
    it('returns loading=false after fetch', async () => {
        const { result } = renderHook(() => useAbsences('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })
    })

    it('returns empty when no userId', async () => {
        const { result } = renderHook(() => useAbsences(null, '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.absences).toEqual([])
        expect(result.current.absenceItems).toEqual([])
    })

    it('returns empty when no selectedMonth', async () => {
        const { result } = renderHook(() => useAbsences('user-1', null))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.absences).toEqual([])
    })

    it('queries absences table', async () => {
        renderHook(() => useAbsences('user-1', '2025-01'))

        await waitFor(() => {
            expect(fromMock).toHaveBeenCalledWith('absences')
        })
    })

    it('exposes refetch function', async () => {
        const { result } = renderHook(() => useAbsences('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(typeof result.current.refetch).toBe('function')
    })

    it('returns correct data structure', async () => {
        const { result } = renderHook(() => useAbsences('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current).toHaveProperty('absences')
        expect(result.current).toHaveProperty('absenceItems')
        expect(result.current).toHaveProperty('loading')
        expect(result.current).toHaveProperty('error')
        expect(result.current).toHaveProperty('refetch')
    })

    it('sets error on fetch failure', async () => {
        fromMock = vi.fn(() => createChain(null, { message: 'DB error' }))

        const { result } = renderHook(() => useAbsences('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.error).toBeTruthy()
    })

    it('fetches only approved absences', async () => {
        const selectChain = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn(function () { return this }),
            lte: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            then: (resolve) => resolve({ data: [], error: null }),
        }
        fromMock = vi.fn(() => selectChain)

        renderHook(() => useAbsences('user-1', '2025-01'))

        await waitFor(() => {
            // eq should be called with 'status', 'genehmigt'
            const statusCall = selectChain.eq.mock.calls.find(c => c[0] === 'status')
            expect(statusCall).toBeTruthy()
            expect(statusCall[1]).toBe('genehmigt')
        })
    })
})
