/**
 * Tests for SickReportModal
 * Verifies date selection, validation, and submit/cancel callbacks.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SickReportModal from './SickReportModal'

describe('SickReportModal', () => {
    it('renders nothing when isOpen is false', () => {
        const { container } = render(
            <SickReportModal isOpen={false} onClose={vi.fn()} onSubmit={vi.fn()} />
        )
        expect(container.innerHTML).toBe('')
    })

    it('renders modal when isOpen is true', () => {
        render(<SickReportModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} />)
        expect(screen.getByText('Krankmeldung')).toBeInTheDocument()
    })

    it('shows date inputs for start and end', () => {
        render(<SickReportModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} />)
        expect(screen.getByText('Von')).toBeInTheDocument()
        expect(screen.getByText(/Bis/)).toBeInTheDocument()
    })

    it('disables submit button when dates are empty', () => {
        render(<SickReportModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} />)
        expect(screen.getByText('Melden')).toBeDisabled()
    })

    it('enables submit button when both dates are filled', () => {
        render(<SickReportModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} />)
        const inputs = screen.getAllByDisplayValue('')
        fireEvent.change(inputs[0], { target: { value: '2025-01-15' } })
        fireEvent.change(inputs[1], { target: { value: '2025-01-17' } })
        expect(screen.getByText('Melden')).not.toBeDisabled()
    })

    it('calls onSubmit with start and end dates', () => {
        const onSubmit = vi.fn()
        render(<SickReportModal isOpen={true} onClose={vi.fn()} onSubmit={onSubmit} />)
        const inputs = screen.getAllByDisplayValue('')
        fireEvent.change(inputs[0], { target: { value: '2025-01-15' } })
        fireEvent.change(inputs[1], { target: { value: '2025-01-17' } })
        fireEvent.click(screen.getByText('Melden'))
        expect(onSubmit).toHaveBeenCalledWith('2025-01-15', '2025-01-17')
    })

    it('calls onClose when cancel button is clicked', () => {
        const onClose = vi.fn()
        render(<SickReportModal isOpen={true} onClose={onClose} onSubmit={vi.fn()} />)
        fireEvent.click(screen.getByText('Abbrechen'))
        expect(onClose).toHaveBeenCalled()
    })

    it('shows description text about automatic shift release', () => {
        render(<SickReportModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} />)
        expect(screen.getByText(/automatisch freigegeben/)).toBeInTheDocument()
    })
})
