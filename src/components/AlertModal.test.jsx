import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AlertModal from './AlertModal'

describe('AlertModal', () => {
    it('renders nothing when isOpen is false', () => {
        const { container } = render(
            <AlertModal
                isOpen={false}
                onClose={() => { }}
                title="Test"
                message="Test message"
            />
        )
        expect(container.firstChild).toBeNull()
    })

    it('renders modal when isOpen is true', () => {
        render(
            <AlertModal
                isOpen={true}
                onClose={() => { }}
                title="Test Title"
                message="Test message"
            />
        )
        expect(screen.getByText('Test Title')).toBeInTheDocument()
        expect(screen.getByText('Test message')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument()
    })

    it('calls onClose when OK button is clicked', () => {
        const handleClose = vi.fn()
        render(
            <AlertModal
                isOpen={true}
                onClose={handleClose}
                title="Test"
                message="Test"
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'OK' }))
        expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('renders info style by default', () => {
        render(
            <AlertModal
                isOpen={true}
                onClose={() => { }}
                title="Info"
                message="Info message"
            />
        )
        // Check for blue styling (info type)
        const iconContainer = screen.getByText('Info').parentElement?.querySelector('div')
        expect(iconContainer).toHaveClass('bg-blue-100')
    })

    it('renders error style when type is error', () => {
        render(
            <AlertModal
                isOpen={true}
                onClose={() => { }}
                title="Error"
                message="Error message"
                type="error"
            />
        )
        const iconContainer = screen.getByText('Error').parentElement?.querySelector('div')
        expect(iconContainer).toHaveClass('bg-red-100')
    })

    it('renders success style when type is success', () => {
        render(
            <AlertModal
                isOpen={true}
                onClose={() => { }}
                title="Success"
                message="Success message"
                type="success"
            />
        )
        const iconContainer = screen.getByText('Success').parentElement?.querySelector('div')
        expect(iconContainer).toHaveClass('bg-green-100')
    })
})
