/**
 * timeTrackingHelpers.js
 * 
 * Extracted helper functions from TimeTracking.jsx and AdminTimeTracking.jsx
 * to reduce code duplication (AI Slop reduction).
 * 
 * @see src/utils/timeTrackingHelpers.test.js for tests
 */

import { format, parseISO, eachDayOfInterval, addDays } from 'date-fns'

/**
 * Constructs an ISO timestamp from a reference date and a time string (HH:mm).
 * Used when the user enters a time in a form and we need to combine it with a shift date.
 * 
 * @param {string} referenceIso - Reference ISO date string
 * @param {string} timeStr - Time string in HH:mm format
 * @returns {string|null} ISO timestamp or null if invalid
 */
export function constructIso(referenceIso, timeStr) {
    if (!referenceIso || !timeStr) return null
    try {
        const [hours, minutes] = timeStr.split(':').map(Number)
        const date = parseISO(referenceIso)
        const newDate = new Date(date)
        newDate.setHours(hours, minutes, 0, 0)
        return newDate.toISOString()
    } catch { return null }
}

/**
 * Constructs ISO for end time, handling overnight shifts.
 * If end time appears to be on next day (end < start), adds a day.
 * 
 * Logic (per SHIFT_TIMES.md):
 * - ND: 19:00 - 08:00 → end is next day
 * - DBD: 20:00 - 00:00 → end is next day (midnight)
 * - TD1/TD2: same day
 * 
 * @param {string} referenceIso - Reference ISO date string (shift start)
 * @param {string} startTimeStr - Start time string in HH:mm format
 * @param {string} endTimeStr - End time string in HH:mm format
 * @returns {string|null} ISO timestamp or null if invalid
 */
export function constructEndIso(referenceIso, startTimeStr, endTimeStr) {
    if (!referenceIso || !startTimeStr || !endTimeStr) return null
    try {
        const [startHours, startMinutes] = startTimeStr.split(':').map(Number)
        const [endHours, endMinutes] = endTimeStr.split(':').map(Number)
        const date = parseISO(referenceIso)
        let newDate = new Date(date)

        // Convert to total minutes for easier comparison
        const startTotalMins = startHours * 60 + (startMinutes || 0)
        const endTotalMins = endHours * 60 + endMinutes

        // If end time is earlier than start time, end is on the next day
        // Examples: 19:00-08:00, 20:00-00:00, 22:00-06:00
        if (endTotalMins < startTotalMins) {
            newDate = addDays(newDate, 1)
        }

        // Use the same hours/minutes as input (local time context)
        newDate.setHours(endHours, endMinutes, 0, 0)
        return newDate.toISOString()
    } catch { return null }
}

/**
 * Constructs ISO for interruption, handling overnight shifts.
 * If time is before noon but shift started after noon, adds a day.
 * 
 * @param {string} shiftStartIso - Shift start time as ISO string
 * @param {string} timeStr - Time string in HH:mm format
 * @returns {string|null} ISO timestamp or null if invalid
 */
export function constructInterruptionIso(shiftStartIso, timeStr) {
    if (!shiftStartIso || !timeStr) return null
    try {
        const [hours, minutes] = timeStr.split(':').map(Number)
        const startDate = parseISO(shiftStartIso)
        let targetDate = new Date(startDate)
        if (hours < 12 && startDate.getHours() >= 12) {
            targetDate = addDays(targetDate, 1)
        }
        targetDate.setHours(hours, minutes, 0, 0)
        return targetDate.toISOString()
    } catch { return null }
}

/**
 * Filters shifts to only include those after the user's start date.
 * This prevents showing shifts for days before the employee started working.
 * 
 * @param {Array} shifts - Array of shift objects
 * @param {Date|null} effectiveStartDate - User's employment start date
 * @returns {Array} Filtered shifts
 */
export function filterShiftsByStartDate(shifts, effectiveStartDate) {
    if (!effectiveStartDate) return shifts
    return shifts.filter(s => {
        if (!s.start_time) return false
        return new Date(s.start_time) >= effectiveStartDate
    })
}

/**
 * Deduplicates entries by ID.
 * Later entries with the same ID overwrite earlier ones.
 * 
 * @param {Array} entries - Array of objects with 'id' property
 * @returns {Array} Deduplicated array
 */
export function deduplicateEntries(entries) {
    const map = new Map()
    entries.forEach(e => map.set(e.id, e))
    return Array.from(map.values())
}

/**
 * Expands multi-day absences into individual day items.
 * 
 * This is the most complex helper - it takes approved absences and creates
 * individual items for each day, handling:
 * - Month boundary clamping
 * - Sick leave with shift snapshots (one item per planned shift)
 * - Vacation (one item per day)
 * - Zero-hour days (weekends, holidays) are skipped
 * 
 * @param {Array} absences - Approved absences from database
 * @param {Date} monthStart - First day of the month
 * @param {Date} monthEnd - Last day of the month
 * @param {Array} plannedShifts - All planned shifts for fallback
 * @param {Object} profile - User profile with weekly_hours
 * @param {Function} calculateDailyAbsenceHoursFn - SSOT function for hours
 * @param {Function} calculateWorkHoursFn - Function to calculate shift hours
 * @returns {Array} Array of absence items, one per day (or per shift for sick)
 */
export function expandAbsencesToItems(
    absences,
    monthStart,
    monthEnd,
    plannedShifts,
    profile,
    calculateDailyAbsenceHoursFn,
    calculateWorkHoursFn
) {
    const absenceItems = []

    if (!absences || absences.length === 0) return absenceItems

    absences.forEach(abs => {
        // Clamp to month boundaries
        const absStartDate = new Date(abs.start_date)
        const absEndDate = new Date(abs.end_date)
        const rangeStart = absStartDate < monthStart ? monthStart : absStartDate
        const rangeEnd = absEndDate > monthEnd ? monthEnd : absEndDate

        if (rangeStart <= rangeEnd) {
            const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd })

            days.forEach(day => {
                // Calculate hours using the provided SSOT function
                const hours = calculateDailyAbsenceHoursFn(day, abs, plannedShifts, profile)

                if (hours > 0) {
                    const dateKey = format(day, 'yyyy-MM-dd')
                    const isSick = abs.reason === 'sick' ||
                        (abs.type && abs.type.toLowerCase().includes('krank'))

                    // For SICK leave: Use saved snapshot OR fall back to live data
                    let plannedShiftsForDay = []

                    if (isSick && abs.planned_shifts_snapshot && abs.planned_shifts_snapshot.length > 0) {
                        // Use saved snapshot - filter to this specific day
                        plannedShiftsForDay = abs.planned_shifts_snapshot.filter(s => {
                            if (!s.start_time) return false
                            return format(parseISO(s.start_time), 'yyyy-MM-dd') === dateKey
                        })
                    } else {
                        // Fall back to live data (for old absences without snapshot)
                        plannedShiftsForDay = plannedShifts.filter(s => {
                            if (!s.start_time) return false
                            return format(parseISO(s.start_time), 'yyyy-MM-dd') === dateKey
                        })
                    }

                    // For SICK: Create one entry PER planned shift
                    // For VACATION: Create one entry per day
                    if (isSick && plannedShiftsForDay.length > 0) {
                        plannedShiftsForDay.forEach((shift, idx) => {
                            const shiftHours = calculateWorkHoursFn(shift.start_time, shift.end_time, shift.type)
                            absenceItems.push({
                                id: `abs-${abs.id}-${dateKey}-${idx}`,
                                absence_id: abs.id,
                                date: dateKey,
                                type: abs.type,
                                reason: abs.reason,
                                note: abs.note,
                                planned_hours: shiftHours,
                                plannedShift: shift,
                                itemType: 'absence',
                                sortDate: new Date(shift.start_time)
                            })
                        })
                    } else {
                        absenceItems.push({
                            id: `abs-${abs.id}-${dateKey}`,
                            absence_id: abs.id,
                            date: dateKey,
                            type: abs.type,
                            reason: abs.reason,
                            note: abs.note,
                            planned_hours: hours,
                            itemType: 'absence',
                            sortDate: day
                        })
                    }
                }
            })
        }
    })

    return absenceItems
}

/**
 * Safe time formatting - returns '--:--' on error
 * @param {string} iso - ISO timestamp
 * @returns {string} Formatted time HH:mm
 */
export function safeFormatTime(iso) {
    try {
        return format(parseISO(iso), 'HH:mm')
    } catch {
        return '--:--'
    }
}

/**
 * Safe date formatting - returns '' on error
 * @param {string} iso - ISO timestamp
 * @returns {string} Formatted date dd.MM.
 */
export function safeFormatDate(iso) {
    try {
        return format(parseISO(iso), 'dd.MM.')
    } catch {
        return ''
    }
}

/**
 * Validates that an interruption is at least 30 minutes long and at most 12 hours.
 * Automatically handles overnight interruptions (where end time < start time).
 * Prevents invalid entries like "01:30 to 01:00" which would otherwise span 23.5 hours.
 * 
 * @param {string} startStr - Start time (HH:mm)
 * @param {string} endStr - End time (HH:mm)
 * @returns {boolean} True if valid, false otherwise
 */
export function isValidInterruptionTime(startStr, endStr) {
    if (!startStr || !endStr || !startStr.includes(':') || !endStr.includes(':')) return false;
    try {
        const [sh, sm] = startStr.split(':').map(Number);
        const [eh, em] = endStr.split(':').map(Number);
        let startMins = sh * 60 + sm;
        let endMins = eh * 60 + em;
        
        if (endMins < startMins) {
            endMins += 24 * 60; // Crosses midnight
        }
        
        const duration = endMins - startMins;
        return duration >= 30 && duration <= 720; // 30 mins to 12 hours max
    } catch {
        return false;
    }
}
