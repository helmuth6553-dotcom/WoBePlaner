import { startOfMonth, subMonths, format } from 'date-fns'
import { calculateGenericBalance } from './balanceHelpers'

/**
 * Calculate month-by-month balance history for the last N months.
 * Calls calculateGenericBalance() for each month to stay in sync with the rest of the app.
 *
 * @param {Object} profile - { weekly_hours, start_date, initial_balance }
 * @param {Array} allShifts - All shifts from employment start to now
 * @param {Array} allAbsences - All approved absences
 * @param {Array} allTimeEntries - All time entries
 * @param {Array} allCorrections - All balance corrections
 * @param {number} months - How many months back (default 12)
 * @returns {Array<{ month: string, label: string, target: number, actual: number, vacation: number, diff: number, carryover: number, total: number }>}
 */
export function calculateMonthlyHistory(profile, allShifts, allAbsences, allTimeEntries, allCorrections, months = 12) {
    const results = []
    const now = new Date()

    for (let i = months - 1; i >= 0; i--) {
        const monthDate = startOfMonth(subMonths(now, i))
        const monthKey = format(monthDate, 'yyyy-MM')
        const monthLabel = format(monthDate, 'MMM')

        const bal = calculateGenericBalance(
            profile, allShifts, allAbsences, allTimeEntries, monthDate, allCorrections
        )

        if (bal) {
            results.push({
                month: monthKey,
                label: monthLabel,
                target: bal.target,
                actual: bal.actual,
                vacation: bal.vacation,
                diff: bal.diff,
                carryover: bal.carryover,
                correction: bal.correction,
                total: bal.total,
            })
        }
    }

    return results
}
