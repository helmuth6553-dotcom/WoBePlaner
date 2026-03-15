/**
 * Tests for BottomNav mobile navigation
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BottomNav from './BottomNav'

describe('BottomNav', () => {
    const defaultProps = {
        activeTab: 'roster',
        onTabChange: vi.fn(),
        isAdmin: false,
        badges: {},
    }

    it('renders all standard navigation items', () => {
        render(<BottomNav {...defaultProps} />)
        expect(screen.getByText('Dienstplan')).toBeTruthy()
        expect(screen.getByText('Zeiten')).toBeTruthy()
        expect(screen.getByText('Urlaub')).toBeTruthy()
        expect(screen.getByText('Profil')).toBeTruthy()
    })

    it('does not show Admin tab for non-admin', () => {
        render(<BottomNav {...defaultProps} isAdmin={false} />)
        expect(screen.queryByText('Admin')).toBeNull()
    })

    it('shows Admin tab for admin users', () => {
        render(<BottomNav {...defaultProps} isAdmin={true} />)
        expect(screen.getByText('Admin')).toBeTruthy()
    })

    it('calls onTabChange with correct tab id', () => {
        const onTabChange = vi.fn()
        render(<BottomNav {...defaultProps} onTabChange={onTabChange} />)

        fireEvent.click(screen.getByText('Zeiten'))
        expect(onTabChange).toHaveBeenCalledWith('times')

        fireEvent.click(screen.getByText('Urlaub'))
        expect(onTabChange).toHaveBeenCalledWith('absences')

        fireEvent.click(screen.getByText('Profil'))
        expect(onTabChange).toHaveBeenCalledWith('profile')
    })

    it('highlights active tab', () => {
        const { container } = render(<BottomNav {...defaultProps} activeTab="times" />)
        const buttons = container.querySelectorAll('button')
        const timesButton = Array.from(buttons).find(b => b.textContent.includes('Zeiten'))
        expect(timesButton.className).toContain('text-black')
    })

    it('displays badge count', () => {
        render(<BottomNav {...defaultProps} badges={{ admin: { count: 5 } }} isAdmin={true} />)
        expect(screen.getByText('5')).toBeTruthy()
    })

    it('displays 99+ for large badge counts', () => {
        render(<BottomNav {...defaultProps} badges={{ roster: { count: 150 } }} />)
        expect(screen.getByText('99+')).toBeTruthy()
    })
})
