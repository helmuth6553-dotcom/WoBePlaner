import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConfirmModal from './ConfirmModal'

describe('ConfirmModal', () => {
    it('renders nothing when isOpen is false', () => {
        const { container } = render(
            <ConfirmModal
                isOpen={false}
                onClose={() => { }}
                onConfirm={() => { }}
                title="Test"
                message="Test message"
            />
        )
        expect(container.firstChild).toBeNull()
    })

    it('renders modal with title and message when isOpen is true', () => {
        render(
            <ConfirmModal
                isOpen={true}
                onClose={() => { }}
                onConfirm={() => { }}
                title="Confirm Action"
                message="Are you sure?"
            />
        )
        expect(screen.getByText('Confirm Action')).toBeInTheDocument()
        expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    })

    it('renders default button texts', () => {
        render(
            <ConfirmModal
                isOpen={true}
                onClose={() => { }}
                onConfirm={() => { }}
                title="Test"
                message="Test"
            />
        )
        expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Bestätigen' })).toBeInTheDocument()
    })

    it('renders custom button texts', () => {
        render(
            <ConfirmModal
                isOpen={true}
                onClose={() => { }}
                onConfirm={() => { }}
                title="Test"
                message="Test"
                confirmText="Löschen"
                cancelText="Nein"
            />
        )
        expect(screen.getByRole('button', { name: 'Nein' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Löschen' })).toBeInTheDocument()
    })

    it('calls onClose when cancel button is clicked', () => {
        const handleClose = vi.fn()
        render(
            <ConfirmModal
                isOpen={true}
                onClose={handleClose}
                onConfirm={() => { }}
                title="Test"
                message="Test"
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
        expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('calls both onConfirm and onClose when confirm button is clicked', () => {
        const handleClose = vi.fn()
        const handleConfirm = vi.fn()

        render(
            <ConfirmModal
                isOpen={true}
                onClose={handleClose}
                onConfirm={handleConfirm}
                title="Test"
                message="Test"
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
        expect(handleConfirm).toHaveBeenCalledTimes(1)
        expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('marks confirm button as destructive when isDestructive is true', () => {
        render(
            <ConfirmModal
                isOpen={true}
                onClose={() => { }}
                onConfirm={() => { }}
                title="Delete"
                message="This action cannot be undone"
                isDestructive={true}
            />
        )

        const confirmButton = screen.getByRole('button', { name: 'Bestätigen' })
        expect(confirmButton).toHaveAttribute('data-destructive', 'true')
    })

    it('does not mark confirm button as destructive by default', () => {
        render(
            <ConfirmModal
                isOpen={true}
                onClose={() => { }}
                onConfirm={() => { }}
                title="Confirm"
                message="Proceed?"
                isDestructive={false}
            />
        )

        const confirmButton = screen.getByRole('button', { name: 'Bestätigen' })
        expect(confirmButton).not.toHaveAttribute('data-destructive')
    })
})
