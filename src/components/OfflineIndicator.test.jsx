/**
 * Tests for OfflineIndicator and useOnlineStatus
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import OfflineIndicator, { useOnlineStatus } from './OfflineIndicator'

describe('OfflineIndicator', () => {
    beforeEach(() => {
        // Default: online
        Object.defineProperty(navigator, 'onLine', { value: true, writable: true })
    })

    it('renders nothing when online', () => {
        const { container } = render(<OfflineIndicator />)
        expect(container.firstChild).toBeNull()
    })

    it('shows offline message when offline', () => {
        Object.defineProperty(navigator, 'onLine', { value: false, writable: true })
        render(<OfflineIndicator />)
        expect(screen.getByText(/Du bist offline/)).toBeTruthy()
    })

    it('has role=alert for accessibility', () => {
        Object.defineProperty(navigator, 'onLine', { value: false, writable: true })
        render(<OfflineIndicator />)
        expect(screen.getByRole('alert')).toBeTruthy()
    })

    it('shows offline text with warning about unsaved changes', () => {
        Object.defineProperty(navigator, 'onLine', { value: false, writable: true })
        render(<OfflineIndicator />)
        expect(screen.getByText(/Änderungen werden nicht gespeichert/)).toBeTruthy()
    })
})

describe('useOnlineStatus', () => {
    beforeEach(() => {
        Object.defineProperty(navigator, 'onLine', { value: true, writable: true })
    })

    it('returns true when online', () => {
        const { result } = renderHook(() => useOnlineStatus())
        expect(result.current).toBe(true)
    })

    it('returns false when offline', () => {
        Object.defineProperty(navigator, 'onLine', { value: false, writable: true })
        const { result } = renderHook(() => useOnlineStatus())
        expect(result.current).toBe(false)
    })

    it('updates when going offline', () => {
        const { result } = renderHook(() => useOnlineStatus())
        expect(result.current).toBe(true)

        act(() => {
            Object.defineProperty(navigator, 'onLine', { value: false, writable: true })
            window.dispatchEvent(new Event('offline'))
        })

        expect(result.current).toBe(false)
    })

    it('updates when going online', () => {
        Object.defineProperty(navigator, 'onLine', { value: false, writable: true })
        const { result } = renderHook(() => useOnlineStatus())
        expect(result.current).toBe(false)

        act(() => {
            Object.defineProperty(navigator, 'onLine', { value: true, writable: true })
            window.dispatchEvent(new Event('online'))
        })

        expect(result.current).toBe(true)
    })
})
