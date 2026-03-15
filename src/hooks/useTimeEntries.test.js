/**
 * Tests for useTimeEntries hook
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useTimeEntries } from './useTimeEntries'

// Mock supabase
let fromMock
let mockQueryResults = {}

const createChain = (tableData = [], tableError = null) => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    then: (resolve) => resolve({ data: tableData, error: tableError }),
})

vi.mock('../supabase', () => ({
    supabase: {
        from: (...args) => fromMock(...args),
    },
}))

beforeEach(() => {
    vi.clearAllMocks()
    fromMock = vi.fn(() => createChain([]))
})

describe('useTimeEntries', () => {
    it('returns loading=false after fetch', async () => {
        const { result } = renderHook(() => useTimeEntries('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })
    })

    it('returns empty when no userId', async () => {
        const { result } = renderHook(() => useTimeEntries(null, '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.entries).toEqual([])
        expect(result.current.entriesMap).toEqual({})
    })

    it('returns empty when no selectedMonth', async () => {
        const { result } = renderHook(() => useTimeEntries('user-1', null))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.entries).toEqual([])
    })

    it('queries time_entries table', async () => {
        renderHook(() => useTimeEntries('user-1', '2025-01'))

        await waitFor(() => {
            expect(fromMock).toHaveBeenCalledWith('time_entries')
        })
    })

    it('exposes refetch and saveEntry functions', async () => {
        const { result } = renderHook(() => useTimeEntries('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(typeof result.current.refetch).toBe('function')
        expect(typeof result.current.saveEntry).toBe('function')
    })

    it('returns correct data structure', async () => {
        const { result } = renderHook(() => useTimeEntries('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current).toHaveProperty('entries')
        expect(result.current).toHaveProperty('entriesMap')
        expect(result.current).toHaveProperty('loading')
        expect(result.current).toHaveProperty('error')
        expect(result.current).toHaveProperty('refetch')
        expect(result.current).toHaveProperty('saveEntry')
    })

    it('sets error on fetch failure', async () => {
        fromMock = vi.fn(() => createChain(null, { message: 'DB error' }))

        const { result } = renderHook(() => useTimeEntries('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.error).toBeTruthy()
    })

    it('deduplicates entries by ID', async () => {
        const entry1 = { id: 'e-1', user_id: 'user-1', shift_id: 's-1', actual_start: '2025-01-10T08:00:00' }
        const entry1dup = { ...entry1 } // same ID

        fromMock = vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            then: (resolve) => resolve({ data: [entry1, entry1dup], error: null }),
        }))

        const { result } = renderHook(() => useTimeEntries('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        // Should deduplicate
        const uniqueIds = new Set(result.current.entries.map(e => e.id))
        expect(uniqueIds.size).toBe(result.current.entries.length)
    })

    it('builds entriesMap with shift_id keys', async () => {
        const entry = { id: 'e-1', user_id: 'user-1', shift_id: 's-1', actual_start: '2025-01-10T08:00:00' }

        fromMock = vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            then: (resolve) => resolve({ data: [entry], error: null }),
        }))

        const { result } = renderHook(() => useTimeEntries('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.entriesMap['s-1']).toBeDefined()
        expect(result.current.entriesMap['s-1'].id).toBe('e-1')
    })
})
