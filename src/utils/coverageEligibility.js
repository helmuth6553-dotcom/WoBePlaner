/**
 * Coverage Eligibility Rules
 *
 * Determines which employees are eligible to cover an open shift.
 * Uses existing rosterRules.js logic plus additional coverage-specific rules.
 */

import { format } from 'date-fns'

// Symmetric conflict pairs: [typeA, typeB] means neither can be combined with the other on the same day
const CONFLICT_PAIRS = [
    ['ND', 'TD2'],   // Overlap: ND 19:00+ / TD2 14:00-19:30
    ['ND', 'DBD'],   // Overlap: ND 19:00+ / DBD 20:00+
    ['AST', 'TD2'],  // Overlap: AST 16:45-19:45 / TD2 14:00-19:30
    ['AST', 'ND'],   // Overlap: AST 16:45-19:45 / ND 19:00+
]

/** Check if targetType conflicts with any of the user's existing shifts */
function findConflict(targetType, existingShifts) {
    for (const [a, b] of CONFLICT_PAIRS) {
        const conflicting = targetType === a ? b : targetType === b ? a : null
        if (conflicting && existingShifts.some(s => s.type?.toUpperCase() === conflicting)) {
            return `${targetType} und ${conflicting} nicht kombinierbar`
        }
    }
    return null
}

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
    if (userId === sickUserId) {
        return { eligible: false, reason: 'Ist krankgemeldet' }
    }

    if (!targetShift.start_time) {
        return { eligible: true }
    }

    const targetDate = new Date(targetShift.start_time)
    const targetDateStr = targetShift.start_time.split('T')[0]
    const targetType = targetShift.type?.toUpperCase()

    // Has approved absence (vacation/sick) on this day
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
    const getUserShiftsOnDate = (dateStr) =>
        userShifts.filter(s => s.start_time && s.start_time.startsWith(dateStr))

    const myShiftsToday = getUserShiftsOnDate(targetDateStr)

    // Already has exact same shift type on this day
    if (myShiftsToday.some(s => s.type?.toUpperCase() === targetType)) {
        return { eligible: false, reason: `Hat bereits ${targetType}` }
    }

    // Check symmetric conflict pairs (ND+TD2, ND+DBD, AST+TD2, AST+ND)
    const conflict = findConflict(targetType, myShiftsToday)
    if (conflict) {
        return { eligible: false, reason: conflict }
    }

    // ND yesterday -> no TD1 today (rest period)
    if (targetType === 'TD1') {
        const yesterday = new Date(targetDate)
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayStr = format(yesterday, 'yyyy-MM-dd')
        const hadND = getUserShiftsOnDate(yesterdayStr).some(s => s.type?.toUpperCase() === 'ND')
        if (hadND) {
            return { eligible: false, reason: 'Ruhezeit: Nach ND kein TD1 am Folgetag' }
        }
    }

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
            s.interests?.some(i => i.user_id === emp.id)
        )

        const result = checkEligibility(targetShift, emp.id, sickUserId, userShifts, allAbsences)

        return {
            userId: emp.id,
            ...result,
        }
    })
}
