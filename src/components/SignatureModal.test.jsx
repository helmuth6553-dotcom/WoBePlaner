/**
 * Tests for SignatureModal component
 * Verifies FES signature flow: password input, authentication, SHA-256 hash, and callbacks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SignatureModal from './SignatureModal'

// Mock supabase auth
const mockGetUser = vi.fn()
const mockSignIn = vi.fn()

vi.mock('../supabase', () => ({
    supabase: {
        auth: {
            getUser: (...args) => mockGetUser(...args),
            signInWithPassword: (...args) => mockSignIn(...args),
        }
    }
}))

const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    payload: { type: 'Urlaub', start_date: '2025-01-15', end_date: '2025-01-20' },
    title: 'Urlaubsantrag signieren',
}

beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123', email: 'test@test.com' } } })
    mockSignIn.mockResolvedValue({ error: null })
    defaultProps.onClose = vi.fn()
    defaultProps.onConfirm = vi.fn()
})

describe('SignatureModal', () => {
    it('renders nothing when isOpen is false', () => {
        const { container } = render(<SignatureModal {...defaultProps} isOpen={false} />)
        expect(container.innerHTML).toBe('')
    })

    it('renders modal with custom title', () => {
        render(<SignatureModal {...defaultProps} />)
        expect(screen.getByText('Urlaubsantrag signieren')).toBeInTheDocument()
    })

    it('uses default title when none provided', () => {
        render(<SignatureModal {...defaultProps} title={undefined} />)
        expect(screen.getByText('Dokument signieren')).toBeInTheDocument()
    })

    it('renders password input', () => {
        render(<SignatureModal {...defaultProps} />)
        expect(screen.getByPlaceholderText('Ihr App-Passwort')).toBeInTheDocument()
    })

    it('shows FES info text', () => {
        render(<SignatureModal {...defaultProps} />)
        expect(screen.getByText(/digitale Signatur/)).toBeInTheDocument()
        expect(screen.getByText(/FES-Standard/)).toBeInTheDocument()
    })

    it('disables sign button when password is empty', () => {
        render(<SignatureModal {...defaultProps} />)
        const signBtn = screen.getByText(/Signieren & Einreichen/)
        expect(signBtn.closest('button')).toBeDisabled()
    })

    it('calls onClose when X button is clicked', () => {
        render(<SignatureModal {...defaultProps} />)
        const buttons = screen.getAllByRole('button')
        const closeBtn = buttons.find(b => b.querySelector('svg.lucide-x'))
        if (closeBtn) {
            fireEvent.click(closeBtn)
            expect(defaultProps.onClose).toHaveBeenCalled()
        }
    })

    it('authenticates user and calls onConfirm with signature data', async () => {
        defaultProps.onConfirm.mockResolvedValue(undefined)
        render(<SignatureModal {...defaultProps} />)

        const user = userEvent.setup()
        await user.type(screen.getByPlaceholderText('Ihr App-Passwort'), 'myPassword123')
        fireEvent.click(screen.getByText(/Signieren & Einreichen/))

        await waitFor(() => {
            expect(mockGetUser).toHaveBeenCalled()
            expect(mockSignIn).toHaveBeenCalledWith({
                email: 'test@test.com',
                password: 'myPassword123'
            })
        })

        await waitFor(() => {
            expect(defaultProps.onConfirm).toHaveBeenCalledWith(
                defaultProps.payload,
                expect.objectContaining({
                    signer_id: 'user-123',
                    role: 'applicant',
                    hash: expect.stringMatching(/^[0-9a-f]{64}$/), // SHA-256 hex
                })
            )
        })
    })

    it('shows error when password is wrong', async () => {
        mockSignIn.mockResolvedValue({ error: { message: 'Invalid credentials' } })
        render(<SignatureModal {...defaultProps} />)

        const user = userEvent.setup()
        await user.type(screen.getByPlaceholderText('Ihr App-Passwort'), 'wrongpassword')
        fireEvent.click(screen.getByText(/Signieren & Einreichen/))

        await waitFor(() => {
            expect(screen.getByText(/Falsches Passwort/)).toBeInTheDocument()
        })
    })

    it('shows error when user is not logged in', async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } })
        render(<SignatureModal {...defaultProps} />)

        const user = userEvent.setup()
        await user.type(screen.getByPlaceholderText('Ihr App-Passwort'), 'password123')
        fireEvent.click(screen.getByText(/Signieren & Einreichen/))

        await waitFor(() => {
            expect(screen.getByText(/Nicht eingeloggt/)).toBeInTheDocument()
        })
    })

    it('shows SHA-256 info text', () => {
        render(<SignatureModal {...defaultProps} />)
        expect(screen.getByText(/SHA-256/)).toBeInTheDocument()
    })
})
