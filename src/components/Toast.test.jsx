/**
 * Tests for Toast notification system
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ToastProvider, useToast, showErrorToast } from './Toast'

// Helper component to trigger toasts
function ToastTrigger() {
    const toast = useToast()
    return (
        <div>
            <button onClick={() => toast.showError('Error Title', 'Error message')}>Error</button>
            <button onClick={() => toast.showSuccess('Success Title', 'Done!')}>Success</button>
            <button onClick={() => toast.showWarning('Warning Title', 'Be careful')}>Warning</button>
            <button onClick={() => toast.showInfo('Info Title', 'FYI')}>Info</button>
            <button onClick={() => toast.clearAll()}>Clear</button>
        </div>
    )
}

describe('ToastProvider', () => {
    it('renders children', () => {
        render(
            <ToastProvider>
                <div>App content</div>
            </ToastProvider>
        )
        expect(screen.getByText('App content')).toBeTruthy()
    })

    it('shows error toast', () => {
        render(
            <ToastProvider>
                <ToastTrigger />
            </ToastProvider>
        )

        fireEvent.click(screen.getByText('Error'))
        expect(screen.getByText('Error Title')).toBeTruthy()
        expect(screen.getByText('Error message')).toBeTruthy()
    })

    it('shows success toast', () => {
        render(
            <ToastProvider>
                <ToastTrigger />
            </ToastProvider>
        )

        fireEvent.click(screen.getByText('Success'))
        expect(screen.getByText('Success Title')).toBeTruthy()
    })

    it('shows warning toast', () => {
        render(
            <ToastProvider>
                <ToastTrigger />
            </ToastProvider>
        )

        fireEvent.click(screen.getByText('Warning'))
        expect(screen.getByText('Warning Title')).toBeTruthy()
    })

    it('shows info toast', () => {
        render(
            <ToastProvider>
                <ToastTrigger />
            </ToastProvider>
        )

        fireEvent.click(screen.getByText('Info'))
        expect(screen.getByText('Info Title')).toBeTruthy()
    })

    it('dismisses toast on X click', () => {
        render(
            <ToastProvider>
                <ToastTrigger />
            </ToastProvider>
        )

        fireEvent.click(screen.getByText('Error'))
        expect(screen.getByText('Error Title')).toBeTruthy()

        // Click the dismiss button
        fireEvent.click(screen.getByLabelText('Schließen'))
        expect(screen.queryByText('Error Title')).toBeNull()
    })

    it('clears all toasts', () => {
        render(
            <ToastProvider>
                <ToastTrigger />
            </ToastProvider>
        )

        fireEvent.click(screen.getByText('Error'))
        fireEvent.click(screen.getByText('Success'))
        expect(screen.getByText('Error Title')).toBeTruthy()
        expect(screen.getByText('Success Title')).toBeTruthy()

        fireEvent.click(screen.getByText('Clear'))
        expect(screen.queryByText('Error Title')).toBeNull()
        expect(screen.queryByText('Success Title')).toBeNull()
    })

    it('toast has role=alert for accessibility', () => {
        render(
            <ToastProvider>
                <ToastTrigger />
            </ToastProvider>
        )

        fireEvent.click(screen.getByText('Error'))
        expect(screen.getByRole('alert')).toBeTruthy()
    })
})

describe('useToast outside provider', () => {
    it('throws when used outside ToastProvider', () => {
        function NakedConsumer() {
            useToast()
            return null
        }

        expect(() => render(<NakedConsumer />)).toThrow(
            'useToast must be used within a ToastProvider'
        )
    })
})

describe('showErrorToast', () => {
    it('calls toast.showError with friendlyError fields', () => {
        const mockToast = { showError: vi.fn() }
        const friendlyError = { title: 'Fehler', message: 'Etwas ging schief' }

        showErrorToast(mockToast, friendlyError)
        expect(mockToast.showError).toHaveBeenCalledWith('Fehler', 'Etwas ging schief')
    })

    it('does nothing when toast is null', () => {
        showErrorToast(null, { title: 'T', message: 'M' })
        // Should not throw
    })

    it('does nothing when friendlyError is null', () => {
        const mockToast = { showError: vi.fn() }
        showErrorToast(mockToast, null)
        expect(mockToast.showError).not.toHaveBeenCalled()
    })
})
