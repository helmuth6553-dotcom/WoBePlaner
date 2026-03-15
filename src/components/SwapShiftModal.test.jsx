/**
 * Tests for SwapShiftModal
 * Verifies 2-step flow (select colleague → confirm) and callbacks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SwapShiftModal from './SwapShiftModal'

// Mock supabase
const mockColleagues = [
    { id: 'col-1', full_name: 'Anna Bauer', display_name: 'Anna', email: 'anna@test.com' },
    { id: 'col-2', full_name: 'Lisa Meier', display_name: null, email: 'lisa@test.com' },
]

vi.mock('../supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                neq: vi.fn(() => ({
                    neq: vi.fn(() => ({
                        order: vi.fn(() => Promise.resolve({ data: mockColleagues }))
                    }))
                }))
            }))
        }))
    }
}))

const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    shift: { id: 'shift-1', type: 'TD1', start_time: '2025-01-10T07:30:00Z' },
    onSwap: vi.fn(),
    currentUser: { id: 'user-123' },
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe('SwapShiftModal', () => {
    it('renders nothing when isOpen is false', () => {
        const { container } = render(<SwapShiftModal {...defaultProps} isOpen={false} />)
        expect(container.innerHTML).toBe('')
    })

    it('renders nothing when shift is null', () => {
        const { container } = render(<SwapShiftModal {...defaultProps} shift={null} />)
        expect(container.innerHTML).toBe('')
    })

    it('renders step 1 with colleague selection', async () => {
        render(<SwapShiftModal {...defaultProps} />)
        await waitFor(() => {
            expect(screen.getByText('Dienst tauschen')).toBeInTheDocument()
        })
        expect(screen.getByText(/Kollege auswählen/)).toBeInTheDocument()
    })

    it('loads colleague list from supabase', async () => {
        render(<SwapShiftModal {...defaultProps} />)
        await waitFor(() => {
            expect(screen.getByText('Anna')).toBeInTheDocument()
        })
    })

    it('disables "Weiter" button when no colleague is selected', async () => {
        render(<SwapShiftModal {...defaultProps} />)
        await waitFor(() => {
            expect(screen.getByText('Dienst tauschen')).toBeInTheDocument()
        })
        const weiterBtn = screen.getByText(/Weiter/)
        expect(weiterBtn.closest('button')).toBeDisabled()
    })

    it('navigates to confirmation step after selecting colleague', async () => {
        render(<SwapShiftModal {...defaultProps} />)
        await waitFor(() => {
            expect(screen.getByText('Anna')).toBeInTheDocument()
        })

        // Select a colleague
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'col-1' } })
        fireEvent.click(screen.getByText(/Weiter/))

        expect(screen.getByText(/Bestätigung erforderlich/)).toBeInTheDocument()
        expect(screen.getByText(/Anna/)).toBeInTheDocument()
    })

    it('calls onSwap and onClose on confirm', async () => {
        render(<SwapShiftModal {...defaultProps} />)
        await waitFor(() => {
            expect(screen.getByText('Anna')).toBeInTheDocument()
        })

        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'col-1' } })
        fireEvent.click(screen.getByText(/Weiter/))
        fireEvent.click(screen.getByText(/Tausch bestätigen/))

        expect(defaultProps.onSwap).toHaveBeenCalledWith('shift-1', 'col-1')
        expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('navigates back from confirmation to selection', async () => {
        render(<SwapShiftModal {...defaultProps} />)
        await waitFor(() => {
            expect(screen.getByText('Anna')).toBeInTheDocument()
        })

        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'col-1' } })
        fireEvent.click(screen.getByText(/Weiter/))
        expect(screen.getByText(/Bestätigung/)).toBeInTheDocument()

        fireEvent.click(screen.getByText('Zurück'))
        expect(screen.getByText(/Kollege auswählen/)).toBeInTheDocument()
    })

    it('calls onClose when cancel button is clicked', async () => {
        render(<SwapShiftModal {...defaultProps} />)
        await waitFor(() => {
            expect(screen.getByText('Dienst tauschen')).toBeInTheDocument()
        })
        fireEvent.click(screen.getByText('Abbrechen'))
        expect(defaultProps.onClose).toHaveBeenCalled()
    })
})
