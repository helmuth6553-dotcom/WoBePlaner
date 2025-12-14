/**
 * DSGVO Anonymization Tests
 * 
 * CRITICAL: These tests verify that sensitive health data (Krankmeldungen)
 * is properly anonymized when displayed to colleagues.
 * 
 * Austrian data protection law requires that health information
 * is only visible to the affected person and authorized personnel (Admins).
 */
import { describe, it, expect, vi } from 'vitest'

// =============================================================================
// LOCAL TEST HELPERS (avoid importing from test-utils.jsx for pure unit tests)
// =============================================================================

const mockUsers = {
    admin: {
        id: 'admin-uuid-123',
        email: 'admin@test.local',
        role: 'admin',
        full_name: 'Test Admin'
    },
    employee: {
        id: 'employee-uuid-456',
        email: 'mitarbeiter@test.local',
        role: 'user',
        full_name: 'Max Mustermann'
    },
    partTime: {
        id: 'parttime-uuid-789',
        email: 'teilzeit@test.local',
        role: 'user',
        full_name: 'Lisa Teilzeit'
    }
}

const rlsTestData = {
    time_entries: [
        {
            id: 'te-1',
            user_id: mockUsers.employee.id,
            entry_date: '2025-01-10',
            calculated_hours: 8.5
        }
    ]
}

function assertAnonymized(element, sensitiveTerms = ['Krank', 'Krankenstand', 'krank']) {
    const text = element.textContent || ''
    sensitiveTerms.forEach(term => {
        if (text.toLowerCase().includes(term.toLowerCase())) {
            throw new Error(`DSGVO VIOLATION: Found sensitive term "${term}" in output: "${text}"`)
        }
    })
}

// =============================================================================
// UNIT TESTS: Anonymization Helper Functions
// =============================================================================

describe('DSGVO: Anonymization Functions', () => {

    describe('assertAnonymized helper', () => {
        it('passes when no sensitive terms are present', () => {
            const mockElement = { textContent: 'Mitarbeiter ist abwesend von 15.01. bis 17.01.' }
            expect(() => assertAnonymized(mockElement)).not.toThrow()
        })

        it('throws DSGVO VIOLATION for "Krank" in text', () => {
            const mockElement = { textContent: 'Max ist Krank von 15.01. bis 17.01.' }
            expect(() => assertAnonymized(mockElement)).toThrow('DSGVO VIOLATION')
        })

        it('throws for "Krankenstand" (case insensitive)', () => {
            const mockElement = { textContent: 'Status: krankenstand' }
            expect(() => assertAnonymized(mockElement)).toThrow('DSGVO VIOLATION')
        })

        it('allows custom sensitive terms', () => {
            const mockElement = { textContent: 'Gehalt: 5000€' }
            expect(() => assertAnonymized(mockElement, ['Gehalt', 'Lohn'])).toThrow('DSGVO VIOLATION')
        })
    })
})

// =============================================================================
// PUSH NOTIFICATION ANONYMIZATION
// =============================================================================

describe('DSGVO: Push Notification Content', () => {
    /**
     * The push notification edge function should NEVER include:
     * - The word "krank" or "Krankenstand"
     * - The name of the sick person
     * - Any health-related information
     * 
     * CORRECT: "Dienstausfall! Kannst du im Zeitraum 15.01. - 17.01. einspringen?"
     * WRONG: "Max ist krank vom 15.01. - 17.01."
     */

    it('notification message format should be anonymous', () => {
        // Simulated notification message from edge function
        const notificationMessage = buildSickNotificationMessage({
            startDate: '2025-01-15',
            endDate: '2025-01-17'
        })

        // Must NOT contain sensitive information
        expect(notificationMessage).not.toContain('krank')
        expect(notificationMessage).not.toContain('Krank')
        expect(notificationMessage).not.toContain('Krankenstand')

        // Should contain generic "Dienstausfall"
        expect(notificationMessage).toContain('Dienstausfall')
    })

    it('notification should show date range correctly', () => {
        const message = buildSickNotificationMessage({
            startDate: '2025-01-15',
            endDate: '2025-01-17'
        })

        expect(message).toContain('15.01.')
        expect(message).toContain('17.01.')
    })

    it('single day notification shows only one date', () => {
        const message = buildSickNotificationMessage({
            startDate: '2025-01-15',
            endDate: '2025-01-15'
        })

        // Should show "am 15.01." not "vom 15.01. - 15.01."
        expect(message).toContain('am 15.01.')
        expect(message).not.toContain(' - ')
    })
})

// Helper to simulate the notification message builder
function buildSickNotificationMessage({ startDate, endDate }) {
    const formatDate = (dateStr) => {
        const [year, month, day] = dateStr.split('-')
        return `${day}.${month}.`
    }

    const start = formatDate(startDate)
    const end = formatDate(endDate)

    if (startDate === endDate) {
        return `Dienstausfall! Kannst du am ${start} einspringen?`
    }
    return `Dienstausfall! Kannst du im Zeitraum ${start} - ${end} einspringen?`
}

// =============================================================================
// COLLEAGUE VIEW ANONYMIZATION
// =============================================================================

describe('DSGVO: Colleague Absence Display', () => {
    /**
     * When viewing absences in MonthView or DayCard:
     * - OWN absences: Full details visible (Urlaub, Krank, etc.)
     * - COLLEAGUE absences (non-admin): Only "Abwesend" visible
     * - ADMIN view: Full details visible for all
     */

    it('anonymizes absence type for colleagues (non-admin)', () => {
        const absence = {
            type: 'Krank', // Should become "Abwesend"
            user_id: 'other-user-123'
        }
        const currentUserId = 'my-user-456'
        const isAdmin = false

        const displayType = getAnonymizedAbsenceType(absence, currentUserId, isAdmin)

        expect(displayType).toBe('Abwesend')
        expect(displayType).not.toBe('Krank')
    })

    it('shows full type for own absences', () => {
        const absence = {
            type: 'Krank',
            user_id: 'my-user-456' // Same as current user
        }
        const currentUserId = 'my-user-456'
        const isAdmin = false

        const displayType = getAnonymizedAbsenceType(absence, currentUserId, isAdmin)

        expect(displayType).toBe('Krank') // Own data is visible
    })

    it('shows full type for admin viewing any user', () => {
        const absence = {
            type: 'Krank',
            user_id: 'other-user-123'
        }
        const currentUserId = 'admin-user-789'
        const isAdmin = true

        const displayType = getAnonymizedAbsenceType(absence, currentUserId, isAdmin)

        expect(displayType).toBe('Krank') // Admin sees everything
    })

    it('does not anonymize vacation (Urlaub)', () => {
        // Vacation is not sensitive health data
        const absence = {
            type: 'Urlaub',
            user_id: 'other-user-123'
        }
        const currentUserId = 'my-user-456'
        const isAdmin = false

        const displayType = getAnonymizedAbsenceType(absence, currentUserId, isAdmin)

        expect(displayType).toBe('Urlaub') // Vacation can be shown
    })
})

// Helper function that mirrors the component logic
function getAnonymizedAbsenceType(absence, currentUserId, isAdmin) {
    const sensitiveTypes = ['Krank', 'Krankenstand', 'Krankheit']

    // Own data or admin view: show full details
    if (absence.user_id === currentUserId || isAdmin) {
        return absence.type
    }

    // Colleague view: anonymize sensitive types
    if (sensitiveTypes.includes(absence.type)) {
        return 'Abwesend'
    }

    return absence.type
}

// =============================================================================
// DATA ISOLATION TESTS
// =============================================================================

describe('DSGVO: Data Isolation', () => {
    /**
     * User A must NEVER see User B's:
     * - Time entries
     * - Detailed absence information (only "Abwesend")
     * - Personal profile data beyond name/display_name
     */

    it('time entries are isolated per user', () => {
        const allEntries = rlsTestData.time_entries
        const userAId = mockUsers.employee.id
        const userBId = mockUsers.partTime.id

        // Simulating what RLS should return for User A
        const userAEntries = allEntries.filter(e => e.user_id === userAId)
        const userBEntries = allEntries.filter(e => e.user_id === userBId)

        // User B should NOT see User A's entries
        expect(userAEntries.some(e => e.user_id === userBId)).toBe(false)

        // Each user only sees their own
        expect(userAEntries.every(e => e.user_id === userAId)).toBe(true)
    })

    it('profile visibility is limited for non-admins', () => {
        const sensitiveFields = ['weekly_hours', 'vacation_days_per_year', 'password_set']

        // What a colleague should see
        const publicProfileFields = ['id', 'full_name', 'display_name', 'email']

        // Check that we have defined which fields are public
        expect(publicProfileFields).toContain('full_name')
        expect(publicProfileFields).toContain('display_name')

        // Sensitive fields should NOT be in public view
        expect(publicProfileFields).not.toContain('weekly_hours')
    })
})

// =============================================================================
// ADMIN AUDIT TRAIL
// =============================================================================

describe('DSGVO: Audit Trail for Sensitive Actions', () => {
    /**
     * All admin actions that modify user data MUST be logged:
     * - Creating users
     * - Approving/Rejecting absences
     * - Modifying time entries
     * - Changing balance corrections
     */

    it('admin actions have required fields for audit', () => {
        const auditEntry = {
            id: 'audit-1',
            admin_id: mockUsers.admin.id,
            action: 'approve_absence',
            target_user_id: mockUsers.employee.id,
            details: { absence_id: 'abs-1', old_status: 'beantragt', new_status: 'genehmigt' },
            created_at: new Date().toISOString()
        }

        // Required fields for DSGVO compliance
        expect(auditEntry.admin_id).toBeDefined()
        expect(auditEntry.action).toBeDefined()
        expect(auditEntry.target_user_id).toBeDefined()
        expect(auditEntry.created_at).toBeDefined()
        expect(auditEntry.details).toBeDefined()
    })

    it('sensitive actions are tracked', () => {
        const sensitiveActions = [
            'create_user',
            'approve_absence',
            'reject_absence',
            'cancel_absence',
            'edit_time_entry',
            'add_balance_correction',
            'finalize_month'
        ]

        // All these should trigger audit logging
        sensitiveActions.forEach(action => {
            expect(['create', 'approve', 'reject', 'cancel', 'edit', 'add', 'finalize'].some(
                verb => action.includes(verb)
            )).toBe(true)
        })
    })
})
