import { differenceInMinutes, differenceInDays, addDays, isBefore, max, min, addMinutes, isWeekend, getYear, format, parseISO } from 'date-fns'
import { getHolidays, isHoliday } from './holidays'

/**
 * Core Time Calculation Logic
 * 
 * Objectives:
 * 1. Calculate the active working time (End - Start).
 * 2. Handle "Night Duty" (Type: ND) where specifically defined "Readiness Time" (00:30 - 06:00) 
 *    is counted as "passive" (50% value) unless interrupted.
 * 3. Handle Interruptions during Readiness:
 *    - Interruptions are "Inflated" (minimum 30 min credit)
 *    - Overlapping interruptions are "Merged"
 *    - Interruption time is deducted from passive time and credited as active (100%).
 * 
 * @param {string} startIso - Start timestamp
 * @param {string} endIso - End timestamp
 * @param {string} type - Shift Type (e.g. 'ND', 'Tag')
 * @param {Array} interruptions - List of active work intervals during readiness
 */
export const calculateWorkHours = (startIso, endIso, type, interruptions = []) => {
    if (!startIso || !endIso) return 0

    const start = new Date(startIso)
    const end = new Date(endIso)

    // 1. Base Duration
    let totalMinutes = differenceInMinutes(end, start)

    // If not ND, simple diff
    if (type !== 'ND') {
        return Math.round((totalMinutes / 60) * 100) / 100
    }

    // 2. Define Readiness Window (00:30 - 06:00)
    let readinessStart = new Date(start)
    if (start.getHours() >= 12) {
        readinessStart = addDays(readinessStart, 1)
    }
    readinessStart.setHours(0, 30, 0, 0)

    let readinessEnd = new Date(readinessStart)
    readinessEnd.setHours(6, 0, 0, 0)

    // 3. Calculate Overlap with Readiness (Total Readiness Time)
    const overlapStart = max([start, readinessStart])
    const overlapEnd = min([end, readinessEnd])

    let readinessMinutes = 0
    if (isBefore(overlapStart, overlapEnd)) {
        readinessMinutes = differenceInMinutes(overlapEnd, overlapStart)
    }

    // 4. Process Interruptions (Inflation + Merge)
    let interruptionIntervals = []
    let deductedReadinessMinutes = 0 // Sum of ACTUAL duration (not inflated)

    if (interruptions && interruptions.length > 0) {
        // A. Filter and Collect valid interruptions within readiness
        const rawIntervals = []
        interruptions.forEach(int => {
            if (!int.start || !int.end) return
            const intStart = new Date(int.start)
            const intEnd = new Date(int.end)

            // Only count interruptions overlapping with readiness
            const iOverlapStart = max([intStart, readinessStart])
            const iOverlapEnd = min([intEnd, readinessEnd])

            if (isBefore(iOverlapStart, iOverlapEnd)) {
                // Calculate actual duration for deduction later
                const duration = differenceInMinutes(iOverlapEnd, iOverlapStart)
                deductedReadinessMinutes += duration

                // Create Inflated Interval (Start -> Max(End, Start+30))
                const inflatedEnd = max([iOverlapEnd, addMinutes(iOverlapStart, 30)])
                rawIntervals.push({ start: iOverlapStart, end: inflatedEnd })
            }
        })

        // B. Merge Overlapping Intervals
        if (rawIntervals.length > 0) {
            // Sort by start time
            rawIntervals.sort((a, b) => a.start - b.start)

            let merged = [rawIntervals[0]]

            for (let i = 1; i < rawIntervals.length; i++) {
                let current = rawIntervals[i]
                let last = merged[merged.length - 1]

                if (current.start < last.end) {
                    // Overlap or touch -> Merge (Extend end if needed)
                    last.end = max([last.end, current.end])
                } else {
                    // No overlap -> New interval
                    merged.push(current)
                }
            }
            interruptionIntervals = merged
        }
    }

    // C. Calculate Total Credit from Merged Intervals
    let interruptionCreditMinutes = 0
    interruptionIntervals.forEach(interval => {
        interruptionCreditMinutes += differenceInMinutes(interval.end, interval.start)
    })

    // 5. Final Calculation
    // Deduct actual worked minutes from passive readiness (cannot be negative)
    deductedReadinessMinutes = Math.min(deductedReadinessMinutes, readinessMinutes)
    const passiveReadinessMinutes = readinessMinutes - deductedReadinessMinutes

    // Active Work outside readiness
    const activeWorkOutsideReadiness = totalMinutes - readinessMinutes

    // Total = Active Outside + Interruption Credit (Active inside) + Passive Readiness (50%)
    const totalWeightedMinutes = activeWorkOutsideReadiness + interruptionCreditMinutes + (passiveReadinessMinutes * 0.5)

    return Math.round((totalWeightedMinutes / 60) * 100) / 100
}

/**
 * SINGLE SOURCE OF TRUTH for Absence Calculations
 * 
 * Calculates how many hours a specific absence day is worth.
 * Rules derived from RULES_OF_TIME.md (09.12.2025)
 * 
 * Rules:
 * 1. SICK (Krank):
 *    - If planned shifts exist for this day: Sum of planned hours.
 *    - If NO planned shifts: 0h (regardless of weekday/weekend).
 * 
 * 2. VACATION (Urlaub):
 *    - Workdays (Mo-Fr, no Holiday): Average daily hours (weekly/5).
 *    - Weekend/Holiday: 0h.
 *    - Planned shifts are ignored.
 * 
 * @param {Date|string} dateInput - The day to calculate
 * @param {Object} absence - The absence object (must contain type/reason)
 * @param {Array} plannedShifts - All planned shifts for the user (filtered for this day)
 * @param {Object} userProfile - User profile for weekly_hours
 */
export const calculateDailyAbsenceHours = (dateInput, absence, plannedShifts = [], userProfile = null) => {
    // 1. Normalize Date
    const date = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput
    const year = getYear(date)
    const holidays = getHolidays(year)

    // 2. Determine default available hours
    const weeklyHours = Number(userProfile?.weekly_hours) || 40
    const dailyHours = weeklyHours / 5

    // 3. Determine Type
    const isSick = absence?.reason === 'sick' || (absence?.type && absence.type.toLowerCase().includes('krank'))

    // 4. Calculate
    if (isSick) {
        // Rule: Stored Planned Hours (Priority 1)
        // If the absence record has stored 'planned_hours' (saved when reporting sick), use that.
        // This is crucial because the actual shift might have been deleted/unassigned after reporting sick.
        // IMPORTANT: planned_hours is the TOTAL for the entire sick period, so divide by number of days.
        if (absence?.planned_hours !== undefined && absence?.planned_hours !== null && Number(absence.planned_hours) > 0) {
            // Calculate number of days in the sick period
            const startDate = absence.start_date ? parseISO(absence.start_date) : date
            const endDate = absence.end_date ? parseISO(absence.end_date) : date
            const totalDays = Math.max(1, differenceInDays(endDate, startDate) + 1)

            // Return per-day average
            return Number(absence.planned_hours) / totalDays
        }

        // Rule: Live Planned Shifts (Priority 2)
        // If no hours stored, check if a shift still exists in the plan for this day.
        const dateKey = format(date, 'yyyy-MM-dd')
        const dayShifts = plannedShifts.filter(s => {
            if (!s.start_time) return false
            return format(parseISO(s.start_time), 'yyyy-MM-dd') === dateKey
        })

        if (dayShifts.length > 0) {
            return dayShifts.reduce((sum, s) => {
                return sum + calculateWorkHours(s.start_time, s.end_time, s.type)
            }, 0)
        }

        return 0 // No stored hours AND no active shift = No sick hours
    } else {
        // VACATION
        // Vacation always replaces "Standard Time". 
        // We do strictly Mo-Fr (excl Holidays).
        const isNonWork = isWeekend(date) || isHoliday(date, holidays)
        return isNonWork ? 0 : dailyHours
    }
}
