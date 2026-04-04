/**
 * Tests for AuthContext
 *
 * Verifies authentication state management: login, logout, role fetching,
 * password_set detection, loading states, and timeout safety.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

// =============================================================================
// Mocks
// =============================================================================

vi.mock('./lib/sentry.js', () => ({
    setUserContext: vi.fn(),
    clearUserContext: vi.fn(),
    addBreadcrumb: vi.fn(),
}))

let mockGetSession = vi.fn()
let mockOnAuthStateChange = vi.fn()
let mockProfileSelect = vi.fn()
let mockSignOut = vi.fn()

vi.mock('./supabase', () => ({
    supabase: {
        auth: {
            getSession: (...args) => mockGetSession(...args),
            onAuthStateChange: (...args) => mockOnAuthStateChange(...args),
            signOut: (...args) => mockSignOut(...args),
        },
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: (...args) => mockProfileSelect(...args),
                })),
            })),
        })),
    },
}))

function AuthConsumer() {
    const { user, role, isAdmin, loading, passwordSet, loginError } = useAuth()
    return (
        <div>
            <span data-testid="loading">{String(loading)}</span>
            <span data-testid="user">{user ? user.email : 'null'}</span>
            <span data-testid="role">{role || 'null'}</span>
            <span data-testid="isAdmin">{String(isAdmin)}</span>
            <span data-testid="passwordSet">{String(passwordSet)}</span>
            <span data-testid="loginError">{loginError || 'null'}</span>
        </div>
    )
}

// =============================================================================
// Setup
// =============================================================================

beforeEach(() => {
    vi.clearAllMocks()

    mockGetSession.mockResolvedValue({
        data: { session: null },
        error: null,
    })

    mockOnAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
    })

    mockSignOut.mockResolvedValue({ error: null })

    mockProfileSelect.mockResolvedValue({
        data: { role: 'user', password_set: true, is_active: true },
        error: null,
    })
})

// =============================================================================
// Tests
// =============================================================================

describe('AuthProvider', () => {
    it('renders children after loading completes (no session)', async () => {
        render(
            <AuthProvider>
                <AuthConsumer />
            </AuthProvider>
        )

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false')
        })

        expect(screen.getByTestId('user').textContent).toBe('null')
        expect(screen.getByTestId('role').textContent).toBe('null')
    })

    it('sets user and role when session exists', async () => {
        mockGetSession.mockResolvedValue({
            data: {
                session: {
                    user: { id: 'user-1', email: 'test@example.com' },
                },
            },
            error: null,
        })

        render(
            <AuthProvider>
                <AuthConsumer />
            </AuthProvider>
        )

        await waitFor(() => {
            expect(screen.getByTestId('user').textContent).toBe('test@example.com')
        })

        expect(screen.getByTestId('role').textContent).toBe('user')
        expect(screen.getByTestId('isAdmin').textContent).toBe('false')
    })

    it('sets isAdmin=true for admin role', async () => {
        mockGetSession.mockResolvedValue({
            data: {
                session: {
                    user: { id: 'admin-1', email: 'admin@example.com' },
                },
            },
            error: null,
        })
        mockProfileSelect.mockResolvedValue({
            data: { role: 'admin', password_set: true },
            error: null,
        })

        render(
            <AuthProvider>
                <AuthConsumer />
            </AuthProvider>
        )

        await waitFor(() => {
            expect(screen.getByTestId('isAdmin').textContent).toBe('true')
        })

        expect(screen.getByTestId('role').textContent).toBe('admin')
    })

    it('detects password_set=false for new users', async () => {
        mockGetSession.mockResolvedValue({
            data: {
                session: {
                    user: { id: 'new-1', email: 'new@example.com' },
                },
            },
            error: null,
        })
        mockProfileSelect.mockResolvedValue({
            data: { role: 'user', password_set: false },
            error: null,
        })

        render(
            <AuthProvider>
                <AuthConsumer />
            </AuthProvider>
        )

        await waitFor(() => {
            expect(screen.getByTestId('passwordSet').textContent).toBe('false')
        })
    })

    it('treats null password_set as true (old users)', async () => {
        mockGetSession.mockResolvedValue({
            data: {
                session: {
                    user: { id: 'old-1', email: 'old@example.com' },
                },
            },
            error: null,
        })
        mockProfileSelect.mockResolvedValue({
            data: { role: 'user', password_set: null },
            error: null,
        })

        render(
            <AuthProvider>
                <AuthConsumer />
            </AuthProvider>
        )

        await waitFor(() => {
            expect(screen.getByTestId('passwordSet').textContent).toBe('true')
        })
    })

    it('keeps existing role (null on initial) when profile fetch fails — does not downgrade to user', async () => {
        mockGetSession.mockResolvedValue({
            data: {
                session: {
                    user: { id: 'err-1', email: 'err@example.com' },
                },
            },
            error: null,
        })
        mockProfileSelect.mockResolvedValue({
            data: null,
            error: { message: 'Not found' },
        })

        render(
            <AuthProvider>
                <AuthConsumer />
            </AuthProvider>
        )

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false')
        })

        // Role stays null (initial state) — NOT downgraded to 'user'
        expect(screen.getByTestId('role').textContent).toBe('null')
        expect(screen.getByTestId('passwordSet').textContent).toBe('true')
    })

    it('handles getSession error gracefully', async () => {
        mockGetSession.mockResolvedValue({
            data: { session: null },
            error: new Error('Session error'),
        })

        render(
            <AuthProvider>
                <AuthConsumer />
            </AuthProvider>
        )

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false')
        })

        expect(screen.getByTestId('user').textContent).toBe('null')
    })

    it('subscribes to auth state changes on mount', async () => {
        render(
            <AuthProvider>
                <AuthConsumer />
            </AuthProvider>
        )

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false')
        })

        expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1)
    })

    it('unsubscribes on unmount', async () => {
        const unsubscribe = vi.fn()
        mockOnAuthStateChange.mockReturnValue({
            data: { subscription: { unsubscribe } },
        })

        const { unmount } = render(
            <AuthProvider>
                <AuthConsumer />
            </AuthProvider>
        )

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false')
        })

        unmount()
        expect(unsubscribe).toHaveBeenCalled()
    })

    it('updates user on auth state change (login)', async () => {
        let authCallback = null
        mockOnAuthStateChange.mockImplementation((cb) => {
            authCallback = cb
            return { data: { subscription: { unsubscribe: vi.fn() } } }
        })

        render(
            <AuthProvider>
                <AuthConsumer />
            </AuthProvider>
        )

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false')
        })

        await act(async () => {
            authCallback('SIGNED_IN', {
                user: { id: 'new-login', email: 'login@example.com' },
            })
        })

        await waitFor(() => {
            expect(screen.getByTestId('user').textContent).toBe('login@example.com')
        })
    })

    it('clears user on auth state change (logout)', async () => {
        let authCallback = null
        mockOnAuthStateChange.mockImplementation((cb) => {
            authCallback = cb
            return { data: { subscription: { unsubscribe: vi.fn() } } }
        })

        mockGetSession.mockResolvedValue({
            data: {
                session: {
                    user: { id: 'u-1', email: 'active@example.com' },
                },
            },
            error: null,
        })

        render(
            <AuthProvider>
                <AuthConsumer />
            </AuthProvider>
        )

        await waitFor(() => {
            expect(screen.getByTestId('user').textContent).toBe('active@example.com')
        })

        await act(async () => {
            authCallback('SIGNED_OUT', null)
        })

        await waitFor(() => {
            expect(screen.getByTestId('user').textContent).toBe('null')
        })

        expect(screen.getByTestId('role').textContent).toBe('null')
    })

    it('provides refreshPasswordSet function in context', async () => {
        let contextValue = null
        function ContextSpy() {
            contextValue = useAuth()
            return null
        }

        mockGetSession.mockResolvedValue({
            data: {
                session: {
                    user: { id: 'u-1', email: 'a@b.com' },
                },
            },
            error: null,
        })
        mockProfileSelect.mockResolvedValue({
            data: { role: 'user', password_set: false },
            error: null,
        })

        render(
            <AuthProvider>
                <ContextSpy />
            </AuthProvider>
        )

        await waitFor(() => {
            expect(contextValue).not.toBeNull()
            expect(contextValue.loading).toBe(false)
        })

        expect(contextValue.passwordSet).toBe(false)
        expect(typeof contextValue.refreshPasswordSet).toBe('function')
    })

    it('exposes correct context shape', async () => {
        let contextValue = null
        function ContextSpy() {
            contextValue = useAuth()
            return null
        }

        render(
            <AuthProvider>
                <ContextSpy />
            </AuthProvider>
        )

        await waitFor(() => {
            expect(contextValue).not.toBeNull()
            expect(contextValue.loading).toBe(false)
        })

        expect(contextValue).toHaveProperty('user')
        expect(contextValue).toHaveProperty('role')
        expect(contextValue).toHaveProperty('isAdmin')
        expect(contextValue).toHaveProperty('loading')
        expect(contextValue).toHaveProperty('passwordSet')
        expect(contextValue).toHaveProperty('refreshPasswordSet')
        expect(contextValue).toHaveProperty('loginError')
        expect(contextValue).toHaveProperty('clearLoginError')
    })

    // =========================================================================
    // DEACTIVATION TESTS
    // =========================================================================

    it('blocks deactivated user on session restore', async () => {
        mockGetSession.mockResolvedValue({
            data: {
                session: {
                    user: { id: 'deact-1', email: 'deact@example.com' },
                },
            },
            error: null,
        })
        mockProfileSelect.mockResolvedValue({
            data: { role: 'user', password_set: true, is_active: false },
            error: null,
        })

        render(
            <AuthProvider>
                <AuthConsumer />
            </AuthProvider>
        )

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false')
        })

        expect(screen.getByTestId('user').textContent).toBe('null')
        expect(screen.getByTestId('loginError').textContent).toBe(
            'Dein Account wurde deaktiviert. Wende dich an den Administrator.'
        )
        expect(mockSignOut).toHaveBeenCalled()
    })

    it('treats null is_active as active (backward compatibility)', async () => {
        mockGetSession.mockResolvedValue({
            data: {
                session: {
                    user: { id: 'old-2', email: 'old2@example.com' },
                },
            },
            error: null,
        })
        mockProfileSelect.mockResolvedValue({
            data: { role: 'user', password_set: true, is_active: null },
            error: null,
        })

        render(
            <AuthProvider>
                <AuthConsumer />
            </AuthProvider>
        )

        await waitFor(() => {
            expect(screen.getByTestId('user').textContent).toBe('old2@example.com')
        })

        expect(screen.getByTestId('loginError').textContent).toBe('null')
        expect(mockSignOut).not.toHaveBeenCalled()
    })

    it('blocks deactivated user on SIGNED_IN auth event', async () => {
        let authCallback = null
        mockOnAuthStateChange.mockImplementation((cb) => {
            authCallback = cb
            return { data: { subscription: { unsubscribe: vi.fn() } } }
        })
        mockProfileSelect.mockResolvedValue({
            data: { role: 'user', password_set: true, is_active: false },
            error: null,
        })

        render(
            <AuthProvider>
                <AuthConsumer />
            </AuthProvider>
        )

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false')
        })

        await act(async () => {
            await authCallback('SIGNED_IN', {
                user: { id: 'deact-2', email: 'deact2@example.com' },
            })
        })

        await waitFor(() => {
            expect(screen.getByTestId('loginError').textContent).toBe(
                'Dein Account wurde deaktiviert. Wende dich an den Administrator.'
            )
        })

        expect(screen.getByTestId('user').textContent).toBe('null')
        expect(mockSignOut).toHaveBeenCalled()
    })

    it('preserves loginError through subsequent SIGNED_OUT event', async () => {
        let authCallback = null
        mockOnAuthStateChange.mockImplementation((cb) => {
            authCallback = cb
            return { data: { subscription: { unsubscribe: vi.fn() } } }
        })
        mockProfileSelect.mockResolvedValue({
            data: { role: 'user', password_set: true, is_active: false },
            error: null,
        })

        render(
            <AuthProvider>
                <AuthConsumer />
            </AuthProvider>
        )

        await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))

        // Trigger deactivated login
        await act(async () => {
            await authCallback('SIGNED_IN', {
                user: { id: 'deact-3', email: 'deact3@example.com' },
            })
        })

        await waitFor(() => {
            expect(screen.getByTestId('loginError').textContent).not.toBe('null')
        })

        // Simulate the subsequent SIGNED_OUT (fired by our signOut() call)
        await act(async () => {
            await authCallback('SIGNED_OUT', null)
        })

        // loginError must still be present
        expect(screen.getByTestId('loginError').textContent).toBe(
            'Dein Account wurde deaktiviert. Wende dich an den Administrator.'
        )
    })

    it('handles profile fetch timeout gracefully', async () => {
        mockGetSession.mockResolvedValue({
            data: {
                session: {
                    user: { id: 'slow-1', email: 'slow@example.com' },
                },
            },
            error: null,
        })
        // Simulate timeout - the Promise.race in fetchRole has a 5s timeout
        mockProfileSelect.mockImplementation(() => new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), 100)
        }))

        render(
            <AuthProvider>
                <AuthConsumer />
            </AuthProvider>
        )

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false')
        }, { timeout: 10000 })

        // Role stays null (initial state) — NOT downgraded to 'user' on timeout
        expect(screen.getByTestId('role').textContent).toBe('null')
        expect(screen.getByTestId('passwordSet').textContent).toBe('true')
    }, 15000)
})

describe('useAuth', () => {
    it('returns undefined when used outside AuthProvider', () => {
        function Naked() {
            const auth = useAuth()
            return <span data-testid="ctx">{auth === undefined ? 'undefined' : 'defined'}</span>
        }

        render(<Naked />)
        expect(screen.getByTestId('ctx').textContent).toBe('undefined')
    })
})
