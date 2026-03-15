/**
 * Tests for useShifts hook
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useShifts } from './useShifts'

// Mock supabase
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockGte = vi.fn()
const mockLte = vi.fn()
const mockIn = vi.fn()

const createChain = (resolvedData = [], resolvedError = null) => {
    const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        then: (resolve) => resolve({ data: resolvedData, error: resolvedError }),
    }
    return chain
}

let fromMock
vi.mock('../supabase', () => ({
    supabase: {
        from: (...args) => fromMock(...args),
    },
}))

beforeEach(() => {
    vi.clearAllMocks()
    fromMock = vi.fn(() => createChain([]))
})

describe('useShifts', () => {
    it('returns loading=true initially then false', async () => {
        const { result } = renderHook(() => useShifts('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })
    })

    it('returns empty arrays when no userId', async () => {
        const { result } = renderHook(() => useShifts(null, '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.personalShifts).toEqual([])
        expect(result.current.teamShifts).toEqual([])
        expect(result.current.allShifts).toEqual([])
    })

    it('returns empty arrays when no selectedMonth', async () => {
        const { result } = renderHook(() => useShifts('user-1', null))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.personalShifts).toEqual([])
    })

    it('exposes refetch function', async () => {
        const { result } = renderHook(() => useShifts('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(typeof result.current.refetch).toBe('function')
    })

    it('exposes error state', async () => {
        const { result } = renderHook(() => useShifts('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.error).toBeNull()
    })

    it('sets error when supabase throws', async () => {
        fromMock = vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            then: (resolve) => resolve({ data: null, error: { message: 'DB error' } }),
        }))

        const { result } = renderHook(() => useShifts('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.error).toBeTruthy()
    })

    it('queries shift_interests for user', async () => {
        fromMock = vi.fn((table) => {
            const chain = createChain([])
            // Track which table was queried
            chain._table = table
            return chain
        })

        renderHook(() => useShifts('user-1', '2025-01'))

        await waitFor(() => {
            expect(fromMock).toHaveBeenCalledWith('shift_interests')
        })
    })

    it('returns correct data structure', async () => {
        const { result } = renderHook(() => useShifts('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current).toHaveProperty('personalShifts')
        expect(result.current).toHaveProperty('teamShifts')
        expect(result.current).toHaveProperty('allShifts')
        expect(result.current).toHaveProperty('loading')
        expect(result.current).toHaveProperty('error')
        expect(result.current).toHaveProperty('refetch')
    })
})
