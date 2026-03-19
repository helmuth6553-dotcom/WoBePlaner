import { format, isValid } from 'date-fns'

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

    let targetType = targetShift.type.toUpperCase()
    if (targetType === 'TAGDIENST' || targetType === 'TAG') targetType = 'TD1'
    if (targetType === 'NACHTDIENST' || targetType === 'NACHT') targetType = 'ND'
    if (targetType === 'DOPPEL') targetType = 'DBD'
    if (targetType === 'ANLAUFSTELLE') targetType = 'AST'

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
        (s.interests && s.interests.some(i => i.user_id === user.id))
    )

    const hasShift = (dateStr, ...types) => {
        return myRelevantShifts.find(s => {
            if (!s.start_time || !s.start_time.startsWith(dateStr)) return false
            let t = s.type.toUpperCase()
            if (t === 'TAGDIENST' || t === 'TAG') t = 'TD1'
            if (t === 'NACHTDIENST' || t === 'NACHT') t = 'ND'
            if (t === 'DOPPEL') t = 'DBD'
            return types.includes(t)
        })
    }

    // Rules
    if (targetType === 'TD2' && hasShift(targetDateStr, 'ND')) return "TD2 und ND sind nicht kombinierbar."
    if (targetType === 'ND' && hasShift(targetDateStr, 'TD2')) return "ND und TD2 sind nicht kombinierbar."
    if (targetType === 'ND' && hasShift(targetDateStr, 'DBD')) return "ND und DBD sind nicht kombinierbar."
    if (targetType === 'DBD' && hasShift(targetDateStr, 'ND')) return "DBD und ND sind nicht kombinierbar."

    // AST Konflikte (16:45-19:45 überlappt mit TD2 14:00-19:30 und ND 19:00+)
    if (targetType === 'AST' && hasShift(targetDateStr, 'TD2')) return "AST und TD2 sind nicht kombinierbar."
    if (targetType === 'TD2' && hasShift(targetDateStr, 'AST')) return "TD2 und AST sind nicht kombinierbar."
    if (targetType === 'AST' && hasShift(targetDateStr, 'ND')) return "AST und ND sind nicht kombinierbar."
    if (targetType === 'ND' && hasShift(targetDateStr, 'AST')) return "ND und AST sind nicht kombinierbar."

    // Rest Periods
    if (targetType === 'TD1') {
        const yesterday = new Date(targetDate)
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayStr = format(yesterday, 'yyyy-MM-dd')
        if (hasShift(yesterdayStr, 'ND')) return "Ruhezeit: Nach ND kein TD1 am Folgetag."
    }
    if (targetType === 'ND') {
        const tomorrow = new Date(targetDate)
        tomorrow.setDate(tomorrow.getDate() + 1)
        const tomorrowStr = format(tomorrow, 'yyyy-MM-dd')
        if (hasShift(tomorrowStr, 'TD1')) return "Ruhezeit: Nach ND kein TD1 am Folgetag."
    }

    return null
}
