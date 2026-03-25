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

// Lookup for shift types with fixed times (no date-dependent logic)
const FIXED_SHIFT_TIMES = {
    DBD:                   { startH: 20, startM:  0, endH:  0, endM:  0, endNextDay: true },
    TD2:                   { startH: 14, startM:  0, endH: 19, endM: 30 },
    TEAM:                  { startH:  9, startM: 30, endH: 11, endM: 30 },
    FORTBILDUNG:           { startH:  9, startM:  0, endH: 17, endM:  0 },
    EINSCHULUNG:           { startH: 13, startM:  0, endH: 15, endM:  0 },
    MITARBEITERGESPRAECH:  { startH: 10, startM:  0, endH: 11, endM:  0 },
    AST:                   { startH: 16, startM: 45, endH: 19, endM: 45 },
    SONSTIGES:             { startH: 10, startM:  0, endH: 11, endM:  0 },
    SUPERVISION:           { startH:  9, startM:  0, endH: 10, endM: 30 },
}

export const getDefaultTimes = (dateStr, type, holidays = []) => {
    // Fixed-time shift types (no date-dependent logic)
    const fixed = FIXED_SHIFT_TIMES[type]
    if (fixed) {
        return {
            start: createLocalTime(dateStr, fixed.startH, fixed.startM),
            end: createLocalTime(dateStr, fixed.endH, fixed.endM, fixed.endNextDay ? 1 : 0),
        }
    }

    const date = new Date(dateStr)
    const dayName = format(date, 'EEEE')
    const isHol = isHoliday(date, holidays)

    // ND (Night Duty): Start 19:00, End depends on day
    // Fri/Sat → 10:00 next day, else → 08:00 next day
    // TODO: Pre-Holiday → 10:00 next day (requires tomorrow-holiday check)
    if (type === 'ND') {
        const endHour = (dayName === 'Friday' || dayName === 'Saturday') ? 10 : 8
        return {
            start: createLocalTime(dateStr, 19, 0),
            end: createLocalTime(dateStr, endHour, 0, 1),
        }
    }

    // TD1 (Tagdienst 1): Weekend/Holiday 09:30-14:30, Weekday 07:30-14:30
    if (type === 'TD1') {
        const startHour = (isHol || dayName === 'Saturday' || dayName === 'Sunday') ? 9 : 7
        const startMin = 30
        return {
            start: createLocalTime(dateStr, startHour, startMin),
            end: createLocalTime(dateStr, 14, 30),
        }
    }

    return { start: null, end: null }
}
