/**
 * Login Component Tests
 * 
 * Tests the authentication flow including:
 * - Password login
 * - Magic Link login
 * - Error handling
 * - UI state management
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'

// Mock supabase BEFORE importing the component
vi.mock('../supabase', () => ({
    supabase: {
        auth: {
            signInWithPassword: vi.fn(),
            signInWithOtp: vi.fn()
        }
    }
}))

// Mock AuthContext to provide loginError/clearLoginError without a real AuthProvider
vi.mock('../AuthContext', () => ({
    useAuth: vi.fn(() => ({
        loginError: null,
        clearLoginError: vi.fn()
    }))
}))

// Now import the component and the mocked modules
import Login from './Login'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'

// Helper to render Login with Router (required for Link components)
const renderLogin = () => {
    return render(
        <BrowserRouter>
            <Login />
        </BrowserRouter>
    )
}

// Helper functions to get elements
// Note: The Login component uses label elements without htmlFor, so we use different queries
const getEmailInput = () => document.querySelector('input[type="email"]')
const getPasswordInput = () => document.querySelector('input[type="password"]')
const getSubmitButton = () => screen.getByRole('button', { name: /einloggen|link anfordern|lade/i })

describe('Login Component', () => {
    beforeEach(() => {
        // Reset all mocks before each test
        vi.clearAllMocks()
        // Restore default useAuth mock (individual tests may override with mockReturnValue)
        useAuth.mockReturnValue({ loginError: null, clearLoginError: vi.fn() })
    })

    // =========================================================================
    // RENDERING TESTS
    // =========================================================================

    describe('Initial Render', () => {
        it('renders the login form with title', () => {
            renderLogin()
            expect(screen.getByText('WoBePlaner')).toBeInTheDocument()
        })

        it('shows email input field', () => {
            renderLogin()
            expect(getEmailInput()).toBeInTheDocument()
        })

        it('shows password input field', () => {
            renderLogin()
            expect(getPasswordInput()).toBeInTheDocument()
        })

        it('shows submit button', () => {
            renderLogin()
            expect(screen.getByRole('button', { name: /einloggen/i })).toBeInTheDocument()
        })

        it('shows magic link toggle button', () => {
            renderLogin()
            expect(screen.getByText(/passwort vergessen/i)).toBeInTheDocument()
        })

        it('shows legal links (Impressum, Datenschutz)', () => {
            renderLogin()
            expect(screen.getByText('Impressum')).toBeInTheDocument()
            expect(screen.getByText('Datenschutz')).toBeInTheDocument()
        })

        it('displays logo', () => {
            renderLogin()
            const logo = screen.getByAltText('Logo')
            expect(logo).toBeInTheDocument()
            expect(logo).toHaveAttribute('src', '/logo2.png')
        })
    })

    // =========================================================================
    // MAGIC LINK MODE TOGGLE
    // =========================================================================

    describe('Magic Link Mode', () => {
        it('switches to magic link mode when toggle is clicked', async () => {
            const user = userEvent.setup()
            renderLogin()

            await user.click(screen.getByText(/passwort vergessen/i))

            // Title should change
            expect(screen.getByText('Login per Link')).toBeInTheDocument()

            // Password field should be hidden
            expect(getPasswordInput()).not.toBeInTheDocument()

            // Button text should change
            expect(screen.getByRole('button', { name: /link anfordern/i })).toBeInTheDocument()
        })

        it('switches back to password mode when toggle is clicked again', async () => {
            const user = userEvent.setup()
            renderLogin()

            // Toggle to magic link
            await user.click(screen.getByText(/passwort vergessen/i))

            // Toggle back
            await user.click(screen.getByText(/zurück zum passwort/i))

            // Should be back to password mode
            expect(screen.getByText('WoBePlaner')).toBeInTheDocument()
            expect(getPasswordInput()).toBeInTheDocument()
        })
    })

    // =========================================================================
    // PASSWORD LOGIN
    // =========================================================================

    describe('Password Login', () => {
        it('calls signInWithPassword with correct credentials', async () => {
            const user = userEvent.setup()
            supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: null })

            renderLogin()

            await user.type(getEmailInput(), 'test@example.com')
            await user.type(getPasswordInput(), 'SecurePassword123')
            await user.click(getSubmitButton())

            expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
                email: 'test@example.com',
                password: 'SecurePassword123'
            })
        })

        it('shows loading state during login', async () => {
            const user = userEvent.setup()

            // Make the promise never resolve
            supabase.auth.signInWithPassword.mockImplementation(() =>
                new Promise(() => { })
            )

            renderLogin()

            await user.type(getEmailInput(), 'test@example.com')
            await user.type(getPasswordInput(), 'password')
            await user.click(getSubmitButton())

            expect(screen.getByRole('button', { name: /lade/i })).toBeInTheDocument()
            expect(screen.getByRole('button', { name: /lade/i })).toBeDisabled()
        })


        it('displays error message on failed login', async () => {
            const user = userEvent.setup()
            supabase.auth.signInWithPassword.mockResolvedValue({
                data: null,
                error: { message: 'Invalid login credentials' }
            })

            renderLogin()

            await user.type(getEmailInput(), 'test@example.com')
            await user.type(getPasswordInput(), 'wrongpassword')
            await user.click(getSubmitButton())

            await waitFor(() => {
                expect(screen.getByText('Invalid login credentials')).toBeInTheDocument()
            })
        })

        it('error message has red styling', async () => {
            const user = userEvent.setup()
            supabase.auth.signInWithPassword.mockResolvedValue({
                data: null,
                error: { message: 'Invalid login credentials' }
            })

            renderLogin()

            await user.type(getEmailInput(), 'test@example.com')
            await user.type(getPasswordInput(), 'wrong')
            await user.click(getSubmitButton())

            await waitFor(() => {
                const errorDiv = screen.getByText('Invalid login credentials').closest('div')
                expect(errorDiv).toHaveClass('bg-red-50')
            })
        })
    })

    // =========================================================================
    // MAGIC LINK LOGIN
    // =========================================================================

    describe('Magic Link Login', () => {
        it('calls signInWithOtp when in magic link mode', async () => {
            const user = userEvent.setup()
            supabase.auth.signInWithOtp.mockResolvedValue({ data: {}, error: null })

            renderLogin()

            await user.click(screen.getByText(/passwort vergessen/i))
            await user.type(getEmailInput(), 'magic@example.com')
            await user.click(screen.getByRole('button', { name: /link anfordern/i }))

            expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
                email: 'magic@example.com'
            })
        })

        it('shows success message after requesting magic link', async () => {
            const user = userEvent.setup()
            supabase.auth.signInWithOtp.mockResolvedValue({ data: {}, error: null })

            renderLogin()

            await user.click(screen.getByText(/passwort vergessen/i))
            await user.type(getEmailInput(), 'magic@example.com')
            await user.click(screen.getByRole('button', { name: /link anfordern/i }))

            await waitFor(() => {
                expect(screen.getByText(/checke deine e-mails/i)).toBeInTheDocument()
            })
        })

        it('success message has green styling', async () => {
            const user = userEvent.setup()
            supabase.auth.signInWithOtp.mockResolvedValue({ data: {}, error: null })

            renderLogin()

            await user.click(screen.getByText(/passwort vergessen/i))
            await user.type(getEmailInput(), 'magic@example.com')
            await user.click(screen.getByRole('button', { name: /link anfordern/i }))

            await waitFor(() => {
                const successDiv = screen.getByText(/checke deine e-mails/i).closest('div')
                expect(successDiv).toHaveClass('bg-green-50')
            })
        })
    })

    // =========================================================================
    // FORM VALIDATION
    // =========================================================================

    describe('Form Validation', () => {
        it('email field is required', () => {
            renderLogin()
            expect(getEmailInput()).toHaveAttribute('required')
        })

        it('password field is required in password mode', () => {
            renderLogin()
            expect(getPasswordInput()).toHaveAttribute('required')
        })

        it('email input has correct type', () => {
            renderLogin()
            expect(getEmailInput()).toHaveAttribute('type', 'email')
        })

        it('password input has correct type (masked)', () => {
            renderLogin()
            expect(getPasswordInput()).toHaveAttribute('type', 'password')
        })
    })

    // =========================================================================
    // DEACTIVATION ERROR TESTS
    // =========================================================================

    describe('Deactivation Error', () => {
        it('displays loginError from AuthContext', () => {
            useAuth.mockReturnValue({
                loginError: 'Dein Account wurde deaktiviert. Wende dich an den Administrator.',
                clearLoginError: vi.fn()
            })

            renderLogin()

            expect(screen.getByText('Dein Account wurde deaktiviert. Wende dich an den Administrator.')).toBeInTheDocument()
        })

        it('loginError box has red styling', () => {
            useAuth.mockReturnValue({
                loginError: 'Dein Account wurde deaktiviert. Wende dich an den Administrator.',
                clearLoginError: vi.fn()
            })

            renderLogin()

            const errorDiv = screen.getByText(/deaktiviert/i).closest('div')
            expect(errorDiv).toHaveClass('bg-red-50')
        })

        it('loginError takes priority over message in display', async () => {
            useAuth.mockReturnValue({
                loginError: 'Dein Account wurde deaktiviert. Wende dich an den Administrator.',
                clearLoginError: vi.fn()
            })
            supabase.auth.signInWithPassword.mockResolvedValue({
                data: null,
                error: { message: 'Invalid login credentials' }
            })

            const user = userEvent.setup()
            renderLogin()

            await user.type(getEmailInput(), 'test@example.com')
            await user.type(getPasswordInput(), 'wrong')
            await user.click(getSubmitButton())

            await waitFor(() => {
                // loginError takes priority via `loginError || message`
                expect(screen.getByText(/deaktiviert/i)).toBeInTheDocument()
            })
        })
    })

    // =========================================================================
    // SECURITY TESTS
    // =========================================================================

    describe('Security', () => {
        it('clears message when switching login modes', async () => {
            const user = userEvent.setup()
            supabase.auth.signInWithPassword.mockResolvedValue({
                data: null,
                error: { message: 'Some error' }
            })

            renderLogin()

            await user.type(getEmailInput(), 'test@example.com')
            await user.type(getPasswordInput(), 'wrong')
            await user.click(getSubmitButton())

            await waitFor(() => {
                expect(screen.getByText('Some error')).toBeInTheDocument()
            })

            // Switch mode - error should disappear
            await user.click(screen.getByText(/passwort vergessen/i))

            expect(screen.queryByText('Some error')).not.toBeInTheDocument()
        })

        it('calls clearLoginError at the start of handleLogin', async () => {
            const clearLoginError = vi.fn()
            useAuth.mockReturnValue({ loginError: null, clearLoginError })
            supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: null })

            const user = userEvent.setup()
            renderLogin()

            await user.type(getEmailInput(), 'test@example.com')
            await user.type(getPasswordInput(), 'password')
            await user.click(getSubmitButton())

            expect(clearLoginError).toHaveBeenCalledTimes(1)
        })

        it('does not expose password in visible text', () => {
            renderLogin()

            const passwordInput = getPasswordInput()
            fireEvent.change(passwordInput, { target: { value: 'mysecretpassword' } })

            // Password field should be masked (type="password")
            expect(passwordInput).toHaveAttribute('type', 'password')
        })

        it('button is disabled during loading', async () => {
            const user = userEvent.setup()

            // Keep loading indefinitely
            supabase.auth.signInWithPassword.mockImplementation(() =>
                new Promise(() => { })
            )

            renderLogin()

            await user.type(getEmailInput(), 'test@example.com')
            await user.type(getPasswordInput(), 'password')
            await user.click(getSubmitButton())

            // Get the submit button specifically (not the toggle button)
            const button = screen.getByRole('button', { name: /lade/i })
            expect(button).toBeDisabled()
        })
    })
})
