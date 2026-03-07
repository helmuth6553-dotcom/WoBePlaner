import { startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, subDays, isSameMonth, getYear, endOfDay } from 'date-fns'
import { calculateWorkHours, calculateDailyAbsenceHours } from './timeCalculations'
import { getHolidays, isHoliday } from './holidays'

export const calculateGenericBalance = (profile, historyShifts, historyAbsences, timeEntries = [], currentDate = new Date(), corrections = []) => {
    if (!profile) return null

    const startDate = profile.start_date ? new Date(profile.start_date) : (profile.created_at ? new Date(profile.created_at) : new Date('2024-01-01'))
    if (isNaN(startDate.getTime())) return null

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

    let currentMonthShifts = historyShifts.filter(s => {
        if (!s.start_time) return false
        const d = new Date(s.start_time)
        return !isNaN(d.getTime()) && isSameMonth(d, currentDate) && d >= startDate
    })

    let actualMinutes = 0

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

            const td1Hours = td1Entry?.calculated_hours !== undefined
                ? td1Entry.calculated_hours
                : calculateWorkHours(td1.start_time, td1.end_time, 'TD1')

            const td2Hours = td2Entry?.calculated_hours !== undefined
                ? td2Entry.calculated_hours
                : calculateWorkHours(td2.start_time, td2.end_time, 'TD2')

            actualMinutes += (td1Hours + td2Hours) * 60
            processedShiftIds.add(td1.id)
            processedShiftIds.add(td2.id)
        }
    })

    // Add all other shifts (not part of TD1+TD2 combination)
    currentMonthShifts.forEach(s => {
        if (!processedShiftIds.has(s.id)) {
            actualMinutes += getShiftDurationMinutes(s)
        }
    })

    let vacationMinutes = 0
    historyAbsences.forEach(abs => {
        if (!abs.start_date || !abs.end_date) return
        const absStart = new Date(abs.start_date)
        const absEnd = new Date(abs.end_date)
        if (isNaN(absStart.getTime()) || isNaN(absEnd.getTime())) return

        // CHECK IF ABSENCE FALLS INTO CURRENT MONTH
        // We only care if there is an overlap.
        // However, if we have a "Paunchal-Wert" (planned_hours), we need to decide where to book it.
        // Simple rule: We book the Full Amount if the START DATE is in this month. 
        // Or pro-rate it? Pro-rating stored total hours is hard without metadata.
        // For now: If overlap exists, we check if we handle days individually or lump sum.

        const start = absStart < monthStart ? monthStart : absStart
        const end = absEnd > monthEnd ? monthEnd : absEnd

        if (start <= end && (absStart <= monthEnd && absEnd >= monthStart)) {


            // Rule: If we have pre-calculated/stored hours (e.g. from Sick Report), use them directly!
            // But only if the absence started in this month (to avoid double counting across month boundaries for long illnesses? 
            // Actually, handleSickReport calculates usually per shift. 
            // If illness spans months, we have a Total. We must allocate it. 
            // BUT: SickReport stores hours for the DELETED SHIFTS.
            // So if I was sick 3 days, and had shifts on day 1 (in Jan) and day 3 (in Feb),
            // planned_hours is the Sum.
            // This is tricky.
            // Safest bet for now (User Case): Single Day or Short term.
            // Let's stick to: If planned_hours is set, add it ONCE per absence record.
            // BUT we must effectively verify if the "relevant part" is in this month.
            // Let's assume for now sickness doesn't span months typically with this tool or we accept the edge case.

            // BETTER APPROACH to avoid double counting and complex dates:
            // Revert to per-day calculation BUT feed the SSOT correctly.
            // EXCEPT: SSOT failed us.

            // Let's do the "Direct Use" ONLY if planned_hours is present.
            // And to handle months: calculating 'daily average of the planned sum' is risky.

            if (abs.planned_hours && Number(abs.planned_hours) > 0) {
                // Check if we already processed this absence ID to avoid adding it multiple times if we loop? 
                // We rely on the outer forEach(abs). So we visit each absence once.
                // We add the hours IF there is any overlap with the month.
                // To prevent adding FULL amount if only 1 day overlaps of a 30 day illness (unlikely for Shift-Sickness):
                // We accept that for "Sick with Shifts", the hours belong to the specific dates.
                // Since we lost the specific dates of the shifts (shifts are deleted), we can't map them perfectly back.
                // FAILSAFE: Just add the hours.
                vacationMinutes += (Number(abs.planned_hours) * 60)
            } else {
                // Fallback to per-day calculation (Standard Logic / Vacation)
                const days = eachDayOfInterval({ start, end })
                days.forEach(day => {
                    const hours = calculateDailyAbsenceHours(day, abs, historyShifts, profile)
                    vacationMinutes += (hours * 60)
                })
            }
        }
    })




    // --- 2. Carryover (Past) ---
    const pastEnd = endOfDay(subDays(monthStart, 1))
    let carryoverMinutes = 0

    if (startDate <= pastEnd) {
        const pastDays = eachDayOfInterval({ start: startDate, end: pastEnd })
        const pastWorkDays = pastDays.filter(d => !isWeekend(d) && !checkIsHoliday(d)).length
        const pastTarget = pastWorkDays * dailyHours * 60

        let pastActual = 0
        const pastShifts = []
        historyShifts.forEach(s => {
            if (!s.start_time) return
            const start = new Date(s.start_time)
            if (isNaN(start.getTime())) return
            if (start >= startDate && start <= pastEnd) {
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

        let pastVacation = 0
        historyAbsences.forEach(abs => {
            if (!abs.start_date || !abs.end_date) return
            const absStart = new Date(abs.start_date)
            const absEnd = new Date(abs.end_date)
            if (isNaN(absStart.getTime()) || isNaN(absEnd.getTime())) return
            const start = absStart < startDate ? startDate : absStart
            const end = absEnd > pastEnd ? pastEnd : absEnd
            if (start <= end) {
                if (abs.planned_hours && Number(abs.planned_hours) > 0) {
                    pastVacation += (Number(abs.planned_hours) * 60)
                } else {
                    const days = eachDayOfInterval({ start, end })
                    days.forEach(day => {
                        // SINGLE SOURCE OF TRUTH (Carryover)
                        const hours = calculateDailyAbsenceHours(day, abs, historyShifts, profile)
                        pastVacation += (hours * 60)
                    })
                }
            }
        })
        carryoverMinutes = (pastActual + pastVacation) - pastTarget
    }

    // Initial balance from profile (for migrated employees with existing hour balances)
    // This is added to carryover because it represents historical balance before app usage
    const initialBalanceMinutes = (profile.initial_balance || 0) * 60
    const totalCarryoverMinutes = carryoverMinutes + initialBalanceMinutes

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

    return {
        target: toFixedNum(targetMinutes / 60),
        actual: toFixedNum(correctedActualMinutes / 60),  // Now includes corrections
        vacation: toFixedNum(vacationMinutes / 60),
        diff: toFixedNum(correctedDiffMinutes / 60),
        carryover: toFixedNum(totalCarryoverMinutes / 60),
        correction: toFixedNum(correctionMinutes / 60),
        total: toFixedNum(totalDiffMinutes / 60)
    }
}
