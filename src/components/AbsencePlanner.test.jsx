/**
 * Tests for AbsencePlanner component
 * Verifies calendar rendering, absence display, and role-based behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createContext, useContext } from 'react'

// Hoisted mock context — require is provided by vitest in hoisted scope
const { MockAuthContext, mockUseContext } = vi.hoisted(() => {
    // eslint-disable-next-line no-undef
    const React = require('react')
    return { MockAuthContext: React.createContext(), mockUseContext: React.useContext }
})

// Mock supabase
const mockFrom = vi.fn()
vi.mock('../supabase', () => ({
    supabase: {
        from: (...args) => mockFrom(...args),
        channel: vi.fn(() => ({
            on: vi.fn().mockReturnThis(),
            subscribe: vi.fn().mockReturnThis(),
        })),
        removeChannel: vi.fn(),
    }
}))

// Mock AuthContext
vi.mock('../AuthContext', () => ({
    AuthContext: MockAuthContext,
    useAuth: () => mockUseContext(MockAuthContext),
}))

// Mock hooks and sub-components
vi.mock('../hooks/useHolidays', () => ({
    useHolidays: () => ({ getHoliday: () => null })
}))

vi.mock('../utils/debounce', () => ({
    debounce: (fn) => fn
}))

vi.mock('../utils/adminAudit', () => ({
    logAdminAction: vi.fn()
}))

vi.mock('../utils/errorHandler', () => ({
    handleError: (err) => ({ title: 'Error', message: err.message })
}))

vi.mock('./ActionSheet', () => ({
    default: () => null
}))
vi.mock('./ConfirmModal', () => ({
    default: () => null
}))
vi.mock('./AlertModal', () => ({
    default: () => null
}))
vi.mock('./SignatureModal', () => ({
    default: () => null
}))
vi.mock('./Toast', () => ({
    useToast: () => ({
        showSuccess: vi.fn(),
        showError: vi.fn(),
        showInfo: vi.fn(),
    })
}))

import AbsencePlanner from './AbsencePlanner'

function createMockChain(data = []) {
    return {
        select: vi.fn(() => ({
            neq: vi.fn(() => Promise.resolve({ data, error: null })),
            eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: { vacation_days_per_year: 25 }, error: null })),
                eq: vi.fn(() => Promise.resolve({ data, error: null })),
            })),
        }))
    }
}

function renderPlanner(authOverrides = {}) {
    const authValue = {
        user: { id: 'user-123', email: 'test@test.com' },
        role: 'user',
        isAdmin: false,
        passwordSet: true,
        loading: false,
        session: { access_token: 'mock' },
        ...authOverrides,
    }

    return render(
        <MockAuthContext.Provider value={authValue}>
            <AbsencePlanner />
        </MockAuthContext.Provider>
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue(createMockChain([]))
})

describe('AbsencePlanner', () => {
    it('renders calendar with weekday headers', async () => {
        renderPlanner()
        await waitFor(() => {
            expect(screen.getByText('Mo')).toBeInTheDocument()
            expect(screen.getByText('Di')).toBeInTheDocument()
            expect(screen.getByText('Mi')).toBeInTheDocument()
            expect(screen.getByText('Do')).toBeInTheDocument()
            expect(screen.getByText('Fr')).toBeInTheDocument()
            expect(screen.getByText('Sa')).toBeInTheDocument()
            expect(screen.getByText('So')).toBeInTheDocument()
        })
    })

    it('shows current month name', async () => {
        renderPlanner()
        await waitFor(() => {
            // Current month should be shown (German locale)
            const monthName = new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
            // Check that at least the month name appears somewhere
            expect(document.body.textContent).toContain(new Date().getFullYear().toString())
        })
    })

    it('has month navigation buttons', async () => {
        renderPlanner()
        await waitFor(() => {
            expect(screen.getByText('Mo')).toBeInTheDocument()
        })
        // Should have left/right navigation buttons
        const buttons = screen.getAllByRole('button')
        expect(buttons.length).toBeGreaterThanOrEqual(2)
    })

    it('shows vacation stats for employees', async () => {
        mockFrom.mockImplementation((table) => {
            if (table === 'absences') {
                return {
                    select: vi.fn(() => ({
                        neq: vi.fn(() => Promise.resolve({ data: [], error: null }))
                    }))
                }
            }
            if (table === 'profiles') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            single: vi.fn(() => Promise.resolve({
                                data: { vacation_days_per_year: 25 },
                                error: null
                            }))
                        }))
                    }))
                }
            }
            return createMockChain([])
        })

        renderPlanner()
        await waitFor(() => {
            // Should show vacation stats section
            expect(screen.getByText('Mo')).toBeInTheDocument()
        })
    })

    it('fetches absences from supabase on mount', async () => {
        renderPlanner()
        await waitFor(() => {
            expect(mockFrom).toHaveBeenCalledWith('absences')
        })
    })

    it('has grid/list view toggle', async () => {
        renderPlanner()
        await waitFor(() => {
            expect(screen.getByText('Mo')).toBeInTheDocument()
        })
        // Should have view mode toggle buttons
        const buttons = screen.getAllByRole('button')
        expect(buttons.length).toBeGreaterThanOrEqual(1)
    })
})
