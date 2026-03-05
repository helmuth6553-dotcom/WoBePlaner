/**
 * Coverage Eligibility Rules
 *
 * Determines which employees are eligible to cover an open shift.
 * Uses existing rosterRules.js logic plus additional coverage-specific rules.
 */

import { format } from 'date-fns'

/**
 * Check if a user is eligible to cover a specific shift.
 *
 * @param {Object} targetShift - The shift that needs coverage
 * @param {string} userId - The user to check
 * @param {string} sickUserId - The user who called in sick
 * @param {Array} userShifts - All shifts this user is assigned to / has interest in
 * @param {Array} absences - All approved absences
 * @returns {{ eligible: boolean, reason?: string }}
 */
export function checkEligibility(targetShift, userId, sickUserId, userShifts, absences) {
    // 1. Is the sick person
    if (userId === sickUserId) {
        return { eligible: false, reason: 'Ist krankgemeldet' }
    }

    if (!targetShift.start_time) {
        return { eligible: true }
    }

    const targetDate = new Date(targetShift.start_time)
    const targetDateStr = targetShift.start_time.split('T')[0]
    const targetType = targetShift.type?.toUpperCase()

    // 2. Has approved absence (vacation/sick) on this day
    const hasAbsence = absences.find(abs =>
        abs.user_id === userId &&
        abs.status === 'genehmigt' &&
        targetDateStr >= abs.start_date &&
        targetDateStr <= abs.end_date
    )
    if (hasAbsence) {
        return { eligible: false, reason: `${hasAbsence.type} am ${targetDateStr}` }
    }

    // Helper: find user's shifts on a specific date
    const getUserShiftsOnDate = (dateStr) => {
        return userShifts.filter(s => {
            if (!s.start_time) return false
            return s.start_time.startsWith(dateStr)
        })
    }

    const myShiftsToday = getUserShiftsOnDate(targetDateStr)

    // 3. Already has exact same shift type on this day
    const hasSameShift = myShiftsToday.find(s => s.type?.toUpperCase() === targetType)
    if (hasSameShift) {
        return { eligible: false, reason: `Hat bereits ${targetType}` }
    }

    // 4. TD2 + ND same day: NOT allowed (overlap)
    if (targetType === 'ND' && myShiftsToday.some(s => s.type?.toUpperCase() === 'TD2')) {
        return { eligible: false, reason: 'TD2 und ND nicht kombinierbar' }
    }
    if (targetType === 'TD2' && myShiftsToday.some(s => s.type?.toUpperCase() === 'ND')) {
        return { eligible: false, reason: 'ND und TD2 nicht kombinierbar' }
    }

    // 5. ND + DBD same day: NOT allowed
    if (targetType === 'ND' && myShiftsToday.some(s => s.type?.toUpperCase() === 'DBD')) {
        return { eligible: false, reason: 'DBD und ND nicht kombinierbar' }
    }
    if (targetType === 'DBD' && myShiftsToday.some(s => s.type?.toUpperCase() === 'ND')) {
        return { eligible: false, reason: 'ND und DBD nicht kombinierbar' }
    }

    // 6. ND yesterday -> no TD1 today (rest period)
    if (targetType === 'TD1') {
        const yesterday = new Date(targetDate)
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayStr = format(yesterday, 'yyyy-MM-dd')
        const hadND = getUserShiftsOnDate(yesterdayStr).some(s => s.type?.toUpperCase() === 'ND')
        if (hadND) {
            return { eligible: false, reason: 'Ruhezeit: Nach ND kein TD1 am Folgetag' }
        }
    }

    // 7. TD1 today -> ND today is allowed (enough break)
    // 8. TD1 today -> TD2 today is allowed (shift handover)
    // These are explicitly ALLOWED, no rule needed

    return { eligible: true }
}

/**
 * Get all eligible users for covering a specific shift.
 *
 * @param {Object} targetShift - The shift that needs coverage
 * @param {string} sickUserId - The user who called in sick
 * @param {Array} allProfiles - All user profiles (non-admin)
 * @param {Array} allShifts - All shifts with interests
 * @param {Array} allAbsences - All approved absences
 * @returns {Array<{ userId: string, eligible: boolean, reason?: string }>}
 */
export function getEligibleUsers(targetShift, sickUserId, allProfiles, allShifts, allAbsences) {
    const employees = allProfiles.filter(p => p.role !== 'admin')

    return employees.map(emp => {
        // Get this user's shifts (assigned or interested)
        const userShifts = allShifts.filter(s =>
            s.assigned_to === emp.id ||
            s.interests?.some(i => i.user_id === emp.id)
        )

        const result = checkEligibility(targetShift, emp.id, sickUserId, userShifts, allAbsences)

        return {
            userId: emp.id,
            ...result,
        }
    })
}
