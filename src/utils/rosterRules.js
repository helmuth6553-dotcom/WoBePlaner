import { format, isValid } from 'date-fns'

// Normalize shift type aliases to canonical form
const normalizeType = (type) => {
    const up = type?.toUpperCase()
    if (up === 'TAGDIENST' || up === 'TAG') return 'TD1'
    if (up === 'NACHTDIENST' || up === 'NACHT') return 'ND'
    if (up === 'DOPPEL') return 'DBD'
    if (up === 'ANLAUFSTELLE') return 'AST'
    return up
}

// Symmetric conflict pairs: [typeA, typeB] — neither can be combined on the same day
const CONFLICT_PAIRS = [
    ['ND', 'TD2'],   // Overlap
    ['ND', 'DBD'],   // Overlap
    ['AST', 'TD2'],  // 16:45-19:45 / 14:00-19:30
    ['AST', 'ND'],   // 16:45-19:45 / 19:00+
]

/**
 * Validates if a user can take a specific shift based on rules.
 *
 * @param {Object} targetShift - The shift the user wants to take
 * @param {Array} allAbsences - List of all absences
 * @param {Object} user - The current user object
 * @param {Array} shifts - List of all shifts (to check for conflicts)
 * @returns {string|null} - Error message if invalid, null if valid
 */
export const validateShiftRules = (targetShift, allAbsences, user, shifts) => {
    if (!targetShift.start_time) return null
    const targetDate = new Date(targetShift.start_time)
    if (!isValid(targetDate)) return null
    const targetDateStr = targetShift.start_time.split('T')[0]
    const targetType = normalizeType(targetShift.type)

    // Check Sick Leave
    const isSick = allAbsences.find(a =>
        a.user_id === user.id &&
        a.type === 'Krank' &&
        a.status === 'genehmigt' &&
        targetDateStr >= a.start_date &&
        targetDateStr <= a.end_date
    )
    if (isSick) return "Du bist in diesem Zeitraum krankgemeldet."

    // Helper to find existing shifts for the user
    const myRelevantShifts = shifts.filter(s =>
        s.assigned_to === user.id ||
        s.interests?.some(i => i.user_id === user.id)
    )

    const hasShift = (dateStr, ...types) =>
        myRelevantShifts.some(s =>
            s.start_time?.startsWith(dateStr) && types.includes(normalizeType(s.type))
        )

    // Check symmetric conflict pairs
    for (const [a, b] of CONFLICT_PAIRS) {
        const conflicting = targetType === a ? b : targetType === b ? a : null
        if (conflicting && hasShift(targetDateStr, conflicting)) {
            return `${targetType} und ${conflicting} sind nicht kombinierbar.`
        }
    }

    // Rest Periods: ND ↔ TD1 next day
    if (targetType === 'TD1') {
        const yesterday = new Date(targetDate)
        yesterday.setDate(yesterday.getDate() - 1)
        if (hasShift(format(yesterday, 'yyyy-MM-dd'), 'ND')) {
            return "Ruhezeit: Nach ND kein TD1 am Folgetag."
        }
    }
    if (targetType === 'ND') {
        const tomorrow = new Date(targetDate)
        tomorrow.setDate(tomorrow.getDate() + 1)
        if (hasShift(format(tomorrow, 'yyyy-MM-dd'), 'TD1')) {
            return "Ruhezeit: Nach ND kein TD1 am Folgetag."
        }
    }

    return null
}
