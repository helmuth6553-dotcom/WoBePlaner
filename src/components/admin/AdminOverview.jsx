import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { format, startOfMonth, endOfMonth, subMonths, addMonths, startOfYear, endOfYear } from 'date-fns'
import { de } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, BarChart3, Activity, Users, Thermometer, Clock, TrendingUp, ArrowLeftRight, Target, Scale, ChevronDown, ChevronUp, Plane, Calendar, User, Moon, CalendarDays, BellRing, AlertTriangle, GraduationCap, Hourglass, Maximize, Tent } from 'lucide-react'
import { calculateWorkHours, processInterruptions } from '../../utils/timeCalculations'
import { getHolidays, isHoliday } from '../../utils/holidays'
import { eachDayOfInterval, isWeekend, getDay, differenceInDays, getYear } from 'date-fns'

/**
 * AdminOverview - Dashboard Statistics
 * Shows aggregated hours by shift type, sick leave breakdown, and counts
 */
export default function AdminOverview() {
    const [selectedMonth, setSelectedMonth] = useState(new Date())
    const [stats, setStats] = useState(null)
    const [employeeStats, setEmployeeStats] = useState([])
    const [loading, setLoading] = useState(true)
    const [showWorkedDetails, setShowWorkedDetails] = useState(false)
    const [showSickDetails, setShowSickDetails] = useState(false)
    const [viewMode, setViewMode] = useState('team') // 'team', 'employee', 'year'
    const [expandedEmployeeIds, setExpandedEmployeeIds] = useState([])

    const toggleEmployeeExpansion = (empId) => {
        setExpandedEmployeeIds(prev =>
            prev.includes(empId)
                ? prev.filter(id => id !== empId)
                : [...prev, empId]
        )
    }

    useEffect(() => {
        fetchStats()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMonth, viewMode])

    const fetchStats = async () => {
        setLoading(true)

        // Determine date range based on viewMode
        const start = viewMode === 'year' ? startOfYear(selectedMonth) : startOfMonth(selectedMonth)
        const end = viewMode === 'year' ? endOfYear(selectedMonth) : endOfMonth(selectedMonth)
        const startStr = start.toISOString()
        const endStr = end.toISOString()
        const startDateStr = format(start, 'yyyy-MM-dd')
        const endDateStr = format(end, 'yyyy-MM-dd')

        try {
            // 1. Fetch all shifts in the month
            const { data: shifts } = await supabase
                .from('shifts')
                .select('*')
                .gte('start_time', startStr)
                .lte('start_time', endStr)

            // 1b. Fetch all employee profiles (non-admin)
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, weekly_hours, role')
                .or('is_active.eq.true,is_active.is.null')

            // 2. Fetch time entries for these shifts
            const { data: entries } = await supabase
                .from('time_entries')
                .select('*, shifts(*)')
                .gte('actual_start', startStr)
                .lte('actual_start', endStr)

            // 3. Fetch absences with snapshots
            const { data: absences } = await supabase
                .from('absences')
                .select('*')
                .eq('status', 'genehmigt')
                .lte('start_date', endDateStr)
                .gte('end_date', startDateStr)

            // 4. Fetch flex shift interests (for counting)
            const { data: interests } = await supabase
                .from('shift_interests')
                .select('*, shifts(*)')

            // Filter interests to this month
            const monthInterests = interests?.filter(i => {
                if (!i.shifts?.start_time) return false
                const shiftDate = new Date(i.shifts.start_time)
                return shiftDate >= start && shiftDate <= end
            }) || []

            // 5. Fetch shift swaps from shift_logs
            const { data: shiftLogs } = await supabase
                .from('shift_logs')
                .select('*, shift:shifts(start_time)')

            // Filter logs to this month
            const monthSwaps = shiftLogs?.filter(log => {
                if (!log.shift?.start_time) return false
                const shiftDate = new Date(log.shift.start_time)
                return shiftDate >= start && shiftDate <= end
            }) || []

            // Calculate statistics
            const shiftHours = {
                TD: 0, TD1: 0, TD2: 0, ND: 0, DBD: 0, TEAM: 0, FORTBILDUNG: 0, EINSCHULUNG: 0, MITARBEITERGESPRAECH: 0, SONSTIGES: 0
            }
            const sickHours = {
                TD1: 0, TD2: 0, ND: 0, DBD: 0, TEAM: 0, FORTBILDUNG: 0, EINSCHULUNG: 0, MITARBEITERGESPRAECH: 0, SONSTIGES: 0
            }
            let flexCount = 0
            let sickCount = 0
            let swapCount = monthSwaps.length

            // Calculate total planned shift hours (what the Dienstplan offers)
            let totalPlannedHours = 0
            shifts?.forEach(shift => {
                if (shift.type !== 'TEAM' && shift.type !== 'FORTBILDUNG' && shift.type !== 'EINSCHULUNG' && shift.type !== 'MITARBEITERGESPRAECH' && shift.type !== 'SONSTIGES') {
                    // Personal shifts - count once
                    totalPlannedHours += calculateWorkHours(shift.start_time, shift.end_time, shift.type)
                }
            })

            // Add TEAM hours (times number of employees)
            const employees = profiles?.filter(p => p.role !== 'admin') || []
            const teamShifts = shifts?.filter(s => s.type === 'TEAM') || []
            teamShifts.forEach(shift => {
                const teamHours = calculateWorkHours(shift.start_time, shift.end_time, shift.type)
                totalPlannedHours += teamHours * employees.length
            })

            // Add FORTBILDUNG/EINSCHULUNG hours (per participant from interests)
            const optInShifts = shifts?.filter(s => s.type === 'FORTBILDUNG' || s.type === 'EINSCHULUNG' || s.type === 'MITARBEITERGESPRAECH' || s.type === 'SONSTIGES') || []
            optInShifts.forEach(shift => {
                const optInHours = calculateWorkHours(shift.start_time, shift.end_time, shift.type)
                // Count interests for this shift
                const participantCount = monthInterests.filter(i => i.shift_id === shift.id).length
                totalPlannedHours += optInHours * participantCount
            })

            // Calculate total Soll hours for all employees
            // Soll = weekly_hours * (working days in month / 5)
            const daysInMonth = eachDayOfInterval({ start, end })
            const holidays = getHolidays(getYear(start))
            const workingDays = daysInMonth.filter(d => !isWeekend(d) && !isHoliday(d, holidays)).length
            const weeksInMonth = workingDays / 5

            let totalSollHours = 0
            employees.forEach(emp => {
                const weeklyHours = emp.weekly_hours || 40
                totalSollHours += weeklyHours * weeksInMonth
            })

            // Process confirmed/worked entries — with TD1+TD2 merged detection
            // Group entries by user+date to detect merged TD1+TD2 pairs
            const processedEntryIds = new Set()
            const entriesByUserDate = {}
            entries?.forEach(entry => {
                if (!entry.shifts || !entry.calculated_hours) return
                const type = entry.shifts.type?.toUpperCase()
                if (type !== 'TD1' && type !== 'TD2') return
                const dateKey = new Date(entry.shifts.start_time).toISOString().split('T')[0]
                const key = `${entry.user_id}_${dateKey}`
                if (!entriesByUserDate[key]) entriesByUserDate[key] = []
                entriesByUserDate[key].push(entry)
            })

            // Handle merged TD1+TD2 pairs (both have identical actual_start/actual_end)
            Object.values(entriesByUserDate).forEach(dayEntries => {
                const td1 = dayEntries.find(e => e.shifts.type?.toUpperCase() === 'TD1')
                const td2 = dayEntries.find(e => e.shifts.type?.toUpperCase() === 'TD2')
                if (td1 && td2) {
                    const isMerged = td1.actual_start && td2.actual_start
                        && td1.actual_start === td2.actual_start
                        && td1.actual_end === td2.actual_end
                    if (isMerged) {
                        // Count only once as combined TD
                        if (!shiftHours['TD']) shiftHours['TD'] = 0
                        shiftHours['TD'] += Number(td1.calculated_hours) || 0
                        processedEntryIds.add(td1.id)
                        processedEntryIds.add(td2.id)
                    }
                }
            })

            // Process remaining entries normally
            entries?.forEach(entry => {
                if (processedEntryIds.has(entry.id)) return
                if (entry.shifts && entry.calculated_hours) {
                    const type = entry.shifts.type?.toUpperCase()
                    if (Object.hasOwn(shiftHours, type)) {
                        shiftHours[type] += Number(entry.calculated_hours) || 0
                    }
                }
            })

            // Process absences with snapshots
            absences?.forEach(abs => {
                const isSick = abs.type === 'Krank' || abs.type === 'Krankenstand'
                if (isSick) {
                    sickCount++

                    // Use snapshot to count hours by original shift type
                    if (abs.planned_shifts_snapshot && abs.planned_shifts_snapshot.length > 0) {
                        abs.planned_shifts_snapshot.forEach(shift => {
                            const type = shift.type?.toUpperCase()
                            if (Object.hasOwn(sickHours, type)) {
                                const hours = calculateWorkHours(shift.start_time, shift.end_time, shift.type)
                                sickHours[type] += hours
                            }
                        })
                    } else if (abs.planned_hours) {
                        // Fallback: distribute evenly if no snapshot (shouldn't happen for new absences)
                        // Just count total sick hours as "unknown"
                    }
                }
            })

            // Calculate vacation hours
            let totalVacationHours = 0
            absences?.forEach(abs => {
                const isVacation = abs.type === 'Urlaub'
                if (isVacation) {
                    // Calculate working days in vacation range within this month
                    const absStart = new Date(abs.start_date) < start ? start : new Date(abs.start_date)
                    const absEnd = new Date(abs.end_date) > end ? end : new Date(abs.end_date)
                    if (absStart <= absEnd) {
                        const vacDays = eachDayOfInterval({ start: absStart, end: absEnd })
                        const vacWorkDays = vacDays.filter(d => !isWeekend(d) && !isHoliday(d, holidays)).length
                        // Find user's daily hours
                        const userProfile = employees.find(e => e.id === abs.user_id)
                        const dailyHours = (userProfile?.weekly_hours || 40) / 5
                        totalVacationHours += vacWorkDays * dailyHours
                    }
                }
            })

            // Count flex shifts (shifts that were marked urgent and picked up, OR have manual is_flex)
            const urgentShifts = shifts?.filter(s => s.urgent_since) || []

            // Automatic FLEX: urgent shifts that have been picked up
            const automaticFlexShiftIds = urgentShifts.filter(s => {
                const shiftInterests = monthInterests.filter(i => i.shift_id === s.id)
                return shiftInterests.length > 0
            }).map(s => s.id)

            // Manual FLEX: any interest with is_flex = true
            const manualFlexShiftIds = monthInterests
                .filter(i => i.is_flex === true)
                .map(i => i.shift_id)

            // Combine and count unique shift IDs
            const allFlexShiftIds = new Set([...automaticFlexShiftIds, ...manualFlexShiftIds])
            flexCount = allFlexShiftIds.size

            // === NEW METRICS ===

            // 1. Interruptions — use processInterruptions() for accurate credited hours
            let totalInterruptionCount = 0
            let totalInterruptionCreditedHours = 0
            let totalInterruptionNetGain = 0
            entries?.forEach(entry => {
                if (entry.interruptions && Array.isArray(entry.interruptions) && entry.interruptions.length > 0) {
                    // Build readiness window (same logic as timeCalculations.js)
                    const shiftStart = new Date(entry.actual_start || entry.shifts?.start_time)
                    if (isNaN(shiftStart.getTime())) return

                    let rStart = new Date(shiftStart)
                    if (shiftStart.getHours() >= 12) {
                        rStart = new Date(rStart.getTime() + 86400000)
                    }
                    rStart.setHours(0, 30, 0, 0)
                    const rEnd = new Date(rStart)
                    rEnd.setHours(6, 0, 0, 0)

                    const intResult = processInterruptions(entry.interruptions, rStart, rEnd)
                    totalInterruptionCount += intResult.rawCount
                    totalInterruptionCreditedHours += intResult.creditedMinutes / 60
                    totalInterruptionNetGain += (intResult.creditedMinutes - intResult.deductedReadinessMinutes * 0.5) / 60
                }
            })
            totalInterruptionCreditedHours = Math.round(totalInterruptionCreditedHours * 10) / 10
            totalInterruptionNetGain = Math.round(totalInterruptionNetGain * 10) / 10

            // 2. Night shift distribution
            const nightShifts = shifts?.filter(s => s.type === 'ND' && s.assigned_to) || []

            // 3. Weekend shifts count
            const weekendShifts = shifts?.filter(s => {
                const date = new Date(s.start_time)
                return (date.getDay() === 0 || date.getDay() === 6) && s.assigned_to
            }) || []

            // 4. DBD count
            const dbdShifts = shifts?.filter(s => s.type === 'DBD' && s.assigned_to) || []

            // 5. Sick reports by day of week
            const sickByDayOfWeek = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
            absences?.forEach(abs => {
                const isSick = abs.type === 'Krank' || abs.type === 'Krankenstand'
                if (isSick) {
                    const day = new Date(abs.start_date).getDay()
                    sickByDayOfWeek[day]++
                }
            })

            // 6. Average sick duration (in days)
            let totalSickDays = 0
            let sickAbsenceCount = 0
            let sickDuringTeamMeeting = 0
            absences?.forEach(abs => {
                const isSick = abs.type === 'Krank' || abs.type === 'Krankenstand'
                if (isSick) {
                    const startD = new Date(abs.start_date)
                    const endD = new Date(abs.end_date)
                    const days = Math.ceil((endD - startD) / (1000 * 60 * 60 * 24)) + 1
                    totalSickDays += days
                    sickAbsenceCount++

                    // Check if any planned shift was a TEAM meeting
                    if (abs.planned_shifts_snapshot?.some(s => s.type === 'TEAM')) {
                        sickDuringTeamMeeting++
                    }
                }
            })
            const avgSickDuration = sickAbsenceCount > 0 ? (totalSickDays / sickAbsenceCount).toFixed(1) : 0

            // 7. Upcoming vacations (next 14 days from today)
            const now = new Date()
            const twoWeeksFromNow = new Date()
            twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14)
            const { data: upcomingVacations } = await supabase
                .from('absences')
                .select('*, profiles(full_name, display_name)')
                .eq('type', 'Urlaub')
                .eq('status', 'genehmigt')
                .gte('start_date', format(now, 'yyyy-MM-dd'))
                .lte('start_date', format(twoWeeksFromNow, 'yyyy-MM-dd'))
                .order('start_date')
                .limit(10)

            const totalWorkedHours = Object.values(shiftHours).reduce((a, b) => a + b, 0)
            const totalSickHours = Object.values(sickHours).reduce((a, b) => a + b, 0)
            const totalIstHours = totalWorkedHours + totalSickHours + totalVacationHours // Worked + Sick + Vacation
            const puffer = totalIstHours - totalSollHours // IST - SOLL

            setStats({
                shiftHours,
                sickHours,
                flexCount,
                sickCount,
                swapCount,
                totalWorkedHours,
                totalSickHours,
                totalVacationHours: Math.round(totalVacationHours),
                totalSollHours: Math.round(totalSollHours),
                totalIstHours: Math.round(totalIstHours),
                totalPlannedHours: Math.round(totalPlannedHours),
                puffer: Math.round(puffer),
                employeeCount: employees.length,
                // New metrics
                totalInterruptionCount,
                totalInterruptionCreditedHours,
                totalInterruptionNetGain,
                sickByDayOfWeek,
                nightShiftCount: nightShifts.length,
                weekendShiftCount: weekendShifts.length
            })

            // Calculate per-employee stats for employee view
            if (viewMode === 'employee') {
                const empStats = employees.map(emp => {
                    const empWeeklyHours = emp.weekly_hours || 40
                    const empSollHours = empWeeklyHours * weeksInMonth

                    // Worked hours for this employee
                    let empWorkedHours = 0
                    entries?.forEach(entry => {
                        if (entry.user_id === emp.id && entry.calculated_hours) {
                            empWorkedHours += Number(entry.calculated_hours) || 0
                        }
                    })

                    // Sick hours + count sick reports
                    let empSickHours = 0
                    let empSickCount = 0
                    absences?.forEach(abs => {
                        if (abs.user_id !== emp.id) return
                        const isSick = abs.type === 'Krank' || abs.type === 'Krankenstand'
                        if (isSick) {
                            empSickCount++
                            if (abs.planned_shifts_snapshot) {
                                abs.planned_shifts_snapshot.forEach(shift => {
                                    empSickHours += calculateWorkHours(shift.start_time, shift.end_time, shift.type)
                                })
                            }
                        }
                    })

                    // Vacation hours
                    // Vacation hours & stats
                    let empVacationHours = 0
                    let empVacationDaysNet = 0
                    let totalLeadTime = 0
                    let vacationCount = 0
                    let longestVacationBlock = 0
                    let bridgeDayCount = 0 // Mondays or Fridays

                    absences?.forEach(abs => {
                        if (abs.user_id !== emp.id) return
                        if (abs.type === 'Urlaub') {
                            const absStart = new Date(abs.start_date)
                            const absEnd = new Date(abs.end_date)

                            // Check overlap with selected month
                            const startOverlap = absStart < start ? start : absStart
                            const endOverlap = absEnd > end ? end : absEnd

                            if (startOverlap <= endOverlap) {
                                // Hours calculation based on overlap
                                const vacDays = eachDayOfInterval({ start: startOverlap, end: endOverlap })
                                const vacWorkDays = vacDays.filter(d => !isWeekend(d) && !isHoliday(d, holidays)).length
                                const dailyHours = empWeeklyHours / 5
                                empVacationHours += vacWorkDays * dailyHours

                                // Stats (consider full absence for these metrics to be accurate about behavior)
                                const fullVacDays = eachDayOfInterval({ start: absStart, end: absEnd })
                                const netDays = fullVacDays.filter(d => !isWeekend(d) && !isHoliday(d, holidays))
                                empVacationDaysNet += netDays.length

                                // Longest block
                                if (netDays.length > longestVacationBlock) longestVacationBlock = netDays.length

                                // Planning lead time
                                const created = new Date(abs.created_at)
                                const leadTime = differenceInDays(absStart, created)
                                totalLeadTime += leadTime
                                vacationCount++

                                // Bridge days (Mon/Fri)
                                netDays.forEach(d => {
                                    const day = getDay(d)
                                    if (day === 1 || day === 5) bridgeDayCount++
                                })
                            }
                        }
                    })

                    const avgLeadTime = vacationCount > 0 ? Math.round(totalLeadTime / vacationCount) : 0
                    const bridgeDayRatio = empVacationDaysNet > 0 ? Math.round((bridgeDayCount / empVacationDaysNet) * 100) : 0

                    // Count flex shifts taken by this employee
                    let empFlexCount = 0
                    const urgentShiftsEmp = shifts?.filter(s => s.urgent_since) || []
                    urgentShiftsEmp.forEach(s => {
                        const picked = monthInterests.find(i => i.shift_id === s.id && i.user_id === emp.id)
                        if (picked) empFlexCount++
                    })

                    // Count swaps for this employee
                    let empSwapCount = 0
                    monthSwaps?.forEach(swap => {
                        if (swap.new_user_id === emp.id || swap.old_user_id === emp.id) {
                            empSwapCount++
                        }
                    })

                    // Count night shifts for this employee
                    const empNightShifts = shifts?.filter(s => s.type === 'ND' && s.assigned_to === emp.id).length || 0

                    // Count weekend shifts for this employee
                    const empWeekendShifts = shifts?.filter(s => {
                        const date = new Date(s.start_time)
                        return (date.getDay() === 0 || date.getDay() === 6) && s.assigned_to === emp.id
                    }).length || 0

                    // Count DBD shifts
                    const empDbdCount = shifts?.filter(s => s.type === 'DBD' && s.assigned_to === emp.id).length || 0

                    // Count interruptions for this employee
                    let empInterruptions = 0
                    entries?.forEach(entry => {
                        if (entry.user_id === emp.id && entry.interruptions && Array.isArray(entry.interruptions)) {
                            empInterruptions += entry.interruptions.length
                        }
                    })

                    // Count training hours for this employee
                    let empTrainingHours = 0
                    const empTrainingInterests = monthInterests.filter(i =>
                        i.user_id === emp.id && i.shifts?.type === 'FORTBILDUNG'
                    )
                    empTrainingInterests.forEach(i => {
                        empTrainingHours += calculateWorkHours(i.shifts.start_time, i.shifts.end_time, i.shifts.type)
                    })

                    const empIstHours = empWorkedHours + empSickHours + empVacationHours
                    const empPuffer = empIstHours - empSollHours

                    return {
                        id: emp.id,
                        weeklyHours: empWeeklyHours,
                        sollHours: Math.round(empSollHours),
                        workedHours: Math.round(empWorkedHours * 10) / 10,
                        sickHours: Math.round(empSickHours * 10) / 10,
                        vacationHours: Math.round(empVacationHours * 10) / 10,
                        istHours: Math.round(empIstHours),
                        puffer: Math.round(empPuffer),
                        sickCount: empSickCount,
                        flexCount: empFlexCount,
                        swapCount: empSwapCount,
                        nightShiftCount: empNightShifts,
                        weekendShiftCount: empWeekendShifts,
                        dbdCount: empDbdCount,
                        interruptionCount: empInterruptions,
                        trainingHours: Math.round(empTrainingHours * 10) / 10,
                        vacationDaysNet: empVacationDaysNet,
                        avgLeadTime,
                        longestVacationBlock,
                        bridgeDayRatio
                    }
                })

                // Fetch profile names
                const { data: profileNames } = await supabase
                    .from('profiles')
                    .select('id, full_name, display_name, email')
                    .in('id', employees.map(e => e.id))

                const empStatsWithNames = empStats.map(es => {
                    const profile = profileNames?.find(p => p.id === es.id)
                    return {
                        ...es,
                        name: profile?.display_name || profile?.full_name || profile?.email || 'Unbekannt'
                    }
                })

                setEmployeeStats(empStatsWithNames)
            }
        } catch (err) {
            console.error('AdminOverview Error:', err)
        } finally {
            setLoading(false)
        }
    }

    const StatCard = ({ label, value, unit = 'h', icon: Icon, color = 'blue' }) => (
        <div className={`bg-${color}-50 p-4 rounded-xl border border-${color}-100`}>
            <div className="flex items-center gap-2 mb-2">
                {Icon && <Icon size={16} className={`text-${color}-500`} />}
                <span className="text-xs font-bold text-gray-500 uppercase">{label}</span>
            </div>
            <div className={`text-2xl font-bold text-${color}-700`}>
                {typeof value === 'number' ? value.toFixed(unit === 'h' ? 2 : 0) : value}{unit}
            </div>
        </div>
    )

    return (
        <div>
            <h2 className="text-xl font-bold mb-4">Gesamtübersicht</h2>

            {/* View Mode Switcher */}
            <div className="flex gap-2 mb-4">
                <button
                    onClick={() => setViewMode('team')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all ${viewMode === 'team' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                    <Users size={16} /> Team
                </button>
                <button
                    onClick={() => setViewMode('employee')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all ${viewMode === 'employee' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                    <User size={16} /> Mitarbeiter
                </button>
                <button
                    onClick={() => setViewMode('year')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all ${viewMode === 'year' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                    <Calendar size={16} /> Jahr
                </button>
            </div>

            {/* Time Period Picker */}
            <div className="flex items-center justify-center bg-gray-50 rounded-xl p-1.5 border border-gray-200 mb-6">
                <button
                    onClick={() => setSelectedMonth(viewMode === 'year' ? new Date(selectedMonth.getFullYear() - 1, 0, 1) : subMonths(selectedMonth, 1))}
                    className="p-2 hover:bg-white hover:shadow-md rounded-lg text-gray-500 transition-all"
                >
                    <ChevronLeft size={20} />
                </button>
                <span className="font-bold text-gray-800 px-4 capitalize min-w-[150px] text-center">
                    {viewMode === 'year'
                        ? selectedMonth.getFullYear()
                        : format(selectedMonth, 'MMMM yyyy', { locale: de })}
                </span>
                <button
                    onClick={() => setSelectedMonth(viewMode === 'year' ? new Date(selectedMonth.getFullYear() + 1, 0, 1) : addMonths(selectedMonth, 1))}
                    className="p-2 hover:bg-white hover:shadow-md rounded-lg text-gray-500 transition-all"
                >
                    <ChevronRight size={20} />
                </button>
            </div>

            {loading ? (
                <div className="animate-pulse space-y-4">
                    <div className="h-24 bg-gray-200 rounded-xl"></div>
                    <div className="grid grid-cols-2 gap-3">
                        {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-20 bg-gray-200 rounded-xl"></div>)}
                    </div>
                </div>
            ) : stats && (
                <div className="space-y-6">
                    {/* Team/Year View - Show aggregate statistics */}
                    {viewMode !== 'employee' && (
                        <>
                            {/* Hero: Puffer + Stunden-Bilanz */}
                            <div className="bg-white rounded-[1.5rem] border border-gray-100/80 shadow-[0_2px_10px_rgb(0,0,0,0.04)] p-5">
                                {/* Puffer Hero */}
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <div className="text-xs text-gray-400 font-bold uppercase tracking-wider">Puffer</div>
                                        <div className="text-xs text-gray-400">{stats.employeeCount} Mitarbeiter</div>
                                    </div>
                                    <div className={`text-3xl font-black tracking-tight ${stats.puffer >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {stats.puffer > 0 ? '+' : ''}{stats.puffer}<span className="text-lg ml-0.5">h</span>
                                    </div>
                                </div>

                                {/* Stacked Bar: IST vs SOLL */}
                                {(() => {
                                    const maxVal = Math.max(stats.totalIstHours, stats.totalSollHours, 1)
                                    const workPct = (stats.totalWorkedHours / maxVal) * 100
                                    const vacPct = (stats.totalVacationHours / maxVal) * 100
                                    const sickPct = (stats.totalSickHours / maxVal) * 100
                                    const sollPct = (stats.totalSollHours / maxVal) * 100
                                    return (
                                        <div className="mb-3">
                                            <div className="relative h-5 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="absolute inset-0 flex rounded-full overflow-hidden">
                                                    <div className="bg-blue-500 h-full" style={{ width: `${workPct}%` }} />
                                                    <div className="bg-amber-400 h-full" style={{ width: `${vacPct}%` }} />
                                                    <div className="bg-red-400 h-full" style={{ width: `${sickPct}%` }} />
                                                </div>
                                                {/* SOLL marker line */}
                                                <div className="absolute top-0 bottom-0 w-0.5 bg-gray-800 z-10" style={{ left: `${sollPct}%` }}>
                                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold text-gray-500 whitespace-nowrap">Soll</div>
                                                </div>
                                            </div>
                                            {/* Legend */}
                                            <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Arbeit</span>
                                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Urlaub</span>
                                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Krank</span>
                                            </div>
                                        </div>
                                    )
                                })()}

                                {/* Compact numbers row */}
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div className="bg-gray-50 rounded-lg py-1.5">
                                        <div className="text-[10px] text-gray-400 font-medium">Soll</div>
                                        <div className="text-sm font-bold text-gray-700">{stats.totalSollHours}h</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg py-1.5">
                                        <div className="text-[10px] text-blue-400 font-medium">Geplant</div>
                                        <div className="text-sm font-bold text-gray-700">{stats.totalPlannedHours}h</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg py-1.5">
                                        <div className="text-[10px] text-purple-400 font-medium">Ist</div>
                                        <div className="text-sm font-bold text-gray-700">{stats.totalIstHours}h</div>
                                    </div>
                                </div>
                            </div>

                            {/* IST-Aufschlüsselung */}
                            <div className="bg-white rounded-[1.5rem] border border-gray-100/80 shadow-[0_2px_10px_rgb(0,0,0,0.04)] overflow-hidden">
                                <div className="p-4 pb-2">
                                    <h3 className="font-bold text-gray-700 flex items-center gap-2 text-sm">
                                        <BarChart3 size={16} /> IST-Aufschlüsselung
                                    </h3>
                                </div>
                                <div className="px-4 pb-4 space-y-1">
                                    {/* Arbeit — collapsible shift type breakdown */}
                                    <div>
                                        <button
                                            onClick={() => setShowWorkedDetails(!showWorkedDetails)}
                                            className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Clock size={14} className="text-blue-500" />
                                                <span className="text-sm font-medium text-gray-700">Arbeit</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-blue-700">{stats.totalWorkedHours.toFixed(1)}h</span>
                                                {showWorkedDetails ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                                            </div>
                                        </button>
                                        {showWorkedDetails && (
                                            <div className="ml-6 mb-1 space-y-0.5">
                                                {Object.entries(stats.shiftHours)
                                                    .filter(([, h]) => h > 0)
                                                    .sort((a, b) => b[1] - a[1])
                                                    .map(([type, hours]) => {
                                                        const labels = { TD: 'Tagdienst', TD1: 'Tagdienst 1', TD2: 'Tagdienst 2', ND: 'Nachtdienst', DBD: 'Doppeldienst', TEAM: 'Teamsitzung', FORTBILDUNG: 'Fortbildung', EINSCHULUNG: 'Einschulung', MITARBEITERGESPRAECH: 'MA-Gespräch', SONSTIGES: 'Sonstiges' }
                                                        return (
                                                            <div key={type} className="flex items-center justify-between py-1 px-3 text-xs">
                                                                <span className="text-gray-500">{labels[type] || type}</span>
                                                                <span className="font-bold text-gray-700">{hours.toFixed(1)}h</span>
                                                            </div>
                                                        )
                                                    })
                                                }
                                            </div>
                                        )}
                                    </div>

                                    {/* Urlaub */}
                                    <div className="flex items-center justify-between py-2 px-3 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <Plane size={14} className="text-amber-500" />
                                            <span className="text-sm font-medium text-gray-700">Urlaub</span>
                                        </div>
                                        <span className="text-sm font-bold text-amber-700">{stats.totalVacationHours}h</span>
                                    </div>

                                    {/* Krank — collapsible sick type breakdown */}
                                    <div>
                                        <button
                                            onClick={() => setShowSickDetails(!showSickDetails)}
                                            className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Thermometer size={14} className="text-red-500" />
                                                <span className="text-sm font-medium text-gray-700">Krank</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-red-700">{stats.totalSickHours.toFixed(1)}h</span>
                                                {showSickDetails ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                                            </div>
                                        </button>
                                        {showSickDetails && (
                                            <div className="ml-6 mb-1 space-y-0.5">
                                                {Object.entries(stats.sickHours)
                                                    .filter(([, h]) => h > 0)
                                                    .sort((a, b) => b[1] - a[1])
                                                    .map(([type, hours]) => {
                                                        const labels = { TD1: 'Tagdienst 1', TD2: 'Tagdienst 2', ND: 'Nachtdienst', DBD: 'Doppeldienst', TEAM: 'Teamsitzung', FORTBILDUNG: 'Fortbildung', EINSCHULUNG: 'Einschulung', MITARBEITERGESPRAECH: 'MA-Gespräch', SONSTIGES: 'Sonstiges' }
                                                        return (
                                                            <div key={type} className="flex items-center justify-between py-1 px-3 text-xs">
                                                                <span className="text-red-400">{labels[type] || type}</span>
                                                                <span className="font-bold text-red-600">{hours.toFixed(1)}h</span>
                                                            </div>
                                                        )
                                                    })
                                                }
                                            </div>
                                        )}
                                    </div>

                                    {/* Unterbrechungen */}
                                    {stats.totalInterruptionCount > 0 && (
                                        <div className="flex items-center justify-between py-2 px-3 rounded-lg">
                                            <div className="flex items-center gap-2">
                                                <BellRing size={14} className="text-orange-500" />
                                                <span className="text-sm font-medium text-gray-700">Unterbrechungen</span>
                                                <span className="text-[10px] text-gray-400">({stats.totalInterruptionCount}×)</span>
                                            </div>
                                            <span className="text-sm font-bold text-orange-700">+{stats.totalInterruptionNetGain}h</span>
                                        </div>
                                    )}

                                    {/* Gesamt IST */}
                                    <div className="flex items-center justify-between py-2 px-3 border-t border-gray-100 mt-1">
                                        <span className="text-sm font-bold text-gray-800">Gesamt IST</span>
                                        <span className="text-sm font-bold text-purple-700">{stats.totalIstHours}h</span>
                                    </div>
                                </div>
                            </div>

                            {/* Betrieb — Flex, Tausch, Unbesetzt, Reaktion + Krankmuster */}
                            <div className="bg-white rounded-[1.5rem] border border-gray-100/80 shadow-[0_2px_10px_rgb(0,0,0,0.04)] p-4 space-y-4">
                                <h3 className="font-bold text-gray-700 flex items-center gap-2 text-sm">
                                    <Activity size={16} /> Betrieb
                                </h3>

                                {/* Compact metrics row */}
                                <div className="grid grid-cols-4 gap-2 text-center">
                                    <div className="bg-gray-50 p-2 rounded-xl">
                                        <div className="text-[10px] text-gray-400 font-medium">Flex</div>
                                        <div className="text-lg font-bold text-gray-800">{stats.flexCount}</div>
                                    </div>
                                    <div className="bg-gray-50 p-2 rounded-xl">
                                        <div className="text-[10px] text-gray-400 font-medium">Tausch</div>
                                        <div className="text-lg font-bold text-gray-800">{stats.swapCount}</div>
                                    </div>
                                    <div className="bg-gray-50 p-2 rounded-xl">
                                        <div className="text-[10px] text-gray-400 font-medium">Nacht</div>
                                        <div className="text-lg font-bold text-gray-800">{stats.nightShiftCount}</div>
                                    </div>
                                    <div className="bg-gray-50 p-2 rounded-xl">
                                        <div className="text-[10px] text-gray-400 font-medium">WE</div>
                                        <div className="text-lg font-bold text-gray-800">{stats.weekendShiftCount}</div>
                                    </div>
                                </div>

                                {/* Krankmuster mini bar chart */}
                                <div>
                                    <div className="text-xs text-gray-400 font-bold mb-2">Krankmeldungen nach Wochentag</div>
                                    {(() => {
                                        const maxSick = Math.max(...Object.values(stats.sickByDayOfWeek || {}), 1)
                                        return (
                                            <div className="grid grid-cols-7 gap-1 text-center items-end" style={{ height: '60px' }}>
                                                {['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'].map((day, i) => {
                                                    const count = stats.sickByDayOfWeek?.[i] || 0
                                                    const barH = count > 0 ? Math.max((count / maxSick) * 40, 4) : 0
                                                    return (
                                                        <div key={day} className="flex flex-col items-center justify-end h-full">
                                                            {count > 0 && (
                                                                <div className="text-[9px] font-bold text-red-600 mb-0.5">{count}</div>
                                                            )}
                                                            <div
                                                                className={`w-full rounded-t ${count > 0 ? 'bg-red-400' : 'bg-gray-100'}`}
                                                                style={{ height: `${count > 0 ? barH : 2}px` }}
                                                            />
                                                            <div className="text-[10px] text-gray-400 mt-1">{day}</div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )
                                    })()}
                                </div>
                            </div>


                        </>
                    )
                    }

                    {/* Employee View - List of all employees */}
                    {
                        viewMode === 'employee' && employeeStats.length > 0 && (
                            <div>
                                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                                    <User size={18} /> Mitarbeiter Details
                                </h3>
                                <div className="space-y-3">
                                    {[...employeeStats].sort((a, b) => a.puffer - b.puffer).map(emp => {
                                        const empMaxVal = Math.max(emp.istHours, emp.sollHours, 1)
                                        const empIstPct = Math.min((emp.istHours / empMaxVal) * 100, 100)
                                        const empSollPct = Math.min((emp.sollHours / empMaxVal) * 100, 100)
                                        return (
                                        <div key={emp.id} className="bg-white p-4 rounded-[1.5rem] border border-gray-100/80 shadow-[0_2px_10px_rgb(0,0,0,0.04)] hover:shadow-[0_4px_20px_rgb(0,0,0,0.06)] transition-all">
                                            <div
                                                className="flex justify-between items-start mb-2 cursor-pointer"
                                                onClick={() => toggleEmployeeExpansion(emp.id)}
                                            >
                                                <div>
                                                    <div className="font-bold text-gray-800 flex items-center gap-2">
                                                        {emp.name}
                                                        {expandedEmployeeIds.includes(emp.id) ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                                                    </div>
                                                    <div className="text-xs text-gray-400">{emp.weeklyHours}h/Woche</div>
                                                </div>
                                                <div className={`px-3 py-1 rounded-lg text-sm font-bold ${emp.puffer >= 0
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-rose-100 text-rose-700'
                                                    }`}>
                                                    {emp.puffer > 0 ? '+' : ''}{emp.puffer}h
                                                </div>
                                            </div>

                                            {/* Mini IST vs SOLL bar */}
                                            <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden mb-3 cursor-pointer" onClick={() => toggleEmployeeExpansion(emp.id)}>
                                                <div className={`h-full rounded-full ${emp.puffer >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} style={{ width: `${empIstPct}%` }} />
                                                <div className="absolute top-0 bottom-0 w-0.5 bg-gray-600" style={{ left: `${empSollPct}%` }} />
                                            </div>

                                            {/* Hours Row - Always Visible */}
                                            <div
                                                className="grid grid-cols-5 gap-2 text-center text-xs mb-3 cursor-pointer"
                                                onClick={() => toggleEmployeeExpansion(emp.id)}
                                            >
                                                <div className="bg-gray-50 p-2 rounded-lg">
                                                    <div className="text-gray-400 font-medium">Soll</div>
                                                    <div className="font-bold text-gray-700">{emp.sollHours}h</div>
                                                </div>
                                                <div className="bg-gray-50 p-2 rounded-lg">
                                                    <div className="text-blue-400 font-medium">Arbeit</div>
                                                    <div className="font-bold text-blue-700">{emp.workedHours}h</div>
                                                </div>
                                                <div className="bg-gray-50 p-2 rounded-lg">
                                                    <div className="text-orange-400 font-medium">Urlaub</div>
                                                    <div className="font-bold text-orange-700">{emp.vacationHours}h</div>
                                                </div>
                                                <div className="bg-gray-50 p-2 rounded-lg">
                                                    <div className="text-red-400 font-medium">Krank</div>
                                                    <div className="font-bold text-red-700">{emp.sickHours}h</div>
                                                </div>
                                                <div className="bg-gray-50 p-2 rounded-lg">
                                                    <div className="text-purple-400 font-medium">Ist</div>
                                                    <div className="font-bold text-purple-700">{emp.istHours}h</div>
                                                </div>
                                            </div>

                                            {expandedEmployeeIds.includes(emp.id) && (
                                                <div className="pt-2 border-t border-gray-100 mt-2">
                                                    {/* Counts Row */}
                                                    <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
                                                        <div className="bg-gray-50 p-2 rounded-lg flex items-center justify-center gap-1.5">
                                                            <TrendingUp size={12} className="text-amber-500" />
                                                            <span className="text-amber-600 font-medium">Flex:</span>
                                                            <span className="font-bold text-amber-700">{emp.flexCount}</span>
                                                        </div>
                                                        <div className="bg-gray-50 p-2 rounded-lg flex items-center justify-center gap-1.5">
                                                            <ArrowLeftRight size={12} className="text-purple-500" />
                                                            <span className="text-purple-600 font-medium">Tausch:</span>
                                                            <span className="font-bold text-purple-700">{emp.swapCount}</span>
                                                        </div>
                                                        <div className="bg-gray-50 p-2 rounded-lg flex items-center justify-center gap-1.5">
                                                            <Thermometer size={12} className="text-red-500" />
                                                            <span className="text-red-600 font-medium">Krank:</span>
                                                            <span className="font-bold text-red-700">{emp.sickCount}x</span>
                                                        </div>
                                                    </div>

                                                    {/* New metrics row */}
                                                    <div className="grid grid-cols-5 gap-2 text-center text-xs">
                                                        <div className="bg-gray-50 p-2 rounded-lg">
                                                            <Moon size={12} className="mx-auto text-indigo-500 mb-0.5" />
                                                            <div className="text-indigo-400 font-medium">Nacht</div>
                                                            <div className="font-bold text-indigo-700">{emp.nightShiftCount}</div>
                                                        </div>
                                                        <div className="bg-gray-50 p-2 rounded-lg">
                                                            <CalendarDays size={12} className="mx-auto text-cyan-500 mb-0.5" />
                                                            <div className="text-cyan-400 font-medium">WE</div>
                                                            <div className="font-bold text-cyan-700">{emp.weekendShiftCount}</div>
                                                        </div>
                                                        <div className="bg-gray-50 p-2 rounded-lg">
                                                            <Clock size={12} className="mx-auto text-pink-500 mb-0.5" />
                                                            <div className="text-pink-400 font-medium">DBD</div>
                                                            <div className="font-bold text-pink-700">{emp.dbdCount}</div>
                                                        </div>
                                                        <div className="bg-gray-50 p-2 rounded-lg">
                                                            <BellRing size={12} className="mx-auto text-orange-500 mb-0.5" />
                                                            <div className="text-orange-400 font-medium">Unterb.</div>
                                                            <div className="font-bold text-orange-700">{emp.interruptionCount}</div>
                                                        </div>
                                                        <div className="bg-gray-50 p-2 rounded-lg">
                                                            <GraduationCap size={12} className="mx-auto text-emerald-500 mb-0.5" />
                                                            <div className="text-emerald-400 font-medium">Fortb.</div>
                                                            <div className="font-bold text-emerald-700">{emp.trainingHours}h</div>
                                                        </div>
                                                    </div>

                                                    {/* Vacation Details - Only if vacation exists */}
                                                    {emp.vacationHours > 0 && (
                                                        <div className="mt-3">
                                                            <div className="text-xs text-gray-400 font-bold mb-1 ml-1">Urlaub Details</div>
                                                            <div className="grid grid-cols-4 gap-2 text-center text-xs">
                                                                <div className="bg-gray-50 p-2 rounded-lg">
                                                                    <Tent size={12} className="mx-auto text-orange-500 mb-0.5" />
                                                                    <div className="text-orange-400 font-medium">Tage</div>
                                                                    <div className="font-bold text-orange-700">{emp.vacationDaysNet}</div>
                                                                </div>
                                                                <div className="bg-gray-50 p-2 rounded-lg">
                                                                    <Hourglass size={12} className="mx-auto text-orange-500 mb-0.5" />
                                                                    <div className="text-orange-400 font-medium">Vorlauf</div>
                                                                    <div className="font-bold text-orange-700">{emp.avgLeadTime}d</div>
                                                                </div>
                                                                <div className="bg-gray-50 p-2 rounded-lg">
                                                                    <Maximize size={12} className="mx-auto text-orange-500 mb-0.5" />
                                                                    <div className="text-orange-400 font-medium">Block</div>
                                                                    <div className="font-bold text-orange-700">{emp.longestVacationBlock}d</div>
                                                                </div>
                                                                <div className="bg-gray-50 p-2 rounded-lg">
                                                                    <CalendarDays size={12} className="mx-auto text-orange-500 mb-0.5" />
                                                                    <div className="text-orange-400 font-medium">Brücken</div>
                                                                    <div className="font-bold text-orange-700">{emp.bridgeDayRatio}%</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )})}
                                </div>
                            </div>
                        )
                    }
                </div >
            )}
        </div >
    )
}
