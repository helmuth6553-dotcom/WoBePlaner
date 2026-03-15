/**
 * Tests for Sidebar desktop navigation
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Sidebar from './Sidebar'

describe('Sidebar', () => {
    const defaultProps = {
        activeTab: 'roster',
        onTabChange: vi.fn(),
        isAdmin: false,
        badges: {},
    }

    it('renders all standard navigation items', () => {
        render(<Sidebar {...defaultProps} />)
        expect(screen.getByText('Dienstplan')).toBeTruthy()
        expect(screen.getByText('Zeiten')).toBeTruthy()
        expect(screen.getByText('Urlaub')).toBeTruthy()
        expect(screen.getByText('Profil')).toBeTruthy()
    })

    it('does not show Admin for non-admin', () => {
        render(<Sidebar {...defaultProps} isAdmin={false} />)
        expect(screen.queryByText('Admin')).toBeNull()
    })

    it('shows Admin for admin users', () => {
        render(<Sidebar {...defaultProps} isAdmin={true} />)
        expect(screen.getByText('Admin')).toBeTruthy()
    })

    it('calls onTabChange with correct tab id', () => {
        const onTabChange = vi.fn()
        render(<Sidebar {...defaultProps} onTabChange={onTabChange} />)

        fireEvent.click(screen.getByText('Zeiten'))
        expect(onTabChange).toHaveBeenCalledWith('times')
    })

    it('renders logo', () => {
        render(<Sidebar {...defaultProps} />)
        const logo = screen.getByAltText('Logo')
        expect(logo).toBeTruthy()
        expect(logo.getAttribute('src')).toBe('/logo2.png')
    })

    it('shows version info', () => {
        render(<Sidebar {...defaultProps} />)
        expect(screen.getByText(/Desktop/)).toBeTruthy()
    })

    it('displays badge count', () => {
        render(<Sidebar {...defaultProps} badges={{ times: { count: 3 } }} />)
        expect(screen.getByText('3')).toBeTruthy()
    })

    it('displays 99+ for large counts', () => {
        render(<Sidebar {...defaultProps} badges={{ roster: { count: 200 } }} />)
        expect(screen.getByText('99+')).toBeTruthy()
    })
})
