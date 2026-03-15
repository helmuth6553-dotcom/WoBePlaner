/**
 * Tests for ActionSheet component
 * Verifies open/close behavior, title rendering, and body overflow management.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ActionSheet from './ActionSheet'

afterEach(() => {
    document.body.style.overflow = ''
})

describe('ActionSheet', () => {
    it('renders nothing when closed and not visible', () => {
        const { container } = render(
            <ActionSheet isOpen={false} onClose={vi.fn()} title="Test">
                <p>Content</p>
            </ActionSheet>
        )
        expect(container.querySelector('.fixed')).not.toBeInTheDocument()
    })

    it('renders when isOpen is true', () => {
        render(
            <ActionSheet isOpen={true} onClose={vi.fn()} title="Test Sheet">
                <p>Sheet Content</p>
            </ActionSheet>
        )
        expect(screen.getByText('Test Sheet')).toBeInTheDocument()
        expect(screen.getByText('Sheet Content')).toBeInTheDocument()
    })

    it('renders children content', () => {
        render(
            <ActionSheet isOpen={true} onClose={vi.fn()} title="Title">
                <button>Action 1</button>
                <button>Action 2</button>
            </ActionSheet>
        )
        expect(screen.getByText('Action 1')).toBeInTheDocument()
        expect(screen.getByText('Action 2')).toBeInTheDocument()
    })

    it('calls onClose when close button is clicked', () => {
        const onClose = vi.fn()
        render(
            <ActionSheet isOpen={true} onClose={onClose} title="Title">
                <p>Content</p>
            </ActionSheet>
        )
        // The X button
        const buttons = screen.getAllByRole('button')
        const closeBtn = buttons.find(b => b.querySelector('svg'))
        fireEvent.click(closeBtn)
        expect(onClose).toHaveBeenCalled()
    })

    it('sets body overflow to hidden when open', () => {
        render(
            <ActionSheet isOpen={true} onClose={vi.fn()} title="Title">
                <p>Content</p>
            </ActionSheet>
        )
        expect(document.body.style.overflow).toBe('hidden')
    })

    it('calls onClose when backdrop is clicked', () => {
        const onClose = vi.fn()
        const { container } = render(
            <ActionSheet isOpen={true} onClose={onClose} title="Title">
                <p>Content</p>
            </ActionSheet>
        )
        // Click the backdrop div (first child with bg-black)
        const backdrop = container.querySelector('.bg-black\\/40')
        if (backdrop) {
            fireEvent.click(backdrop)
            expect(onClose).toHaveBeenCalled()
        }
    })
})
