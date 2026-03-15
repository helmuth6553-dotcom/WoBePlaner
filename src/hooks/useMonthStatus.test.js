/**
 * Tests for useMonthStatus hook
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useMonthStatus } from './useMonthStatus'

// Mock supabase
let fromMock
const mockMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
const mockSignIn = vi.fn(() => Promise.resolve({ error: null }))

const createChain = () => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: mockMaybeSingle,
    insert: vi.fn(() => Promise.resolve({ error: null })),
})

vi.mock('../supabase', () => ({
    supabase: {
        from: (...args) => fromMock(...args),
        auth: {
            signInWithPassword: (...args) => mockSignIn(...args),
        },
    },
}))

vi.mock('../utils/security', () => ({
    generateReportHash: vi.fn(() => Promise.resolve('mock-hash-abc123')),
}))

beforeEach(() => {
    vi.clearAllMocks()
    fromMock = vi.fn(() => createChain())
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
})

describe('useMonthStatus', () => {
    it('returns loading=false after fetch', async () => {
        const { result } = renderHook(() => useMonthStatus('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })
    })

    it('returns null status when no report exists', async () => {
        const { result } = renderHook(() => useMonthStatus('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.status).toBeNull()
        expect(result.current.isLocked).toBe(false)
        expect(result.current.isApproved).toBe(false)
    })

    it('returns status when report exists', async () => {
        mockMaybeSingle.mockResolvedValue({
            data: {
                id: 'r-1',
                user_id: 'user-1',
                year: 2025,
                month: 1,
                status: 'eingereicht',
                data_hash: 'hash-123',
            },
            error: null,
        })

        const { result } = renderHook(() => useMonthStatus('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.status).not.toBeNull()
        expect(result.current.status.status).toBe('eingereicht')
        expect(result.current.isLocked).toBe(true)
    })

    it('isApproved=true when status is genehmigt', async () => {
        mockMaybeSingle.mockResolvedValue({
            data: { status: 'genehmigt' },
            error: null,
        })

        const { result } = renderHook(() => useMonthStatus('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.isApproved).toBe(true)
        expect(result.current.isLocked).toBe(true)
    })

    it('returns empty when no userId', async () => {
        const { result } = renderHook(() => useMonthStatus(null, '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.status).toBeNull()
    })

    it('queries monthly_reports table', async () => {
        renderHook(() => useMonthStatus('user-1', '2025-01'))

        await waitFor(() => {
            expect(fromMock).toHaveBeenCalledWith('monthly_reports')
        })
    })

    it('exposes submitMonth and refetch functions', async () => {
        const { result } = renderHook(() => useMonthStatus('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(typeof result.current.submitMonth).toBe('function')
        expect(typeof result.current.refetch).toBe('function')
    })

    it('sets error on fetch failure', async () => {
        mockMaybeSingle.mockResolvedValue({
            data: null,
            error: { message: 'DB error' },
        })

        const { result } = renderHook(() => useMonthStatus('user-1', '2025-01'))

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.error).toBeTruthy()
    })

    it('parses year and month from selectedMonth string', async () => {
        const chain = createChain()
        fromMock = vi.fn(() => chain)

        renderHook(() => useMonthStatus('user-1', '2025-03'))

        await waitFor(() => {
            // eq should be called with year=2025 and month=3
            expect(chain.eq).toHaveBeenCalledWith('year', 2025)
            expect(chain.eq).toHaveBeenCalledWith('month', 3)
        })
    })
})
