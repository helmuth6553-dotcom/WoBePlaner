import { differenceInMinutes, differenceInDays, addDays, isBefore, max, min, addMinutes, isWeekend, getYear, format, parseISO } from 'date-fns'
import { getHolidays, isHoliday } from './holidays'

/**
 * Core Time Calculation Logic
 * 
 * Objectives:
 * 1. Calculate the active working time (End - Start).
 * 2. Handle shifts with "Standby Time" (e.g. ND 00:30 - 06:00) 
 *    counted as "passive" (50% value) unless interrupted.
 * 3. Handle Interruptions during Standby:
 *    - Interruptions are "Inflated" (minimum 30 min credit)
 *    - Overlapping interruptions are "Merged"
 *    - Interruption time is deducted from passive time and credited as active (100%).
 * 
 * @param {string} startIso - Start timestamp
 * @param {string} endIso - End timestamp
 * @param {string} type - Shift Type (e.g. 'ND', 'Tag')
 * @param {Array} interruptions - List of active work intervals during standby
 * @param {Object} template - Optional shift template with standby config (from DB)
 */
export const calculateWorkHours = (startIso, endIso, type, interruptions = [], template = null) => {
    if (!startIso || !endIso) return 0

    const start = new Date(startIso)
    const end = new Date(endIso)

    // ==========================================================================
    // DST (DAYLIGHT SAVING TIME) HANDLING
    // ==========================================================================
    // JavaScript Date() parst ISO-Strings ohne Zeitzone als LOKALE Zeit.
    // Das bedeutet: new Date('2025-03-30T02:30:00') wird auf Systemen mit 
    // Europe/Vienna Zeitzone automatisch als ungültig erkannt (diese Zeit existiert nicht!)
    // 
    // Die Funktion differenceInMinutes() von date-fns rechnet mit den tatsächlichen
    // Millisekunden zwischen den Zeitpunkten, was DST automatisch berücksichtigt:
    // - März (Spring Forward): 02:00→03:00 = 1h weniger in der Nacht
    // - Oktober (Fall Back): 03:00→02:00 = 1h mehr in der Nacht
    //
    // HINWEIS: Das Verhalten ist SYSTEMABHÄNGIG (basiert auf der lokalen Zeitzone).
    // Auf einem Server in UTC würde keine DST-Korrektur erfolgen!
    // Für produktionskritische Anwendungen sollte date-fns-tz verwendet werden.
    // ==========================================================================

    // Optional: Explizite DST-Offset-Prüfung für Debugging/Logging
    const startOffset = start.getTimezoneOffset() // in Minuten (z.B. -60 für CET, -120 für CEST)
    const endOffset = end.getTimezoneOffset()
    const _dstDifferenceMinutes = startOffset - endOffset // Positiv = Zeit "verloren", Negativ = Zeit "gewonnen"

    // Für Debugging: console.log(`DST Check: Start offset ${startOffset}, End offset ${endOffset}, Diff ${_dstDifferenceMinutes} min`)

    // 1. Base Duration - differenceInMinutes berücksichtigt bereits DST korrekt!
    let totalMinutes = differenceInMinutes(end, start)

    // Determine if this shift has standby time
    // Priority: 1) Template from DB, 2) Legacy hardcoded for 'ND'
    const hasStandby = template?.has_standby ?? (type === 'ND')

    if (!hasStandby) {
        return Math.round((totalMinutes / 60) * 100) / 100
    }

    // Get standby configuration (from template or legacy defaults for ND)
    const standbyStartHour = template?.standby_start
        ? parseInt(template.standby_start.split(':')[0])
        : 0
    const standbyStartMin = template?.standby_start
        ? parseInt(template.standby_start.split(':')[1])
        : 30
    const standbyEndHour = template?.standby_end
        ? parseInt(template.standby_end.split(':')[0])
        : 6
    const standbyEndMin = template?.standby_end
        ? parseInt(template.standby_end.split(':')[1])
        : 0
    const standbyFactor = template?.standby_factor ?? 0.5
    const minInterruptionMinutes = template?.interruption_min_minutes ?? 30

    // 2. Define Standby/Readiness Window
    let readinessStart = new Date(start)
    if (start.getHours() >= 12) {
        readinessStart = addDays(readinessStart, 1)
    }
    readinessStart.setHours(standbyStartHour, standbyStartMin, 0, 0)

    let readinessEnd = new Date(readinessStart)
    readinessEnd.setHours(standbyEndHour, standbyEndMin, 0, 0)

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

                // CEIL Rounding: Every "scratched" 30-min block counts as full 30 min
                // Formula: Math.ceil(duration / 30) * 30
                // Examples: 10min→30min, 31min→60min, 45min→60min, 61min→90min
                // See: docs/SHIFT_TIMES.md - Unterbrechungen während Bereitschaft
                const roundedDurationMinutes = Math.ceil(duration / minInterruptionMinutes) * minInterruptionMinutes
                const inflatedEnd = addMinutes(iOverlapStart, roundedDurationMinutes)
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

    // Total = Active Outside + Interruption Credit (Active inside) + Passive Readiness (standbyFactor)
    const totalWeightedMinutes = activeWorkOutsideReadiness + interruptionCreditMinutes + (passiveReadinessMinutes * standbyFactor)

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
        const dateKey = format(date, 'yyyy-MM-dd')

        // Rule: Saved Shift Snapshot (Priority 1 - NEW!)
        // Use the snapshot saved when reporting sick - this preserves shifts even after interests deleted
        // This takes priority so we can show separate entries per shift
        if (absence?.planned_shifts_snapshot && absence.planned_shifts_snapshot.length > 0) {
            const snapshotShifts = absence.planned_shifts_snapshot.filter(s => {
                if (!s.start_time) return false
                return format(parseISO(s.start_time), 'yyyy-MM-dd') === dateKey
            })

            if (snapshotShifts.length > 0) {
                return snapshotShifts.reduce((sum, s) => {
                    return sum + calculateWorkHours(s.start_time, s.end_time, s.type)
                }, 0)
            }
        }

        // Rule: Stored Planned Hours (Priority 2 - ONLY for old absences without snapshot)
        // If we have a snapshot but no shifts on this day, that means no work was planned → return 0.
        // Only fall back to planned_hours average if there is NO snapshot at all.
        if (!absence?.planned_shifts_snapshot || absence.planned_shifts_snapshot.length === 0) {
            if (absence?.planned_hours !== undefined && absence?.planned_hours !== null && Number(absence.planned_hours) > 0) {
                const startDate = absence.start_date ? parseISO(absence.start_date) : date
                const endDate = absence.end_date ? parseISO(absence.end_date) : date
                const totalDays = Math.max(1, differenceInDays(endDate, startDate) + 1)
                return Number(absence.planned_hours) / totalDays
            }
        }

        // Rule: Live Planned Shifts (Priority 3 - Fallback for old absences without snapshot)
        // Rule: Live Planned Shifts (Priority 3 - Fallback for old absences)
        // If no snapshot, check if a shift still exists in the plan for this day.
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

/**
 * PDF SEGMENTATION HACK
 * 
 * Objectives:
 * Break down a shift into strict time segments for the PDF listing.
 * 
 * Rules:
 * 1. WORK: Normal Time
 * 2. STANDBY: 00:30-06:00 (ND Only) minus Interruptions
 * 3. WORK (Interruption): Interruptions within Standby (Inflated + Merged)
 * 4. MIDNIGHT SPLIT: If a segment crosses midnight, it must be split (Handled by caller or here? Let's handle it here for ease)
 * 
 * Returns array of: { start: Date, end: Date, type: 'WORK'|'STANDBY' }
 */
export const getShiftSegments = (startIso, endIso, type, interruptions = []) => {
    if (!startIso || !endIso) return []
    const start = new Date(startIso)
    const end = new Date(endIso)

    // Base segment
    if (type !== 'ND') {
        return [{ start, end, type: 'WORK' }]
    }

    // ND Logic
    let segments = []

    // Define Readiness Window (similar to calculation logic)
    let readinessStart = new Date(start)
    if (start.getHours() >= 12) {
        readinessStart = addDays(readinessStart, 1)
    }
    readinessStart.setHours(0, 30, 0, 0) // 00:30

    let readinessEnd = new Date(readinessStart)
    readinessEnd.setHours(6, 0, 0, 0) // 06:00

    // Overlap with readiness
    const readOverlapStart = max([start, readinessStart])
    const readOverlapEnd = min([end, readinessEnd])

    const hasReadiness = isBefore(readOverlapStart, readOverlapEnd)

    if (!hasReadiness) {
        // Just Work
        segments.push({ start, end, type: 'WORK' })
    } else {
        // 1. Work before Readiness
        if (isBefore(start, readOverlapStart)) {
            segments.push({ start, end: readOverlapStart, type: 'WORK' })
        }

        // 2. Readiness Block (Must handle interruptions!)
        // Get Inflated Interruptions for this block
        const activeIntervals = []
        if (interruptions && interruptions.length > 0) {
            const rawIntervals = []
            interruptions.forEach(int => {
                if (!int.start || !int.end) return
                const iStart = new Date(int.start)
                const iEnd = new Date(int.end)

                // Check overlap with readiness window
                const iOverlapStart = max([iStart, readOverlapStart])
                const iOverlapEnd = min([iEnd, readOverlapEnd])

                if (isBefore(iOverlapStart, iOverlapEnd)) {
                    // Inflate (Visual needs the full inflated block as "WORK")
                    const inflatedEnd = max([iOverlapEnd, addMinutes(iOverlapStart, 30)])
                    // Clip to readiness end (Visual shouldn't spill over readiness for this logic block normally, but strictly speaking inflation extends work... let's keep it simple: clip to actual shift end or readiness end?)
                    // If inflation goes past 06:00, it becomes Work anyway. 
                    // Simplification: Clip to Readiness End for "Interruption" label, or let it flow?
                    // Let's clip to Readiness End to keep the "Standby" column logic clean.
                    // Any work after 06:00 is handled by step 3.
                    const effectiveEnd = min([inflatedEnd, readOverlapEnd])

                    rawIntervals.push({ start: iOverlapStart, end: effectiveEnd })
                }
            })

            // Merge
            if (rawIntervals.length > 0) {
                rawIntervals.sort((a, b) => a.start - b.start)
                let merged = [rawIntervals[0]]
                for (let i = 1; i < rawIntervals.length; i++) {
                    let last = merged[merged.length - 1]
                    let cur = rawIntervals[i]
                    if (cur.start < last.end) {
                        last.end = max([last.end, cur.end])
                    } else {
                        merged.push(cur)
                    }
                }
                activeIntervals.push(...merged)
            }
        }

        // Fill Readiness Block with STANDBY vs WORK
        let cursor = new Date(readOverlapStart)
        activeIntervals.forEach(int => {
            // Standby before this interruption?
            if (isBefore(cursor, int.start)) {
                segments.push({ start: new Date(cursor), end: new Date(int.start), type: 'STANDBY' })
            }
            // The interruption (WORK)
            segments.push({ start: new Date(int.start), end: new Date(int.end), type: 'WORK' })
            cursor = new Date(int.end)
        })
        // Remaining Standby after last interruption
        if (isBefore(cursor, readOverlapEnd)) {
            segments.push({ start: new Date(cursor), end: new Date(readOverlapEnd), type: 'STANDBY' })
        }

        // 3. Work after Readiness
        if (isBefore(readOverlapEnd, end)) {
            segments.push({ start: readOverlapEnd, end, type: 'WORK' })
        }
    }

    // FINAL PASS: Split at Midnight (00:00:00)
    // Only needed if a segment crosses it.
    // Logic: Iterate generated segments, check for midnight crossing.
    const finalSegments = []

    segments.forEach(seg => {
        const s = seg.start
        const e = seg.end

        // Check for midnight crossing
        // (If start day != end day)
        // Caveat: What if span serves multiple days? (Unlikely for single shift, max 24h usually)
        // Check if there is a midnight between s and e.
        const sMidnight = new Date(s)
        sMidnight.setHours(24, 0, 0, 0) // Midnight of start day

        if (isBefore(s, sMidnight) && isBefore(sMidnight, e)) {
            // Split!
            finalSegments.push({ start: s, end: sMidnight, type: seg.type })
            finalSegments.push({ start: sMidnight, end: e, type: seg.type })
        } else {
            finalSegments.push(seg)
        }
    })

    return finalSegments
}
