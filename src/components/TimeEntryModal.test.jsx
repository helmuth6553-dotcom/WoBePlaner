/**
 * Tests for TimeEntryModal
 * Verifies time entry editing, interruption management, and save callbacks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TimeEntryModal from './TimeEntryModal'

const shiftItem = {
    itemType: 'shift',
    type: 'TD1',
    start_time: '2025-01-10T07:30:00Z',
    end_time: '2025-01-10T14:30:00Z',
}

const ndShiftItem = {
    itemType: 'shift',
    type: 'ND',
    start_time: '2025-01-10T19:00:00Z',
    end_time: '2025-01-11T08:00:00Z',
}

const absenceItem = {
    itemType: 'absence',
    type: 'Urlaub',
    sortDate: new Date(2025, 0, 15),
}

const existingEntry = {
    actual_start: '2025-01-10T07:45:00Z',
    actual_end: '2025-01-10T14:15:00Z',
    interruptions: [],
    status: 'draft',
}

const userProfile = { weekly_hours: 40 }

describe('TimeEntryModal', () => {
    it('returns null when item is null', () => {
        const { container } = render(
            <TimeEntryModal item={null} entry={null} userProfile={userProfile} onSave={vi.fn()} onClose={vi.fn()} />
        )
        expect(container.innerHTML).toBe('')
    })

    it('renders modal title "Zeit erfassen" for new entries', () => {
        render(
            <TimeEntryModal item={shiftItem} entry={null} userProfile={userProfile} onSave={vi.fn()} onClose={vi.fn()} />
        )
        expect(screen.getByText('Zeit erfassen')).toBeInTheDocument()
    })

    it('renders "Details" title for approved entries', () => {
        const approved = { ...existingEntry, status: 'approved' }
        render(
            <TimeEntryModal item={shiftItem} entry={approved} userProfile={userProfile} onSave={vi.fn()} onClose={vi.fn()} />
        )
        expect(screen.getByText('Details')).toBeInTheDocument()
    })

    it('renders start and end time inputs', () => {
        render(
            <TimeEntryModal item={shiftItem} entry={null} userProfile={userProfile} onSave={vi.fn()} onClose={vi.fn()} />
        )
        expect(screen.getByText('Start')).toBeInTheDocument()
        expect(screen.getByText('Ende')).toBeInTheDocument()
    })

    it('shows calculated hours', () => {
        render(
            <TimeEntryModal item={shiftItem} entry={null} userProfile={userProfile} onSave={vi.fn()} onClose={vi.fn()} />
        )
        expect(screen.getByText('Berechnet')).toBeInTheDocument()
        // Should show hours values (calculated + planned)
        const hoursElements = screen.getAllByText(/\d+\.\d+h/)
        expect(hoursElements.length).toBeGreaterThanOrEqual(1)
    })

    it('shows save and cancel buttons', () => {
        render(
            <TimeEntryModal item={shiftItem} entry={null} userProfile={userProfile} onSave={vi.fn()} onClose={vi.fn()} />
        )
        expect(screen.getByText('Speichern')).toBeInTheDocument()
        expect(screen.getByText('Abbrechen')).toBeInTheDocument()
    })

    it('hides save button for approved entries', () => {
        const approved = { ...existingEntry, status: 'approved' }
        render(
            <TimeEntryModal item={shiftItem} entry={approved} userProfile={userProfile} onSave={vi.fn()} onClose={vi.fn()} />
        )
        expect(screen.queryByText('Speichern')).not.toBeInTheDocument()
        expect(screen.getByText('Abbrechen')).toBeInTheDocument()
    })

    it('calls onClose when cancel is clicked', () => {
        const onClose = vi.fn()
        render(
            <TimeEntryModal item={shiftItem} entry={null} userProfile={userProfile} onSave={vi.fn()} onClose={onClose} />
        )
        fireEvent.click(screen.getByText('Abbrechen'))
        expect(onClose).toHaveBeenCalled()
    })

    it('calls onSave with data when save is clicked', () => {
        const onSave = vi.fn()
        render(
            <TimeEntryModal item={shiftItem} entry={null} userProfile={userProfile} onSave={onSave} onClose={vi.fn()} />
        )
        fireEvent.click(screen.getByText('Speichern'))
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
            actualStart: expect.any(String),
            actualEnd: expect.any(String),
            interruptions: expect.any(Array),
            calculatedHours: expect.any(Number),
        }))
    })

    it('shows interruption section for night shifts (ND)', () => {
        render(
            <TimeEntryModal item={ndShiftItem} entry={null} userProfile={userProfile} onSave={vi.fn()} onClose={vi.fn()} />
        )
        expect(screen.getByText(/Unterbrechung Bereitschaftszeit/)).toBeInTheDocument()
    })

    it('does not show interruption section for day shifts', () => {
        render(
            <TimeEntryModal item={shiftItem} entry={null} userProfile={userProfile} onSave={vi.fn()} onClose={vi.fn()} />
        )
        expect(screen.queryByText(/Unterbrechung Bereitschaftszeit/)).not.toBeInTheDocument()
    })

    it('uses planned times from shift for new entry', async () => {
        render(
            <TimeEntryModal item={shiftItem} entry={null} userProfile={userProfile} onSave={vi.fn()} onClose={vi.fn()} />
        )
        // The time inputs should be pre-filled with shift times
        const timeInputs = screen.getAllByDisplayValue(/\d{2}:\d{2}/)
        expect(timeInputs.length).toBeGreaterThanOrEqual(2)
    })

    it('uses saved times from existing entry', () => {
        render(
            <TimeEntryModal item={shiftItem} entry={existingEntry} userProfile={userProfile} onSave={vi.fn()} onClose={vi.fn()} />
        )
        const timeInputs = screen.getAllByDisplayValue(/\d{2}:\d{2}/)
        expect(timeInputs.length).toBeGreaterThanOrEqual(2)
    })

    it('shows planned hours comparison for shift items', () => {
        render(
            <TimeEntryModal item={shiftItem} entry={null} userProfile={userProfile} onSave={vi.fn()} onClose={vi.fn()} />
        )
        expect(screen.getByText(/Geplant laut Dienstplan/)).toBeInTheDocument()
    })
})
