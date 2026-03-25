import { startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, subDays, isSameMonth, getYear, endOfDay } from 'date-fns'
import { calculateWorkHours, calculateDailyAbsenceHours, processInterruptions } from './timeCalculations'
import { getHolidays, isHoliday } from './holidays'

const SHIFT_TYPE_KEYS = ['TD', 'TD1', 'TD2', 'ND', 'DBD', 'AST', 'TEAM', 'FORTBILDUNG', 'EINSCHULUNG', 'MITARBEITERGESPRAECH', 'SONSTIGES', 'SUPERVISION']

const normalizeShiftType = (type) => {
    if (!type) return null
    const up = type.toUpperCase()
    if (up === 'NACHT' || up === 'NACHTDIENST') return 'ND'
    if (up === 'TAGDIENST') return 'TD1'
    if (up === 'DOPPELDIENST') return 'DBD'
    if (up === 'TEAMSITZUNG') return 'TEAM'
    if (up === 'ANLAUFSTELLE') return 'AST'
    return SHIFT_TYPE_KEYS.includes(up) ? up : null
}

const createEmptyShiftTypeHours = () => {
    const obj = {}
    SHIFT_TYPE_KEYS.forEach(k => { obj[k] = { hours: 0, count: 0 } })
    return obj
}

/** Collect weekday absence date-strings within a range (used to exclude TEAM shifts on absence days) */
const collectAbsenceDays = (absences, rangeStart, rangeEnd) => {
    const days = new Set()
    absences.forEach(abs => {
        if (!abs.start_date || !abs.end_date) return
        const absStart = new Date(abs.start_date)
        const absEnd = new Date(abs.end_date)
        if (Number.isNaN(absStart.getTime()) || Number.isNaN(absEnd.getTime())) return
        const start = absStart < rangeStart ? rangeStart : absStart
        const end = absEnd > rangeEnd ? rangeEnd : absEnd
        if (start <= end) {
            eachDayOfInterval({ start, end }).forEach(d => {
                if (!isWeekend(d)) days.add(d.toISOString().split('T')[0])
            })
        }
    })
    return days
}

/** Calculate total absence minutes within a range, optionally tracking breakdown */
const calculateAbsenceMinutes = (absences, rangeStart, rangeEnd, historyShifts, profile, absenceBreakdown) => {
    let minutes = 0
    absences.forEach(abs => {
        if (!abs.start_date || !abs.end_date) return
        const absStart = new Date(abs.start_date)
        const absEnd = new Date(abs.end_date)
        if (Number.isNaN(absStart.getTime()) || Number.isNaN(absEnd.getTime())) return
        const start = absStart < rangeStart ? rangeStart : absStart
        const end = absEnd > rangeEnd ? rangeEnd : absEnd
        if (start > end || absStart > rangeEnd || absEnd < rangeStart) return

        if (abs.planned_hours && Number(abs.planned_hours) > 0) {
            const absHours = Number(abs.planned_hours)
            minutes += absHours * 60
            if (absenceBreakdown) {
                const absType = (abs.type === 'Krank' || abs.type === 'Krankenstand') ? 'Krank' : 'Urlaub'
                if (absenceBreakdown[absType]) absenceBreakdown[absType].hours += absHours
            }
        } else {
            eachDayOfInterval({ start, end }).forEach(day => {
                const hours = calculateDailyAbsenceHours(day, abs, historyShifts, profile)
                minutes += hours * 60
                if (absenceBreakdown && hours > 0) {
                    const absType = (abs.type === 'Krank' || abs.type === 'Krankenstand') ? 'Krank' : 'Urlaub'
                    if (absenceBreakdown[absType]) {
                        absenceBreakdown[absType].hours += hours
                        absenceBreakdown[absType].days += 1
                    }
                }
            })
        }
    })
    return minutes
}

export const calculateGenericBalance = (profile, historyShifts, historyAbsences, timeEntries = [], currentDate = new Date(), corrections = [], options = {}) => {
    if (!profile) return null

    const startDate = profile.start_date ? new Date(profile.start_date) : new Date('2024-01-01')
    if (Number.isNaN(startDate.getTime())) return null

    const weeklyHours = profile.weekly_hours || 40
    const dailyHours = weeklyHours / 5

    const holidayCache = {}
    const getHols = (year) => {
        if (!holidayCache[year]) holidayCache[year] = getHolidays(year)
        return holidayCache[year]
    }
    const checkIsHoliday = (date) => {
        const hols = getHols(getYear(date))
        return isHoliday(date, hols)
    }

    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)

    const entryMap = {}
    timeEntries.forEach(e => { if (e.shift_id) entryMap[e.shift_id] = e })

    const getShiftDurationMinutes = (shift) => {
        const entry = entryMap[shift.id]
        if (entry && (entry.calculated_hours || entry.calculated_hours === 0)) return entry.calculated_hours * 60
        if (!shift.start_time || !shift.end_time) return 0

        let type = shift.type
        if (type) {
            const up = type.toUpperCase()
            if (up === 'NACHT' || up === 'NACHTDIENST') type = 'ND'
        }
        return calculateWorkHours(shift.start_time, shift.end_time, type) * 60
    }

    // --- 1. Current Month ---
    // Ensure we respect the start date if it falls in the current month
    const effectiveMonthStart = startDate > monthStart ? startDate : monthStart

    // If the effective start is after the month end (future employee), target is 0
    let targetMinutes = 0
    if (effectiveMonthStart <= monthEnd) {
        const daysInMonth = eachDayOfInterval({ start: effectiveMonthStart, end: monthEnd })
        const workDays = daysInMonth.filter(d => !isWeekend(d) && !checkIsHoliday(d)).length
        targetMinutes = workDays * dailyHours * 60
    }

    // Collect absence days for current month to exclude TEAM shifts on those days
    const absenceDays = collectAbsenceDays(historyAbsences, monthStart, monthEnd)

    let currentMonthShifts = historyShifts.filter(s => {
        if (!s.start_time) return false
        const d = new Date(s.start_time)
        if (Number.isNaN(d.getTime()) || !isSameMonth(d, currentDate) || d < startDate) return false
        // Exclude TEAM shifts on days with absences (vacation/sick) to avoid double counting
        if (s.type?.toUpperCase() === 'TEAM') {
            const dateKey = d.toISOString().split('T')[0]
            if (absenceDays.has(dateKey)) return false
        }
        return true
    })

    let actualMinutes = 0

    // Detailed mode tracking
    const detailed = options.detailed === true
    const shiftTypeHours = detailed ? createEmptyShiftTypeHours() : null
    const absenceBreakdown = detailed ? { Urlaub: { hours: 0, days: 0 }, Krank: { hours: 0, days: 0 } } : null
    const interruptionStats = detailed ? { count: 0, netGainHours: 0 } : null

    const trackShiftType = (type, hours, count = 1) => {
        if (!detailed) return
        const norm = normalizeShiftType(type)
        if (norm && shiftTypeHours[norm]) {
            shiftTypeHours[norm].hours += hours
            shiftTypeHours[norm].count += count
        }
    }

    const trackInterruptions = (entry) => {
        if (!detailed || !entry?.interruptions?.length) return
        interruptionStats.count += entry.interruptions.length
    }

    // Group shifts by date to detect TD1+TD2 combinations
    const shiftsByDate = {}
    currentMonthShifts.forEach(shift => {
        const dateKey = new Date(shift.start_time).toISOString().split('T')[0]
        if (!shiftsByDate[dateKey]) shiftsByDate[dateKey] = []
        shiftsByDate[dateKey].push(shift)
    })

    const processedShiftIds = new Set()

    Object.values(shiftsByDate).forEach(dayShifts => {
        const td1 = dayShifts.find(s => s.type?.toUpperCase() === 'TD1' || s.type?.toUpperCase() === 'TAGDIENST')
        const td2 = dayShifts.find(s => s.type?.toUpperCase() === 'TD2')

        if (td1 && td2) {
            // Same person doing both TD1 and TD2 - use time_entries if available
            const td1Entry = entryMap[td1.id]
            const td2Entry = entryMap[td2.id]

            // Detect merged entries: TimeTracking saves combined hours to BOTH entries
            // with identical actual_start/actual_end when editing as merged "TD"
            const isMerged = td1Entry && td2Entry
                && td1Entry.actual_start && td2Entry.actual_start
                && td1Entry.actual_start === td2Entry.actual_start
                && td1Entry.actual_end === td2Entry.actual_end

            if (isMerged) {
                // Both entries have the same combined calculated_hours — use once
                const mergedHours = td1Entry.calculated_hours || 0
                actualMinutes += mergedHours * 60
                trackShiftType('TD', mergedHours, 1)
                trackInterruptions(td1Entry)
                trackInterruptions(td2Entry)
            } else {
                // Individual entries — add both minus handover overlap
                const td1Hours = td1Entry?.calculated_hours !== undefined
                    ? td1Entry.calculated_hours
                    : calculateWorkHours(td1.start_time, td1.end_time, 'TD1')

                const td2Hours = td2Entry?.calculated_hours !== undefined
                    ? td2Entry.calculated_hours
                    : calculateWorkHours(td2.start_time, td2.end_time, 'TD2')

                actualMinutes += (td1Hours + td2Hours) * 60
                // Eliminate handover overlap when same person works both TD1+TD2
                const td1End = new Date(td1.end_time)
                const td2Start = new Date(td2.start_time)
                const overlapMs = Math.max(0, td1End - td2Start)
                const overlapMinutes = overlapMs / (1000 * 60)
                actualMinutes -= overlapMinutes
                trackShiftType('TD1', td1Hours, 1)
                trackShiftType('TD2', td2Hours - (overlapMinutes / 60), 1)
                trackInterruptions(td1Entry)
                trackInterruptions(td2Entry)
            }
            processedShiftIds.add(td1.id)
            processedShiftIds.add(td2.id)
        }
    })

    // Add all other shifts (not part of TD1+TD2 combination)
    currentMonthShifts.forEach(s => {
        if (!processedShiftIds.has(s.id)) {
            const mins = getShiftDurationMinutes(s)
            actualMinutes += mins
            trackShiftType(s.type, mins / 60, 1)
            trackInterruptions(entryMap[s.id])
        }
    })

    const vacationMinutes = calculateAbsenceMinutes(
        historyAbsences, monthStart, monthEnd, historyShifts, profile,
        detailed ? absenceBreakdown : null
    )




    // --- 2. Carryover (Past) ---
    const pastEnd = endOfDay(subDays(monthStart, 1))
    let carryoverMinutes = 0

    if (startDate <= pastEnd) {
        const pastDays = eachDayOfInterval({ start: startDate, end: pastEnd })
        const pastWorkDays = pastDays.filter(d => !isWeekend(d) && !checkIsHoliday(d)).length
        const pastTarget = pastWorkDays * dailyHours * 60

        // Collect past absence days to exclude TEAM shifts on those days
        const pastAbsenceDays = collectAbsenceDays(historyAbsences, startDate, pastEnd)

        let pastActual = 0
        const pastShifts = []
        historyShifts.forEach(s => {
            if (!s.start_time) return
            const start = new Date(s.start_time)
            if (Number.isNaN(start.getTime())) return
            if (start >= startDate && start <= pastEnd) {
                // Exclude TEAM shifts on days with absences
                if (s.type?.toUpperCase() === 'TEAM') {
                    const dateKey = start.toISOString().split('T')[0]
                    if (pastAbsenceDays.has(dateKey)) return
                }
                pastShifts.push(s)
            }
        })

        // Group past shifts by date to detect TD1+TD2 combinations
        const pastShiftsByDate = {}
        pastShifts.forEach(shift => {
            const dateKey = new Date(shift.start_time).toISOString().split('T')[0]
            if (!pastShiftsByDate[dateKey]) pastShiftsByDate[dateKey] = []
            pastShiftsByDate[dateKey].push(shift)
        })

        const processedPastIds = new Set()

        Object.values(pastShiftsByDate).forEach(dayShifts => {
            const td1 = dayShifts.find(s => s.type?.toUpperCase() === 'TD1' || s.type?.toUpperCase() === 'TAGDIENST')
            const td2 = dayShifts.find(s => s.type?.toUpperCase() === 'TD2')

            if (td1 && td2) {
                // Same person doing both TD1 and TD2 - use time_entries if available
                const td1Entry = entryMap[td1.id]
                const td2Entry = entryMap[td2.id]

                const td1Hours = td1Entry?.calculated_hours !== undefined
                    ? td1Entry.calculated_hours
                    : calculateWorkHours(td1.start_time, td1.end_time, 'TD1')

                const td2Hours = td2Entry?.calculated_hours !== undefined
                    ? td2Entry.calculated_hours
                    : calculateWorkHours(td2.start_time, td2.end_time, 'TD2')

                pastActual += (td1Hours + td2Hours) * 60
                // Eliminate handover overlap when same person works both TD1+TD2
                const td1End = new Date(td1.end_time)
                const td2Start = new Date(td2.start_time)
                const overlapMs = Math.max(0, td1End - td2Start)
                pastActual -= overlapMs / (1000 * 60)
                processedPastIds.add(td1.id)
                processedPastIds.add(td2.id)
            }
        })

        // Add all other past shifts (not part of TD1+TD2 combination)
        pastShifts.forEach(s => {
            if (!processedPastIds.has(s.id)) {
                pastActual += getShiftDurationMinutes(s)
            }
        })

        const pastVacation = calculateAbsenceMinutes(
            historyAbsences, startDate, pastEnd, historyShifts, profile, null
        )
        carryoverMinutes = (pastActual + pastVacation) - pastTarget
    }

    // Initial balance from profile (for migrated employees with existing hour balances)
    // This is added to carryover because it represents historical balance before app usage
    const initialBalanceMinutes = (profile.initial_balance || 0) * 60

    // Past month corrections — must be included in carryover so they carry forward
    const pastCorrections = corrections.filter(c => {
        if (!c.effective_month) return false
        const effectiveMonth = new Date(c.effective_month)
        return effectiveMonth < monthStart
    })
    const pastCorrectionMinutes = pastCorrections.reduce((sum, c) => sum + (parseFloat(c.correction_hours) || 0) * 60, 0)

    const totalCarryoverMinutes = carryoverMinutes + initialBalanceMinutes + pastCorrectionMinutes

    // Admin corrections for the current month - ADDED TO ACTUAL (Ist)
    // This makes corrections affect the "worked hours" and thus also the carryover for next month
    const currentMonthCorrections = corrections.filter(c => {
        if (!c.effective_month) return false
        const effectiveMonth = new Date(c.effective_month)
        return isSameMonth(effectiveMonth, currentDate)
    })
    const correctionMinutes = currentMonthCorrections.reduce((sum, c) => sum + (parseFloat(c.correction_hours) || 0) * 60, 0)

    // Correction is added to actual minutes (Ist)
    const correctedActualMinutes = actualMinutes + correctionMinutes
    const correctedDiffMinutes = (correctedActualMinutes + vacationMinutes) - targetMinutes

    const totalDiffMinutes = correctedDiffMinutes + totalCarryoverMinutes
    const toFixedNum = (num) => Math.round(num * 100) / 100

    const result = {
        target: toFixedNum(targetMinutes / 60),
        actual: toFixedNum(correctedActualMinutes / 60),  // Now includes corrections
        vacation: toFixedNum(vacationMinutes / 60),
        diff: toFixedNum(correctedDiffMinutes / 60),
        carryover: toFixedNum(totalCarryoverMinutes / 60),
        correction: toFixedNum(correctionMinutes / 60),
        total: toFixedNum(totalDiffMinutes / 60)
    }

    if (detailed) {
        // Round all shiftTypeHours
        SHIFT_TYPE_KEYS.forEach(k => {
            shiftTypeHours[k].hours = toFixedNum(shiftTypeHours[k].hours)
        })

        // Calculate interruption net gain from time entries with interruptions
        let totalInterruptionNetGainMinutes = 0
        timeEntries.forEach(entry => {
            if (!entry.interruptions?.length || !entry.shift_id) return
            const shift = currentMonthShifts.find(s => s.id === entry.shift_id)
            if (!shift) return
            const type = normalizeShiftType(shift.type)
            if (type !== 'ND') return
            // Get standby config (same logic as calculateWorkHours)
            const start = new Date(shift.start_time)
            let readinessStart = new Date(start)
            if (start.getHours() >= 12) readinessStart = new Date(start.getTime() + 86400000)
            readinessStart.setHours(0, 30, 0, 0)
            let readinessEnd = new Date(readinessStart)
            readinessEnd.setHours(6, 0, 0, 0)
            const intResult = processInterruptions(entry.interruptions, readinessStart, readinessEnd)
            totalInterruptionNetGainMinutes += (intResult.creditedMinutes - intResult.deductedReadinessMinutes * 0.5)
        })
        interruptionStats.netGainHours = toFixedNum(totalInterruptionNetGainMinutes / 60)

        // Round absence hours
        Object.values(absenceBreakdown).forEach(v => { v.hours = toFixedNum(v.hours) })

        result.shiftTypeHours = shiftTypeHours
        result.absenceBreakdown = absenceBreakdown
        result.interruptions = interruptionStats
    }

    return result
}
