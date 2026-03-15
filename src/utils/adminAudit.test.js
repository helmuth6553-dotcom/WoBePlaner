/**
 * Tests for Admin Audit Log Utility
 *
 * Ensures DSGVO-compliant audit trail: every admin action must be logged
 * with who did what, to whom, and when.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase before importing the module
const mockInsert = vi.fn(() => Promise.resolve({ data: null, error: null }))
const mockSingle = vi.fn(() => Promise.resolve({ data: { id: 'rec-1', status: 'pending' }, error: null }))
const mockLimit = vi.fn(() => Promise.resolve({ data: [], error: null }))

const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: mockInsert,
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: mockLimit,
    single: mockSingle,
}

const mockSupabase = {
    from: vi.fn(() => mockQueryBuilder),
    auth: {
        getUser: vi.fn(() => Promise.resolve({
            data: { user: { id: 'admin-uuid-123' } },
            error: null,
        })),
    },
}

vi.mock('../supabase', () => ({
    supabase: mockSupabase,
}))

// Mock navigator.userAgent
Object.defineProperty(navigator, 'userAgent', {
    value: 'vitest-test-agent',
    writable: true,
})

const { logAdminAction, fetchBeforeState, getAuditLog, getRecentAdminActions } = await import('./adminAudit')

// =============================================================================
// logAdminAction
// =============================================================================

describe('logAdminAction', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: { id: 'admin-uuid-123' } },
            error: null,
        })
        mockSupabase.from.mockReturnValue(mockQueryBuilder)
        mockInsert.mockResolvedValue({ data: null, error: null })
    })

    it('inserts an audit record with correct fields', async () => {
        await logAdminAction('approve_report', 'target-user-1', 'monthly_report', 'report-1')

        expect(mockSupabase.from).toHaveBeenCalledWith('admin_actions')
        expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
            admin_id: 'admin-uuid-123',
            action: 'approve_report',
            target_user_id: 'target-user-1',
            target_resource_type: 'monthly_report',
            target_resource_id: 'report-1',
        }))
    })

    it('includes changes object when provided', async () => {
        const changes = { before: { status: 'draft' }, after: { status: 'approved' } }
        await logAdminAction('approve_report', 'user-1', 'monthly_report', 'r-1', changes)

        expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
            changes,
        }))
    })

    it('includes metadata with timestamp and userAgent', async () => {
        await logAdminAction('edit_entry', 'user-1', 'time_entry', 'te-1')

        const insertArg = mockInsert.mock.calls[0][0]
        expect(insertArg.metadata).toHaveProperty('timestamp')
        expect(insertArg.metadata.userAgent).toBe('vitest-test-agent')
        // Timestamp should be ISO format
        expect(() => new Date(insertArg.metadata.timestamp)).not.toThrow()
    })

    it('merges custom metadata with system metadata', async () => {
        await logAdminAction('edit_entry', 'user-1', 'time_entry', 'te-1', null, {
            reason: 'Correction requested',
        })

        const insertArg = mockInsert.mock.calls[0][0]
        expect(insertArg.metadata.reason).toBe('Correction requested')
        expect(insertArg.metadata).toHaveProperty('timestamp')
    })

    it('does nothing when no authenticated user', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
            data: { user: null },
            error: null,
        })

        await logAdminAction('approve_report', 'user-1', 'monthly_report', 'r-1')

        expect(mockInsert).not.toHaveBeenCalled()
    })

    it('does not throw when insert fails', async () => {
        mockInsert.mockRejectedValue(new Error('DB error'))

        // Should not throw
        await expect(
            logAdminAction('approve_report', 'user-1', 'monthly_report', 'r-1')
        ).resolves.toBeUndefined()
    })

    it('does not throw when getUser fails', async () => {
        mockSupabase.auth.getUser.mockRejectedValue(new Error('Auth error'))

        await expect(
            logAdminAction('approve_report', 'user-1', 'monthly_report', 'r-1')
        ).resolves.toBeUndefined()
    })

    it('defaults changes to null and metadata to empty object', async () => {
        await logAdminAction('delete_entry', 'user-1', 'time_entry', 'te-1')

        const insertArg = mockInsert.mock.calls[0][0]
        expect(insertArg.changes).toBeNull()
        // metadata still has timestamp and userAgent
        expect(insertArg.metadata).toHaveProperty('timestamp')
    })
})

// =============================================================================
// fetchBeforeState
// =============================================================================

describe('fetchBeforeState', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockSupabase.from.mockReturnValue(mockQueryBuilder)
        mockQueryBuilder.select.mockReturnValue(mockQueryBuilder)
        mockQueryBuilder.eq.mockReturnValue(mockQueryBuilder)
    })

    it('queries the correct table and ID', async () => {
        mockSingle.mockResolvedValue({ data: { id: 'rec-1', status: 'draft' } })

        await fetchBeforeState('monthly_reports', 'rec-1')

        expect(mockSupabase.from).toHaveBeenCalledWith('monthly_reports')
        expect(mockQueryBuilder.select).toHaveBeenCalledWith('*')
        expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', 'rec-1')
    })

    it('accepts custom fields parameter', async () => {
        mockSingle.mockResolvedValue({ data: { status: 'draft' } })

        await fetchBeforeState('time_entries', 'te-1', 'status, hours')

        expect(mockQueryBuilder.select).toHaveBeenCalledWith('status, hours')
    })

    it('returns data on success', async () => {
        mockSingle.mockResolvedValue({ data: { id: 'rec-1', status: 'pending' } })

        const result = await fetchBeforeState('monthly_reports', 'rec-1')
        expect(result).toEqual({ id: 'rec-1', status: 'pending' })
    })

    it('returns null on error', async () => {
        mockSingle.mockRejectedValue(new Error('Not found'))

        const result = await fetchBeforeState('monthly_reports', 'nonexistent')
        expect(result).toBeNull()
    })
})

// =============================================================================
// getAuditLog
// =============================================================================

describe('getAuditLog', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockSupabase.from.mockReturnValue(mockQueryBuilder)
        mockQueryBuilder.select.mockReturnValue(mockQueryBuilder)
        mockQueryBuilder.eq.mockReturnValue(mockQueryBuilder)
        mockQueryBuilder.order.mockReturnValue(mockQueryBuilder)
    })

    it('queries admin_actions for the given user', async () => {
        mockLimit.mockResolvedValue({ data: [], error: null })

        await getAuditLog('user-1')

        expect(mockSupabase.from).toHaveBeenCalledWith('admin_actions')
        expect(mockQueryBuilder.eq).toHaveBeenCalledWith('target_user_id', 'user-1')
    })

    it('orders by created_at descending', async () => {
        mockLimit.mockResolvedValue({ data: [], error: null })

        await getAuditLog('user-1')

        expect(mockQueryBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false })
    })

    it('respects custom limit', async () => {
        mockLimit.mockResolvedValue({ data: [], error: null })

        await getAuditLog('user-1', 10)

        expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10)
    })

    it('defaults limit to 50', async () => {
        mockLimit.mockResolvedValue({ data: [], error: null })

        await getAuditLog('user-1')

        expect(mockQueryBuilder.limit).toHaveBeenCalledWith(50)
    })

    it('returns data on success', async () => {
        const mockLog = [{ id: 'log-1', action: 'approve_report' }]
        mockLimit.mockResolvedValue({ data: mockLog, error: null })

        const result = await getAuditLog('user-1')
        expect(result).toEqual(mockLog)
    })

    it('returns empty array on error', async () => {
        mockLimit.mockResolvedValue({ data: null, error: { message: 'DB error' } })

        const result = await getAuditLog('user-1')
        expect(result).toEqual([])
    })

    it('returns empty array when data is null', async () => {
        mockLimit.mockResolvedValue({ data: null, error: null })

        const result = await getAuditLog('user-1')
        expect(result).toEqual([])
    })
})

// =============================================================================
// getRecentAdminActions
// =============================================================================

describe('getRecentAdminActions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockSupabase.from.mockReturnValue(mockQueryBuilder)
        mockQueryBuilder.select.mockReturnValue(mockQueryBuilder)
        mockQueryBuilder.order.mockReturnValue(mockQueryBuilder)
    })

    it('queries admin_actions without user filter', async () => {
        mockLimit.mockResolvedValue({ data: [], error: null })

        await getRecentAdminActions()

        expect(mockSupabase.from).toHaveBeenCalledWith('admin_actions')
        // Should NOT call .eq for user filtering
        expect(mockQueryBuilder.eq).not.toHaveBeenCalled()
    })

    it('defaults limit to 100', async () => {
        mockLimit.mockResolvedValue({ data: [], error: null })

        await getRecentAdminActions()

        expect(mockQueryBuilder.limit).toHaveBeenCalledWith(100)
    })

    it('respects custom limit', async () => {
        mockLimit.mockResolvedValue({ data: [], error: null })

        await getRecentAdminActions(25)

        expect(mockQueryBuilder.limit).toHaveBeenCalledWith(25)
    })

    it('returns data on success', async () => {
        const actions = [
            { id: '1', action: 'approve_report' },
            { id: '2', action: 'edit_entry' },
        ]
        mockLimit.mockResolvedValue({ data: actions, error: null })

        const result = await getRecentAdminActions()
        expect(result).toEqual(actions)
    })

    it('returns empty array on error', async () => {
        mockLimit.mockResolvedValue({ data: null, error: { message: 'Server error' } })

        const result = await getRecentAdminActions()
        expect(result).toEqual([])
    })
})
