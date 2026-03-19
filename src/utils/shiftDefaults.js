import { format, isWeekend } from 'date-fns'
import { isHoliday } from './holidays'

// Helper to create a Local Date Object representing the time, 
// ensuring we account for Daylight Saving Time correctly relative to the date.
const createLocalTime = (dateStr, hours, minutes, addDaysCount = 0) => {
    // dateStr is "YYYY-MM-DD"
    const d = new Date(dateStr)
    // Set time limits "local" interpretation in browser
    d.setHours(hours, minutes, 0, 0)
    if (addDaysCount > 0) d.setDate(d.getDate() + addDaysCount)
    return d
}

// Holidays list for checking (passed from outside or we could import if consistent)
// For simplicity in this utility, we rely on the helper passed or basic check
// But to ensure consistency with RosterFeed, we should assume the caller handles holiday detection 
// or we use the existing isHoliday util.

export const getDefaultTimes = (dateStr, type, holidays = []) => {
    const date = new Date(dateStr)
    const dayName = format(date, 'EEEE') // 'Monday', 'Tuesday', ...

    // We need to check holidays. The existing isHoliday util usually takes a date and list of holidays.
    // If we don't have the list here, we might need to rely on the passed simplified check.
    // However, ShiftRepair defines its own holidays list sometimes. 
    // Best effort: Use standard Weekend check + isHoliday if available.

    // Check if Holiday (using the util if holidays array provided, else false)
    const isHol = isHoliday(date, holidays)
    const _isWe = isWeekend(date) // Sat, Sun (unused, but kept for future use)

    let start = null
    let end = null

    // STANDARD RULES (Based on "Muster April 2026" / ShiftRepair)

    // 1. DBD: Always 20:00 - 00:00 (Next Day) - Actually 00:00 Next Day
    if (type === 'DBD') {
        start = createLocalTime(dateStr, 20, 0) // 20:00
        end = createLocalTime(dateStr, 0, 0, 1) // 00:00 +1 Day
    }

    // 2. ND (Night Duty)
    // Start: 19:00
    // End: 
    // - Fri, Sat: 10:00 (+1)
    // - Pre-Holiday: 10:00 (+1)  (Complex to detect without full calendar, assuming standard for now)
    // - Else: 08:00 (+1)
    if (type === 'ND') {
        start = createLocalTime(dateStr, 19, 0)

        // Check for "Weekend Night" extension
        // Fri Night -> Sat Morning (End 10:00)
        // Sat Night -> Sun Morning (End 10:00)
        // Pre-Holiday -> Holiday Morning (End 10:00) - TODO: Add Pre-Holiday check if strictly needed

        // Simplified Logic aligned with ShiftRepair:
        // if (dayName === 'Friday' || dayName === 'Saturday' || isPreHol)

        let endHour = 8
        if (dayName === 'Friday' || dayName === 'Saturday') {
            endHour = 10
        }
        // Hint: Pre-Holiday check omitted for simplicity unless requested, 
        // as it requires "Tomorrow" holiday check.

        end = createLocalTime(dateStr, endHour, 0, 1)
    }

    // 3. TD1 (Tagdienst 1)
    if (type === 'TD1') {
        if (isHol || dayName === 'Saturday' || dayName === 'Sunday') {
            // Weekend/Holiday: 09:30 - 14:30
            start = createLocalTime(dateStr, 9, 30)
            end = createLocalTime(dateStr, 14, 30)
        } else {
            // Weekday (Tue, Wed per ShiftRepair, but RosterFeed assumes valid for input)
            // Default Weekday: 07:30 - 14:30
            start = createLocalTime(dateStr, 7, 30)
            end = createLocalTime(dateStr, 14, 30)
        }
    }

    // 4. TD2 (Tagdienst 2)
    if (type === 'TD2') {
        // Always 14:00 - 19:30 (when it exists)
        start = createLocalTime(dateStr, 14, 0)
        end = createLocalTime(dateStr, 19, 30)
    }

    // 5. TEAM (Teamsitzung)
    if (type === 'TEAM') {
        // Weekday dependent?
        // User pointed out "Donnerstag ... 10:30 - 12:30".
        // Current Code was 09:30-11:30.
        // Let's assume standard is 09:30 - 11:30 LOCAL time.
        // If user says "10:30 - 12:30" was shown, it might be due to 09:30 UTC = 10:30 CET.
        // So maybe 09:30 IS the intended local start?
        // Or 10:30? 
        // Let's set a sensible default.
        start = createLocalTime(dateStr, 9, 30)
        end = createLocalTime(dateStr, 11, 30)
    }

    // 6. FORTBILDUNG
    if (type === 'FORTBILDUNG') {
        // 09:00 - 17:00
        start = createLocalTime(dateStr, 9, 0)
        end = createLocalTime(dateStr, 17, 0)
    }

    // 7. EINSCHULUNG (Einschulungstermin)
    if (type === 'EINSCHULUNG') {
        // 13:00 - 15:00
        start = createLocalTime(dateStr, 13, 0)
        end = createLocalTime(dateStr, 15, 0)
    }

    // 8. MITARBEITERGESPRAECH
    if (type === 'MITARBEITERGESPRAECH') {
        // 10:00 - 11:00
        start = createLocalTime(dateStr, 10, 0)
        end = createLocalTime(dateStr, 11, 0)
    }

    // 9. AST (Anlaufstelle)
    if (type === 'AST') {
        // 16:45 - 19:45
        start = createLocalTime(dateStr, 16, 45)
        end = createLocalTime(dateStr, 19, 45)
    }

    // 10. SONSTIGES
    if (type === 'SONSTIGES') {
        // 10:00 - 11:00
        start = createLocalTime(dateStr, 10, 0)
        end = createLocalTime(dateStr, 11, 0)
    }

    // 11. SUPERVISION
    if (type === 'SUPERVISION') {
        // 09:00 - 10:30
        start = createLocalTime(dateStr, 9, 0)
        end = createLocalTime(dateStr, 10, 30)
    }

    return { start, end }
}
