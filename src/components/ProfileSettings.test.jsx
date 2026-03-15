/**
 * Tests for ProfileSettings component
 * Verifies profile editing, password change, and logout functionality.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProfileSettings from './ProfileSettings'

// Mock supabase
const mockUpdate = vi.fn()
const mockUpdateEq = vi.fn()
const mockUpdateUser = vi.fn()
const mockSignOut = vi.fn()

vi.mock('../supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            update: (...args) => {
                mockUpdate(...args)
                return { eq: (...eqArgs) => { mockUpdateEq(...eqArgs); return Promise.resolve({ error: null }) } }
            }
        })),
        auth: {
            updateUser: (...args) => mockUpdateUser(...args),
            signOut: (...args) => mockSignOut(...args),
        }
    }
}))

// Mock NotificationToggle
vi.mock('./NotificationToggle', () => ({
    default: () => <div data-testid="notification-toggle">NotificationToggle</div>
}))

// Mock window.alert and window.location.reload
const mockAlert = vi.fn()
const mockReload = vi.fn()
Object.defineProperty(window, 'alert', { value: mockAlert, writable: true })
Object.defineProperty(window, 'location', { value: { reload: mockReload }, writable: true })

const defaultProps = {
    user: { id: 'user-123', email: 'max@test.com' },
    profile: {
        full_name: 'Max Mustermann',
        display_name: 'Max',
        role: 'user',
        weekly_hours: 40,
        start_date: '2024-01-15',
    },
    onProfileUpdate: vi.fn(),
}

beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateUser.mockResolvedValue({ error: null })
    mockSignOut.mockResolvedValue({ error: null })
})

describe('ProfileSettings', () => {
    it('renders profile header with display name', () => {
        render(<ProfileSettings {...defaultProps} />)
        expect(screen.getByText('Max')).toBeInTheDocument()
        // "Mitarbeiter" appears twice (header + info grid), verify at least one
        expect(screen.getAllByText('Mitarbeiter').length).toBeGreaterThanOrEqual(1)
    })

    it('shows "Administrator" for admin role', () => {
        render(<ProfileSettings {...defaultProps} profile={{ ...defaultProps.profile, role: 'admin' }} />)
        expect(screen.getAllByText('Administrator').length).toBeGreaterThan(0)
    })

    it('renders info grid with role, start date, weekly hours, and team', () => {
        render(<ProfileSettings {...defaultProps} />)
        expect(screen.getByText('40h')).toBeInTheDocument()
        expect(screen.getByText('WoBe')).toBeInTheDocument()
        expect(screen.getByText(/15. Jänner 2024|15. Januar 2024/)).toBeInTheDocument()
    })

    it('renders name input fields with current values', () => {
        render(<ProfileSettings {...defaultProps} />)
        const nameInput = screen.getByPlaceholderText('Vorname Nachname')
        expect(nameInput.value).toBe('Max Mustermann')
        const displayInput = screen.getByPlaceholderText(/Maxi/)
        expect(displayInput.value).toBe('Max')
    })

    it('calls supabase update on save', async () => {
        render(<ProfileSettings {...defaultProps} />)
        fireEvent.click(screen.getByText(/Speichern/))
        await waitFor(() => {
            expect(mockUpdate).toHaveBeenCalledWith({
                full_name: 'Max Mustermann',
                display_name: 'Max'
            })
        })
    })

    it('calls onProfileUpdate after successful save', async () => {
        render(<ProfileSettings {...defaultProps} />)
        fireEvent.click(screen.getByText(/Speichern/))
        await waitFor(() => {
            expect(defaultProps.onProfileUpdate).toHaveBeenCalled()
        })
    })

    it('renders password change section', () => {
        render(<ProfileSettings {...defaultProps} />)
        expect(screen.getByText('Sicherheit')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Neues Passwort')).toBeInTheDocument()
        expect(screen.getByText('Setzen')).toBeInTheDocument()
    })

    it('password button is disabled when input is empty', () => {
        render(<ProfileSettings {...defaultProps} />)
        const setBtn = screen.getByText('Setzen')
        expect(setBtn).toBeDisabled()
    })

    it('calls supabase.auth.updateUser for password change', async () => {
        render(<ProfileSettings {...defaultProps} />)
        const user = userEvent.setup()
        await user.type(screen.getByPlaceholderText('Neues Passwort'), 'newpass123')
        fireEvent.click(screen.getByText('Setzen'))
        await waitFor(() => {
            expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpass123' })
        })
    })

    it('shows signature security info section', () => {
        render(<ProfileSettings {...defaultProps} />)
        expect(screen.getByText(/Wie sicher ist meine Unterschrift/)).toBeInTheDocument()
        expect(screen.getByText(/Fortgeschrittene Elektronische Signatur/)).toBeInTheDocument()
    })

    it('renders notification toggle', () => {
        render(<ProfileSettings {...defaultProps} />)
        expect(screen.getByTestId('notification-toggle')).toBeInTheDocument()
    })

    it('renders logout button', () => {
        render(<ProfileSettings {...defaultProps} />)
        expect(screen.getByText('Abmelden')).toBeInTheDocument()
    })

    it('calls supabase.auth.signOut on logout', async () => {
        render(<ProfileSettings {...defaultProps} />)
        fireEvent.click(screen.getByText('Abmelden'))
        await waitFor(() => {
            expect(mockSignOut).toHaveBeenCalled()
        })
    })

    it('falls back to email when display_name and full_name are empty', () => {
        render(<ProfileSettings {...defaultProps} profile={{ ...defaultProps.profile, full_name: null, display_name: null }} />)
        expect(screen.getByText('max@test.com')).toBeInTheDocument()
    })
})
