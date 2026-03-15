/**
 * Tests for ErrorBoundary component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

vi.mock('../lib/sentry.js', () => ({
    captureError: vi.fn(),
    addBreadcrumb: vi.fn(),
}))

// Component that throws
function ThrowingChild({ shouldThrow = true }) {
    if (shouldThrow) throw new Error('Test error')
    return <div>Normal content</div>
}

beforeEach(() => {
    vi.clearAllMocks()
    // Suppress React error boundary console output
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('ErrorBoundary', () => {
    it('renders children when no error', () => {
        render(
            <ErrorBoundary>
                <div>Hello</div>
            </ErrorBoundary>
        )
        expect(screen.getByText('Hello')).toBeTruthy()
    })

    it('shows error UI when child throws', () => {
        render(
            <ErrorBoundary>
                <ThrowingChild />
            </ErrorBoundary>
        )
        expect(screen.getByText('Ein Fehler ist aufgetreten')).toBeTruthy()
    })

    it('displays the error message', () => {
        render(
            <ErrorBoundary>
                <ThrowingChild />
            </ErrorBoundary>
        )
        expect(screen.getByText(/Test error/)).toBeTruthy()
    })

    it('shows automatic report notice', () => {
        render(
            <ErrorBoundary>
                <ThrowingChild />
            </ErrorBoundary>
        )
        expect(screen.getByText(/automatisch gemeldet/)).toBeTruthy()
    })

    it('shows reload button', () => {
        render(
            <ErrorBoundary>
                <ThrowingChild />
            </ErrorBoundary>
        )
        expect(screen.getByText('Neu laden')).toBeTruthy()
    })

    it('calls Sentry captureError on error', async () => {
        const { captureError } = await import('../lib/sentry.js')

        render(
            <ErrorBoundary>
                <ThrowingChild />
            </ErrorBoundary>
        )

        expect(captureError).toHaveBeenCalledWith(
            expect.any(Error),
            expect.objectContaining({
                tags: expect.objectContaining({ source: 'error-boundary' }),
                level: 'fatal',
            })
        )
    })

    it('calls addBreadcrumb on error', async () => {
        const { addBreadcrumb } = await import('../lib/sentry.js')

        render(
            <ErrorBoundary>
                <ThrowingChild />
            </ErrorBoundary>
        )

        expect(addBreadcrumb).toHaveBeenCalledWith(
            'error-boundary',
            'React Error Boundary caught an error',
            expect.any(Object)
        )
    })

    it('reload button triggers window.location.reload', () => {
        const reloadMock = vi.fn()
        Object.defineProperty(window, 'location', {
            value: { reload: reloadMock },
            writable: true,
        })

        render(
            <ErrorBoundary>
                <ThrowingChild />
            </ErrorBoundary>
        )

        fireEvent.click(screen.getByText('Neu laden'))
        expect(reloadMock).toHaveBeenCalled()
    })
})
