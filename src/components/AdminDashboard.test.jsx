/**
 * Tests for AdminDashboard component
 * Verifies tab navigation and rendering of sub-panels.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AdminDashboard from './AdminDashboard'

// Mock auth + badge hook so the component renders without a real AuthProvider
vi.mock('../AuthContext', () => ({
    useAuth: () => ({ user: { id: 'test-admin' }, isAdmin: true })
}))
vi.mock('../utils/useAdminBadgeCounts', () => ({
    useAdminBadgeCounts: () => ({ antraege: 0, krank: 0, total: 0, markKrankSeen: vi.fn() })
}))

// Mock all admin sub-panels to isolate tab navigation logic
vi.mock('./admin/AdminOverview', () => ({
    default: () => <div data-testid="admin-overview">AdminOverview</div>
}))
vi.mock('./admin/AdminAuditLog', () => ({
    default: () => <div data-testid="admin-audit">AdminAuditLog</div>
}))
vi.mock('./admin/AdminSickLeaves', () => ({
    default: () => <div data-testid="admin-sick">AdminSickLeaves</div>
}))
vi.mock('./admin/AdminEmployees', () => ({
    default: () => <div data-testid="admin-employees">AdminEmployees</div>
}))
vi.mock('./admin/AdminAbsences', () => ({
    default: (props) => <div data-testid="admin-absences">AdminAbsences {props.onNavigateToCalendar ? 'with-nav' : 'no-nav'}</div>
}))
vi.mock('./admin/AdminVacationStats', () => ({
    default: () => <div data-testid="admin-vacation">AdminVacationStats</div>
}))
vi.mock('./admin/AdminRosterPlanner', () => ({
    default: () => <div data-testid="admin-planner">AdminRosterPlanner</div>
}))

describe('AdminDashboard', () => {
    it('renders dashboard title', () => {
        render(<AdminDashboard />)
        expect(screen.getByText('Admin Dashboard')).toBeInTheDocument()
    })

    it('shows overview panel by default', () => {
        render(<AdminDashboard />)
        expect(screen.getByTestId('admin-overview')).toBeInTheDocument()
    })

    it('renders all 7 tab buttons', () => {
        render(<AdminDashboard />)
        expect(screen.getByText('Dienstplan')).toBeInTheDocument()
        expect(screen.getByText('Audit')).toBeInTheDocument()
        expect(screen.getByText('Mitarbeiter')).toBeInTheDocument()
        expect(screen.getByText('Anträge')).toBeInTheDocument()
        expect(screen.getByText('Krank')).toBeInTheDocument()
        expect(screen.getByText('Urlaub')).toBeInTheDocument()
        expect(screen.getByText('Übersicht')).toBeInTheDocument()
    })

    it('switches to audit tab', () => {
        render(<AdminDashboard />)
        fireEvent.click(screen.getByText('Audit'))
        expect(screen.getByTestId('admin-audit')).toBeInTheDocument()
        expect(screen.queryByTestId('admin-overview')).not.toBeInTheDocument()
    })

    it('switches to employees tab', () => {
        render(<AdminDashboard />)
        fireEvent.click(screen.getByText('Mitarbeiter'))
        expect(screen.getByTestId('admin-employees')).toBeInTheDocument()
    })

    it('switches to absences tab', () => {
        render(<AdminDashboard />)
        fireEvent.click(screen.getByText('Anträge'))
        expect(screen.getByTestId('admin-absences')).toBeInTheDocument()
    })

    it('switches to sick leaves tab', () => {
        render(<AdminDashboard />)
        fireEvent.click(screen.getByText('Krank'))
        expect(screen.getByTestId('admin-sick')).toBeInTheDocument()
    })

    it('switches to vacation stats tab', () => {
        render(<AdminDashboard />)
        fireEvent.click(screen.getByText('Urlaub'))
        expect(screen.getByTestId('admin-vacation')).toBeInTheDocument()
    })

it('passes onNavigateToCalendar prop to AdminAbsences', () => {
        const onNav = vi.fn()
        render(<AdminDashboard onNavigateToCalendar={onNav} />)
        fireEvent.click(screen.getByText('Anträge'))
        expect(screen.getByText(/with-nav/)).toBeInTheDocument()
    })

    it('switches back to overview from another tab', () => {
        render(<AdminDashboard />)
        fireEvent.click(screen.getByText('Audit'))
        expect(screen.getByTestId('admin-audit')).toBeInTheDocument()

        fireEvent.click(screen.getByText('Übersicht'))
        expect(screen.getByTestId('admin-overview')).toBeInTheDocument()
        expect(screen.queryByTestId('admin-audit')).not.toBeInTheDocument()
    })

    it('only shows one panel at a time', () => {
        render(<AdminDashboard />)
        // Default is overview
        const panels = ['admin-overview', 'admin-audit', 'admin-employees', 'admin-absences', 'admin-sick', 'admin-vacation', 'admin-planner']
        const visible = panels.filter(id => screen.queryByTestId(id))
        expect(visible).toHaveLength(1)
        expect(visible[0]).toBe('admin-overview')
    })
})
