/**
 * Test Utilities for React Component Testing
 * 
 * Provides mocked Supabase client and AuthContext for isolated component tests.
 * CRITICAL: These mocks ensure tests don't hit the real database.
 */
import { render } from '@testing-library/react'
import { vi } from 'vitest'

// =============================================================================
// SUPABASE MOCK
// =============================================================================

/**
 * Creates a mock Supabase client with chainable query builder
 * Usage: const supabase = createMockSupabase({ profiles: [{ id: '1', full_name: 'Test' }] })
 */
export function createMockSupabase(mockData = {}) {
    const createQueryBuilder = (tableName) => {
        let currentData = mockData[tableName] || []
        let filters = {}

        const builder = {
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockReturnThis(),
            eq: vi.fn((column, value) => {
                filters[column] = value
                return builder
            }),
            neq: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            like: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            range: vi.fn().mockReturnThis(),
            single: vi.fn(() => {
                // Filter by accumulated filters
                let result = currentData
                Object.entries(filters).forEach(([col, val]) => {
                    result = result.filter(row => row[col] === val)
                })
                return Promise.resolve({
                    data: result[0] || null,
                    error: result[0] ? null : { message: 'Not found' }
                })
            }),
            maybeSingle: vi.fn(() => {
                let result = currentData
                Object.entries(filters).forEach(([col, val]) => {
                    result = result.filter(row => row[col] === val)
                })
                return Promise.resolve({
                    data: result[0] || null,
                    error: null
                })
            }),
            then: (resolve) => {
                // Apply filters
                let result = currentData
                Object.entries(filters).forEach(([col, val]) => {
                    result = result.filter(row => row[col] === val)
                })
                return resolve({ data: result, error: null })
            }
        }

        return builder
    }

    return {
        from: vi.fn((tableName) => createQueryBuilder(tableName)),
        auth: {
            getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
            getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
            signInWithPassword: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
            signOut: vi.fn(() => Promise.resolve({ error: null })),
            onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
            updateUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
        },
        channel: vi.fn(() => ({
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn().mockReturnThis(),
        })),
        removeChannel: vi.fn(),
        rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
        functions: {
            invoke: vi.fn(() => Promise.resolve({ data: null, error: null }))
        }
    }
}

// =============================================================================
// AUTH CONTEXT MOCK
// =============================================================================

/**
 * Mock user profiles for testing
 */
export const mockUsers = {
    admin: {
        id: 'admin-uuid-123',
        email: 'admin@test.local',
        role: 'admin',
        full_name: 'Test Admin',
        display_name: 'Admin',
        weekly_hours: 40,
        vacation_days_per_year: 25,
        password_set: true,
        is_active: true
    },
    employee: {
        id: 'employee-uuid-456',
        email: 'mitarbeiter@test.local',
        role: 'user',
        full_name: 'Max Mustermann',
        display_name: 'Max',
        weekly_hours: 40,
        vacation_days_per_year: 25,
        password_set: true,
        is_active: true
    },
    partTime: {
        id: 'parttime-uuid-789',
        email: 'teilzeit@test.local',
        role: 'user',
        full_name: 'Lisa Teilzeit',
        display_name: 'Lisa',
        weekly_hours: 20,
        vacation_days_per_year: 25,
        password_set: true,
        is_active: true
    },
    newUser: {
        id: 'new-uuid-000',
        email: 'neu@test.local',
        role: 'user',
        full_name: 'Neuer Mitarbeiter',
        password_set: false, // Needs to set password
        is_active: true
    }
}

/**
 * Creates a mock AuthContext value
 * @param {'admin' | 'employee' | 'partTime' | 'newUser' | null} userType 
 */
export function createMockAuthContext(userType = 'employee') {
    const user = userType ? mockUsers[userType] : null

    return {
        user: user ? { id: user.id, email: user.email } : null,
        role: user?.role || null,
        isAdmin: user?.role === 'admin',
        passwordSet: user?.password_set ?? true,
        loading: false,
        session: user ? { access_token: 'mock-token' } : null
    }
}

// =============================================================================
// RENDER HELPERS
// =============================================================================

import { AuthContext } from '../AuthContext'

/**
 * Renders a component with mocked AuthContext
 * @param {React.ReactElement} ui - Component to render
 * @param {Object} options
 * @param {'admin' | 'employee' | 'partTime' | 'newUser' | null} options.user - User type
 * @param {Object} options.authOverrides - Override specific auth values
 */
export function renderWithAuth(ui, { user = 'employee', authOverrides = {} } = {}) {
    const authValue = {
        ...createMockAuthContext(user),
        ...authOverrides
    }

    return {
        ...render(
            <AuthContext.Provider value={authValue}>
                {ui}
            </AuthContext.Provider>
        ),
        authValue
    }
}

/**
 * Renders component with both Auth and mocked Supabase
 */
export function renderWithProviders(ui, { user = 'employee', mockData = {}, authOverrides = {} } = {}) {
    const supabase = createMockSupabase(mockData)
    const authValue = {
        ...createMockAuthContext(user),
        ...authOverrides
    }

    // Mock the supabase import
    vi.mock('../supabase', () => ({
        supabase
    }))

    return {
        ...render(
            <AuthContext.Provider value={authValue}>
                {ui}
            </AuthContext.Provider>
        ),
        supabase,
        authValue
    }
}

// =============================================================================
// SECURITY TEST HELPERS
// =============================================================================

/**
 * Test data for RLS verification
 * User A should NEVER see User B's private data
 */
export const rlsTestData = {
    profiles: [
        mockUsers.admin,
        mockUsers.employee,
        mockUsers.partTime
    ],
    absences: [
        {
            id: 'abs-1',
            user_id: mockUsers.employee.id,
            type: 'Krank', // SENSITIVE - should be hidden from colleagues
            status: 'genehmigt',
            start_date: '2025-01-15',
            end_date: '2025-01-17'
        },
        {
            id: 'abs-2',
            user_id: mockUsers.partTime.id,
            type: 'Urlaub',
            status: 'genehmigt',
            start_date: '2025-01-20',
            end_date: '2025-01-24'
        }
    ],
    time_entries: [
        {
            id: 'te-1',
            user_id: mockUsers.employee.id, // PRIVATE to this user
            entry_date: '2025-01-10',
            actual_start: '2025-01-10T08:00:00',
            actual_end: '2025-01-10T16:30:00',
            calculated_hours: 8.5
        }
    ]
}

/**
 * Asserts that sensitive data is properly anonymized
 */
export function assertAnonymized(element, sensitiveTerms = ['Krank', 'Krankenstand', 'krank']) {
    const text = element.textContent || ''
    sensitiveTerms.forEach(term => {
        if (text.toLowerCase().includes(term.toLowerCase())) {
            throw new Error(`DSGVO VIOLATION: Found sensitive term "${term}" in output: "${text}"`)
        }
    })
}
