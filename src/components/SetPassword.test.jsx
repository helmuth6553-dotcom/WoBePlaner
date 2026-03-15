/**
 * Tests for SetPassword onboarding wizard
 * Verifies 3-step flow (welcome → privacy → password) and password validation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SetPassword from './SetPassword'

// Mock supabase
const mockUpdateUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('../supabase', () => ({
    supabase: {
        auth: {
            updateUser: (...args) => mockUpdateUser(...args),
        },
        from: (...args) => mockFrom(...args),
    }
}))

const defaultUser = { id: 'user-123', email: 'test@example.com' }

beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateUser.mockResolvedValue({ data: {}, error: null })
    mockFrom.mockReturnValue({
        update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null })
        })
    })
})

describe('SetPassword', () => {
    // =========================================================================
    // Step 1: Welcome
    // =========================================================================

    it('renders welcome step by default', () => {
        render(<SetPassword user={defaultUser} onPasswordSet={vi.fn()} />)
        expect(screen.getByText(/Willkommen im Team/)).toBeInTheDocument()
    })

    it('shows feature cards on welcome step', () => {
        render(<SetPassword user={defaultUser} onPasswordSet={vi.fn()} />)
        expect(screen.getByText('Dienstplan')).toBeInTheDocument()
        expect(screen.getByText('Urlaubsplanung')).toBeInTheDocument()
        expect(screen.getByText('Zeiterfassung')).toBeInTheDocument()
    })

    it('navigates to privacy step on "Weiter" click', async () => {
        render(<SetPassword user={defaultUser} onPasswordSet={vi.fn()} />)
        fireEvent.click(screen.getByText(/Weiter/))
        expect(screen.getByText(/Deine Daten bei uns/)).toBeInTheDocument()
    })

    // =========================================================================
    // Step 2: Privacy
    // =========================================================================

    it('shows privacy info on step 2', () => {
        render(<SetPassword user={defaultUser} onPasswordSet={vi.fn()} />)
        fireEvent.click(screen.getByText(/Weiter/))
        expect(screen.getByText(/Was speichern wir/)).toBeInTheDocument()
        expect(screen.getByText(/Was NICHT/)).toBeInTheDocument()
    })

    it('shows "Wer sieht was" table', () => {
        render(<SetPassword user={defaultUser} onPasswordSet={vi.fn()} />)
        fireEvent.click(screen.getByText(/Weiter/))
        expect(screen.getByText(/Wer sieht was/)).toBeInTheDocument()
        expect(screen.getByText('Schichten')).toBeInTheDocument()
        expect(screen.getByText('Stundenkonto')).toBeInTheDocument()
    })

    it('can navigate back from privacy to welcome', () => {
        render(<SetPassword user={defaultUser} onPasswordSet={vi.fn()} />)
        fireEvent.click(screen.getByText(/Weiter/))
        fireEvent.click(screen.getByText(/Zurück/))
        expect(screen.getByText(/Willkommen im Team/)).toBeInTheDocument()
    })

    it('navigates to password step from privacy', () => {
        render(<SetPassword user={defaultUser} onPasswordSet={vi.fn()} />)
        fireEvent.click(screen.getByText(/Weiter/))
        fireEvent.click(screen.getByText(/Verstanden, weiter/))
        expect(screen.getByText(/Letzter Schritt/)).toBeInTheDocument()
    })

    // =========================================================================
    // Step 3: Password form
    // =========================================================================

    it('renders password form on step 3', () => {
        render(<SetPassword user={defaultUser} onPasswordSet={vi.fn()} />)
        // Navigate to password step
        fireEvent.click(screen.getByText(/Weiter/))
        fireEvent.click(screen.getByText(/Verstanden, weiter/))

        expect(screen.getByPlaceholderText(/Mindestens 8 Zeichen/)).toBeInTheDocument()
        expect(screen.getByPlaceholderText(/Passwort wiederholen/)).toBeInTheDocument()
        expect(screen.getByText(/Passwort speichern/)).toBeInTheDocument()
    })

    it('can navigate back from password to privacy', () => {
        render(<SetPassword user={defaultUser} onPasswordSet={vi.fn()} />)
        fireEvent.click(screen.getByText(/Weiter/))
        fireEvent.click(screen.getByText(/Verstanden, weiter/))
        fireEvent.click(screen.getByText(/Zurück/))
        expect(screen.getByText(/Deine Daten bei uns/)).toBeInTheDocument()
    })

    it('shows error for password shorter than 8 characters', async () => {
        render(<SetPassword user={defaultUser} onPasswordSet={vi.fn()} />)
        fireEvent.click(screen.getByText(/Weiter/))
        fireEvent.click(screen.getByText(/Verstanden, weiter/))

        const user = userEvent.setup()
        await user.type(screen.getByPlaceholderText(/Mindestens 8 Zeichen/), 'short')
        await user.type(screen.getByPlaceholderText(/Passwort wiederholen/), 'short')

        fireEvent.submit(screen.getByText(/Passwort speichern/).closest('form'))

        expect(screen.getByText(/mindestens 8 Zeichen/)).toBeInTheDocument()
        expect(mockUpdateUser).not.toHaveBeenCalled()
    })

    it('shows error when passwords do not match', async () => {
        render(<SetPassword user={defaultUser} onPasswordSet={vi.fn()} />)
        fireEvent.click(screen.getByText(/Weiter/))
        fireEvent.click(screen.getByText(/Verstanden, weiter/))

        const user = userEvent.setup()
        await user.type(screen.getByPlaceholderText(/Mindestens 8 Zeichen/), 'password123')
        await user.type(screen.getByPlaceholderText(/Passwort wiederholen/), 'different99')

        fireEvent.submit(screen.getByText(/Passwort speichern/).closest('form'))

        expect(screen.getByText(/stimmen nicht überein/)).toBeInTheDocument()
        expect(mockUpdateUser).not.toHaveBeenCalled()
    })

    it('calls supabase.auth.updateUser and onPasswordSet on success', async () => {
        const onPasswordSet = vi.fn()
        render(<SetPassword user={defaultUser} onPasswordSet={onPasswordSet} />)
        fireEvent.click(screen.getByText(/Weiter/))
        fireEvent.click(screen.getByText(/Verstanden, weiter/))

        const user = userEvent.setup()
        await user.type(screen.getByPlaceholderText(/Mindestens 8 Zeichen/), 'securePassword123')
        await user.type(screen.getByPlaceholderText(/Passwort wiederholen/), 'securePassword123')

        fireEvent.submit(screen.getByText(/Passwort speichern/).closest('form'))

        await waitFor(() => {
            expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'securePassword123' })
        })

        await waitFor(() => {
            expect(onPasswordSet).toHaveBeenCalled()
        })
    })

    it('updates profile password_set flag after setting password', async () => {
        render(<SetPassword user={defaultUser} onPasswordSet={vi.fn()} />)
        fireEvent.click(screen.getByText(/Weiter/))
        fireEvent.click(screen.getByText(/Verstanden, weiter/))

        const user = userEvent.setup()
        await user.type(screen.getByPlaceholderText(/Mindestens 8 Zeichen/), 'securePassword123')
        await user.type(screen.getByPlaceholderText(/Passwort wiederholen/), 'securePassword123')

        fireEvent.submit(screen.getByText(/Passwort speichern/).closest('form'))

        await waitFor(() => {
            expect(mockFrom).toHaveBeenCalledWith('profiles')
        })
    })

    it('shows error message when supabase.auth.updateUser fails', async () => {
        mockUpdateUser.mockResolvedValue({ data: null, error: { message: 'Auth error' } })

        render(<SetPassword user={defaultUser} onPasswordSet={vi.fn()} />)
        fireEvent.click(screen.getByText(/Weiter/))
        fireEvent.click(screen.getByText(/Verstanden, weiter/))

        const user = userEvent.setup()
        await user.type(screen.getByPlaceholderText(/Mindestens 8 Zeichen/), 'securePassword123')
        await user.type(screen.getByPlaceholderText(/Passwort wiederholen/), 'securePassword123')

        fireEvent.submit(screen.getByText(/Passwort speichern/).closest('form'))

        await waitFor(() => {
            expect(screen.getByText(/Auth error/)).toBeInTheDocument()
        })
    })

    it('disables submit button while loading', async () => {
        // Make updateUser hang
        mockUpdateUser.mockReturnValue(new Promise(() => {}))

        render(<SetPassword user={defaultUser} onPasswordSet={vi.fn()} />)
        fireEvent.click(screen.getByText(/Weiter/))
        fireEvent.click(screen.getByText(/Verstanden, weiter/))

        const user = userEvent.setup()
        await user.type(screen.getByPlaceholderText(/Mindestens 8 Zeichen/), 'securePassword123')
        await user.type(screen.getByPlaceholderText(/Passwort wiederholen/), 'securePassword123')

        fireEvent.submit(screen.getByText(/Passwort speichern/).closest('form'))

        await waitFor(() => {
            expect(screen.getByText(/Speichere/)).toBeInTheDocument()
        })
    })
})
