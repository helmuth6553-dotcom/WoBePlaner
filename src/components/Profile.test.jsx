/**
 * Tests for Profile container component
 * Verifies tab navigation, role-based section visibility, and profile loading.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createContext, useContext } from 'react'

// Use vi.hoisted so MockAuthContext is available when vi.mock factories run
const { MockAuthContext, mockUseContext } = vi.hoisted(() => {
    // eslint-disable-next-line no-undef
    const React = require('react')
    return { MockAuthContext: React.createContext(), mockUseContext: React.useContext }
})

// Mock supabase
const mockSingle = vi.fn()
const mockEq = vi.fn(() => ({ single: mockSingle }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
vi.mock('../supabase', () => ({
    supabase: {
        from: vi.fn(() => ({ select: mockSelect })),
    }
}))

// Mock AuthContext to use our mock context
vi.mock('../AuthContext', () => ({
    AuthContext: MockAuthContext,
    useAuth: () => mockUseContext(MockAuthContext)
}))

// Mock sub-components
vi.mock('./ProfileSettings', () => ({
    default: () => <div data-testid="profile-settings">ProfileSettings</div>
}))
vi.mock('./ProfileStats', () => ({
    default: () => <div data-testid="profile-stats">ProfileStats</div>
}))
vi.mock('./SoliPunktePanel', () => ({
    default: () => <div data-testid="soli-punkte">SoliPunktePanel</div>
}))
vi.mock('./ProfileVacation', () => ({
    default: () => <div data-testid="profile-vacation">ProfileVacation</div>
}))
vi.mock('./ProfileSickLeave', () => ({
    default: () => <div data-testid="profile-sick">ProfileSickLeave</div>
}))

import Profile from './Profile'

const mockProfile = {
    id: 'user-123',
    full_name: 'Max Mustermann',
    display_name: 'Max',
    role: 'user',
    weekly_hours: 40,
}

function renderProfile(authOverrides = {}) {
    const authValue = {
        user: { id: 'user-123', email: 'test@test.com' },
        role: 'user',
        isAdmin: false,
        passwordSet: true,
        loading: false,
        session: { access_token: 'mock' },
        ...authOverrides,
    }
    return render(
        <MockAuthContext.Provider value={authValue}>
            <Profile />
        </MockAuthContext.Provider>
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    mockSingle.mockResolvedValue({ data: mockProfile, error: null })
})

describe('Profile', () => {
    it('shows loading skeleton when profile not yet loaded', () => {
        mockSingle.mockReturnValue(new Promise(() => {}))
        renderProfile()
        expect(document.querySelector('.animate-pulse')).toBeInTheDocument()
    })

    it('shows "Mein Profil" title after profile loads', async () => {
        renderProfile()
        await waitFor(() => {
            expect(screen.getByText('Mein Profil')).toBeInTheDocument()
        })
    })

    it('shows settings section by default', async () => {
        renderProfile()
        await waitFor(() => {
            expect(screen.getByTestId('profile-settings')).toBeInTheDocument()
        })
    })

    it('shows 4 section tabs for employee (Soli hidden in beta)', async () => {
        renderProfile()
        await waitFor(() => {
            expect(screen.getByText('Mein Profil')).toBeInTheDocument()
        })
        const buttons = screen.getAllByRole('button')
        expect(buttons.length).toBe(4)
    })

    it('admin sees only Profil tab', async () => {
        renderProfile({ isAdmin: true, role: 'admin' })
        await waitFor(() => {
            expect(screen.getByText('Mein Profil')).toBeInTheDocument()
        })
        const buttons = screen.getAllByRole('button')
        expect(buttons.length).toBe(1)
    })

    it('switches to stats tab on click', async () => {
        renderProfile()
        await waitFor(() => {
            expect(screen.getByText('Mein Profil')).toBeInTheDocument()
        })
        const buttons = screen.getAllByRole('button')
        const statsBtn = buttons.find(b => b.textContent.includes('Statistik'))
        expect(statsBtn).toBeTruthy()
        fireEvent.click(statsBtn)
        expect(screen.getByTestId('profile-stats')).toBeInTheDocument()
        expect(screen.queryByTestId('profile-settings')).not.toBeInTheDocument()
    })

    it('fetches profile from supabase on mount', async () => {
        renderProfile()
        await waitFor(() => {
            expect(mockSelect).toHaveBeenCalledWith('*')
        })
    })
})
