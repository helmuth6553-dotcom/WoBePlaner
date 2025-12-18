import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { format, startOfMonth, endOfMonth, subMonths, addMonths, startOfYear, endOfYear } from 'date-fns'
import { de } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, BarChart3, Activity, Users, Thermometer, Clock, TrendingUp, ArrowLeftRight, Target, Scale, ChevronDown, ChevronUp, Plane, Calendar, User, Moon, CalendarDays, Coffee, AlertTriangle, Timer, GraduationCap, Hourglass, Maximize, Tent } from 'lucide-react'
import { calculateWorkHours } from '../../utils/timeCalculations'
import { eachDayOfInterval, isWeekend, getDay, differenceInDays } from 'date-fns'

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
                TD1: 0, TD2: 0, ND: 0, DBD: 0, TEAM: 0, FORTBILDUNG: 0
            }
            const sickHours = {
                TD1: 0, TD2: 0, ND: 0, DBD: 0, TEAM: 0, FORTBILDUNG: 0
            }
            let flexCount = 0
            let sickCount = 0
            let swapCount = monthSwaps.length

            // Calculate total planned shift hours (what the Dienstplan offers)
            let totalPlannedHours = 0
            shifts?.forEach(shift => {
                if (shift.type !== 'TEAM' && shift.type !== 'FORTBILDUNG') {
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

            // Add FORTBILDUNG hours (per participant from interests)
            const fortbildungShifts = shifts?.filter(s => s.type === 'FORTBILDUNG') || []
            fortbildungShifts.forEach(shift => {
                const fortHours = calculateWorkHours(shift.start_time, shift.end_time, shift.type)
                // Count interests for this shift
                const participantCount = monthInterests.filter(i => i.shift_id === shift.id).length
                totalPlannedHours += fortHours * participantCount
            })

            // Calculate total Soll hours for all employees
            // Soll = weekly_hours * (working days in month / 5)
            const daysInMonth = eachDayOfInterval({ start, end })
            const workingDays = daysInMonth.filter(d => !isWeekend(d)).length
            const weeksInMonth = workingDays / 5

            let totalSollHours = 0
            employees.forEach(emp => {
                const weeklyHours = emp.weekly_hours || 40
                totalSollHours += weeklyHours * weeksInMonth
            })

            // Process confirmed/worked entries
            entries?.forEach(entry => {
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
                        const vacWorkDays = vacDays.filter(d => !isWeekend(d)).length
                        // Find user's daily hours
                        const userProfile = employees.find(e => e.id === abs.user_id)
                        const dailyHours = (userProfile?.weekly_hours || 40) / 5
                        totalVacationHours += vacWorkDays * dailyHours
                    }
                }
            })

            // Count flex shifts (shifts that were marked urgent and picked up)
            const urgentShifts = shifts?.filter(s => s.urgent_since) || []
            flexCount = urgentShifts.filter(s => {
                // Check if someone picked it up (has interests after being urgent)
                const shiftInterests = monthInterests.filter(i => i.shift_id === s.id)
                return shiftInterests.length > 0
            }).length

            // === NEW METRICS ===

            // 1. Interruptions count (from time entries)
            let totalInterruptions = 0
            entries?.forEach(entry => {
                if (entry.interruptions && Array.isArray(entry.interruptions)) {
                    totalInterruptions += entry.interruptions.length
                }
            })

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

            // 7. Flex response time (average hours from urgent_since to first interest)
            let totalResponseTime = 0
            let responseCount = 0
            urgentShifts.forEach(s => {
                const interest = monthInterests.find(i => i.shift_id === s.id)
                if (interest && s.urgent_since) {
                    const urgentTime = new Date(s.urgent_since)
                    const interestTime = new Date(interest.created_at)
                    const hours = (interestTime - urgentTime) / (1000 * 60 * 60)
                    if (hours >= 0 && hours < 720) { // Max 30 days
                        totalResponseTime += hours
                        responseCount++
                    }
                }
            })
            const avgFlexResponseHours = responseCount > 0 ? Math.round(totalResponseTime / responseCount) : null

            // 8. Unfilled shifts (past shifts without assignment)
            const now = new Date()
            const unfilledShifts = shifts?.filter(s => {
                const shiftDate = new Date(s.start_time)
                return shiftDate < now && !s.assigned_to && s.type !== 'TEAM' && s.type !== 'FORTBILDUNG'
            }) || []

            // 9. Upcoming vacations (next 14 days from today)
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
                totalInterruptions,
                nightShiftCount: nightShifts.length,
                weekendShiftCount: weekendShifts.length,
                dbdCount: dbdShifts.length,
                sickByDayOfWeek,
                avgSickDuration,
                sickDuringTeamMeeting,
                avgFlexResponseHours,
                unfilledShiftCount: unfilledShifts.length,
                upcomingVacations: upcomingVacations || []
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
                                const vacWorkDays = vacDays.filter(d => !isWeekend(d)).length
                                const dailyHours = empWeeklyHours / 5
                                empVacationHours += vacWorkDays * dailyHours

                                // Stats (consider full absence for these metrics to be accurate about behavior)
                                const fullVacDays = eachDayOfInterval({ start: absStart, end: absEnd })
                                const netDays = fullVacDays.filter(d => !isWeekend(d))
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
                            {/* KEY METRICS: Modern Card Layout */}
                            <div>
                                <div className="flex items-center gap-3 mb-4 px-1">
                                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                                        <Scale size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-800 text-lg">Monats-Bilanz</h3>
                                        <p className="text-xs text-gray-500 font-medium">Überblick für {stats.employeeCount} Mitarbeiter</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-4 gap-3">
                                    {/* SOLL */}
                                    <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <Target size={32} />
                                        </div>
                                        <div className="relative z-10">
                                            <div className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mb-0.5">SOLL</div>
                                            <div className="text-xl font-bold text-gray-800 tracking-tight">{stats.totalSollHours}<span className="text-xs text-gray-400 ml-0.5">h</span></div>
                                            <div className="text-[10px] text-gray-400 mt-1 truncate">Vertraglich</div>
                                        </div>
                                    </div>

                                    {/* GEPLANT */}
                                    <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <Clock size={32} />
                                        </div>
                                        <div className="relative z-10">
                                            <div className="text-[10px] font-bold text-blue-500 tracking-wider uppercase mb-0.5">GEPLANT</div>
                                            <div className="text-xl font-bold text-gray-800 tracking-tight">{stats.totalPlannedHours}<span className="text-xs text-gray-400 ml-0.5">h</span></div>
                                            <div className="text-[10px] text-blue-400 mt-1 truncate">Dienstplan</div>
                                        </div>
                                    </div>

                                    {/* IST */}
                                    <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <Activity size={32} />
                                        </div>
                                        <div className="relative z-10">
                                            <div className="text-[10px] font-bold text-purple-500 tracking-wider uppercase mb-0.5">IST</div>
                                            <div className="text-xl font-bold text-gray-800 tracking-tight">{stats.totalIstHours}<span className="text-xs text-gray-400 ml-0.5">h</span></div>
                                            <div className="mt-1.5 overflow-hidden flex rounded-full h-1 bg-gray-100 w-full max-w-[60px]">
                                                <div className="bg-blue-500 h-full" style={{ width: `${(stats.totalWorkedHours / stats.totalIstHours) * 100}%` }}></div>
                                                <div className="bg-orange-400 h-full" style={{ width: `${(stats.totalVacationHours / stats.totalIstHours) * 100}%` }}></div>
                                                <div className="bg-red-500 h-full" style={{ width: `${(stats.totalSickHours / stats.totalIstHours) * 100}%` }}></div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* PUFFER */}
                                    <div className={`p-3 rounded-2xl border shadow-sm relative overflow-hidden group transition-all ${stats.puffer >= 0
                                        ? 'bg-emerald-50 border-emerald-100'
                                        : 'bg-rose-50 border-rose-100'
                                        }`}>
                                        <div className={`absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity ${stats.puffer >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                            }`}>
                                            <Scale size={32} />
                                        </div>
                                        <div className="relative z-10">
                                            <div className={`text-[10px] font-bold tracking-wider uppercase mb-0.5 ${stats.puffer >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                                }`}>PUFFER</div>
                                            <div className={`text-xl font-bold tracking-tight ${stats.puffer >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                                }`}>
                                                {stats.puffer > 0 ? '+' : ''}{stats.puffer}<span className="text-xs opacity-60 ml-0.5">h</span>
                                            </div>
                                            <div className={`text-[10px] font-medium mt-1 truncate ${stats.puffer >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                                }`}>Ist - Soll</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Summary Cards */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-4 rounded-xl text-white">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Clock size={16} />
                                        <span className="text-xs font-bold uppercase opacity-80">Arbeit</span>
                                    </div>
                                    <div className="text-2xl font-bold">{stats.totalWorkedHours.toFixed(1)}h</div>
                                </div>
                                <div className="bg-gradient-to-br from-orange-400 to-orange-500 p-4 rounded-xl text-white">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Plane size={16} />
                                        <span className="text-xs font-bold uppercase opacity-80">Urlaub</span>
                                    </div>
                                    <div className="text-2xl font-bold">{stats.totalVacationHours}h</div>
                                </div>
                                <div className="bg-gradient-to-br from-red-400 to-red-500 p-4 rounded-xl text-white">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Thermometer size={16} />
                                        <span className="text-xs font-bold uppercase opacity-80">Krank</span>
                                    </div>
                                    <div className="text-2xl font-bold">{stats.totalSickHours.toFixed(1)}h</div>
                                </div>
                            </div>

                            {/* Worked Hours by Type - Collapsible */}
                            <div className="border border-gray-200 rounded-xl overflow-hidden">
                                <button
                                    onClick={() => setShowWorkedDetails(!showWorkedDetails)}
                                    className="w-full p-4 bg-gray-50 flex justify-between items-center hover:bg-gray-100 transition-colors"
                                >
                                    <h3 className="font-bold text-gray-700 flex items-center gap-2">
                                        <BarChart3 size={18} /> Geleistete Stunden nach Diensttyp
                                    </h3>
                                    {showWorkedDetails ? <ChevronUp size={20} className="text-gray-500" /> : <ChevronDown size={20} className="text-gray-500" />}
                                </button>
                                {showWorkedDetails && (
                                    <div className="p-4 grid grid-cols-3 gap-2">
                                        <div className="bg-white p-3 rounded-xl border border-gray-200 text-center">
                                            <div className="text-xs text-gray-500 font-bold">TD1</div>
                                            <div className="text-lg font-bold text-gray-800">{stats.shiftHours.TD1.toFixed(1)}h</div>
                                        </div>
                                        <div className="bg-white p-3 rounded-xl border border-gray-200 text-center">
                                            <div className="text-xs text-gray-500 font-bold">TD2</div>
                                            <div className="text-lg font-bold text-gray-800">{stats.shiftHours.TD2.toFixed(1)}h</div>
                                        </div>
                                        <div className="bg-white p-3 rounded-xl border border-gray-200 text-center">
                                            <div className="text-xs text-gray-500 font-bold">ND</div>
                                            <div className="text-lg font-bold text-gray-800">{stats.shiftHours.ND.toFixed(1)}h</div>
                                        </div>
                                        <div className="bg-white p-3 rounded-xl border border-gray-200 text-center">
                                            <div className="text-xs text-gray-500 font-bold">DBD</div>
                                            <div className="text-lg font-bold text-gray-800">{stats.shiftHours.DBD.toFixed(1)}h</div>
                                        </div>
                                        <div className="bg-white p-3 rounded-xl border border-gray-200 text-center">
                                            <div className="text-xs text-gray-500 font-bold">Teamsitzung</div>
                                            <div className="text-lg font-bold text-gray-800">{stats.shiftHours.TEAM.toFixed(1)}h</div>
                                        </div>
                                        <div className="bg-white p-3 rounded-xl border border-gray-200 text-center">
                                            <div className="text-xs text-gray-500 font-bold">Fortbildung</div>
                                            <div className="text-lg font-bold text-gray-800">{stats.shiftHours.FORTBILDUNG.toFixed(1)}h</div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Sick Hours by Type - Collapsible */}
                            <div className="border border-red-200 rounded-xl overflow-hidden">
                                <button
                                    onClick={() => setShowSickDetails(!showSickDetails)}
                                    className="w-full p-4 bg-red-50 flex justify-between items-center hover:bg-red-100 transition-colors"
                                >
                                    <h3 className="font-bold text-red-700 flex items-center gap-2">
                                        <Thermometer size={18} /> Krankstunden nach Diensttyp
                                    </h3>
                                    {showSickDetails ? <ChevronUp size={20} className="text-red-500" /> : <ChevronDown size={20} className="text-red-500" />}
                                </button>
                                {showSickDetails && (
                                    <div className="p-4 bg-red-50/50 grid grid-cols-3 gap-2">
                                        <div className="bg-white p-3 rounded-xl border border-red-100 text-center">
                                            <div className="text-xs text-red-500 font-bold">TD1</div>
                                            <div className="text-lg font-bold text-red-700">{stats.sickHours.TD1.toFixed(1)}h</div>
                                        </div>
                                        <div className="bg-white p-3 rounded-xl border border-red-100 text-center">
                                            <div className="text-xs text-red-500 font-bold">TD2</div>
                                            <div className="text-lg font-bold text-red-700">{stats.sickHours.TD2.toFixed(1)}h</div>
                                        </div>
                                        <div className="bg-white p-3 rounded-xl border border-red-100 text-center">
                                            <div className="text-xs text-red-500 font-bold">ND</div>
                                            <div className="text-lg font-bold text-red-700">{stats.sickHours.ND.toFixed(1)}h</div>
                                        </div>
                                        <div className="bg-white p-3 rounded-xl border border-red-100 text-center">
                                            <div className="text-xs text-red-500 font-bold">DBD</div>
                                            <div className="text-lg font-bold text-red-700">{stats.sickHours.DBD.toFixed(1)}h</div>
                                        </div>
                                        <div className="bg-white p-3 rounded-xl border border-red-100 text-center">
                                            <div className="text-xs text-red-500 font-bold">Team</div>
                                            <div className="text-lg font-bold text-red-700">{stats.sickHours.TEAM.toFixed(1)}h</div>
                                        </div>
                                        <div className="bg-white p-3 rounded-xl border border-red-100 text-center">
                                            <div className="text-xs text-red-500 font-bold">Fortb.</div>
                                            <div className="text-lg font-bold text-red-700">{stats.sickHours.FORTBILDUNG.toFixed(1)}h</div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Counts */}
                            <div>
                                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                                    <Activity size={18} /> Anzahl
                                </h3>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-center">
                                        <div className="flex items-center justify-center gap-2 mb-1">
                                            <TrendingUp size={16} className="text-amber-600" />
                                            <span className="text-xs text-amber-600 font-bold">Flex</span>
                                        </div>
                                        <div className="text-2xl font-bold text-amber-700">{stats.flexCount}</div>
                                    </div>
                                    <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 text-center">
                                        <div className="flex items-center justify-center gap-2 mb-1">
                                            <ArrowLeftRight size={16} className="text-purple-600" />
                                            <span className="text-xs text-purple-600 font-bold">Tausch</span>
                                        </div>
                                        <div className="text-2xl font-bold text-purple-700">{stats.swapCount}</div>
                                    </div>
                                    <div className="bg-red-50 p-4 rounded-xl border border-red-200 text-center">
                                        <div className="flex items-center justify-center gap-2 mb-1">
                                            <Thermometer size={16} className="text-red-600" />
                                            <span className="text-xs text-red-600 font-bold">Krank</span>
                                        </div>
                                        <div className="text-2xl font-bold text-red-700">{stats.sickCount}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Schichtverteilung */}
                            <div>
                                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                                    <Moon size={18} /> Schichtverteilung
                                </h3>
                                <div className="grid grid-cols-4 gap-3">
                                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200 text-center">
                                        <div className="flex items-center justify-center gap-2 mb-1">
                                            <Moon size={16} className="text-indigo-600" />
                                            <span className="text-xs text-indigo-600 font-bold">Nachtd.</span>
                                        </div>
                                        <div className="text-2xl font-bold text-indigo-700">{stats.nightShiftCount}</div>
                                    </div>
                                    <div className="bg-cyan-50 p-4 rounded-xl border border-cyan-200 text-center">
                                        <div className="flex items-center justify-center gap-2 mb-1">
                                            <CalendarDays size={16} className="text-cyan-600" />
                                            <span className="text-xs text-cyan-600 font-bold">Wochene.</span>
                                        </div>
                                        <div className="text-2xl font-bold text-cyan-700">{stats.weekendShiftCount}</div>
                                    </div>
                                    <div className="bg-pink-50 p-4 rounded-xl border border-pink-200 text-center">
                                        <div className="flex items-center justify-center gap-2 mb-1">
                                            <Clock size={16} className="text-pink-600" />
                                            <span className="text-xs text-pink-600 font-bold">DBD</span>
                                        </div>
                                        <div className="text-2xl font-bold text-pink-700">{stats.dbdCount}</div>
                                    </div>
                                    <div className="bg-teal-50 p-4 rounded-xl border border-teal-200 text-center">
                                        <div className="flex items-center justify-center gap-2 mb-1">
                                            <Coffee size={16} className="text-teal-600" />
                                            <span className="text-xs text-teal-600 font-bold">Unterb.</span>
                                        </div>
                                        <div className="text-2xl font-bold text-teal-700">{stats.totalInterruptions}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Krankmuster */}
                            <div>
                                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                                    <Thermometer size={18} /> Krankmuster
                                </h3>
                                <div className="grid grid-cols-3 gap-3 mb-3">
                                    <div className="bg-orange-50 p-4 rounded-xl border border-orange-200">
                                        <div className="text-xs text-orange-600 font-bold mb-1">Ø Dauer</div>
                                        <div className="text-2xl font-bold text-orange-700">{stats.avgSickDuration} <span className="text-sm">Tage</span></div>
                                    </div>
                                    <div className="bg-rose-50 p-4 rounded-xl border border-rose-200">
                                        <div className="text-xs text-rose-600 font-bold mb-1">Krankmeldungen</div>
                                        <div className="text-2xl font-bold text-rose-700">{stats.sickCount}</div>
                                    </div>
                                    <div className={`p-4 rounded-xl border ${stats.sickDuringTeamMeeting > 0 ? 'bg-yellow-50 border-yellow-300' : 'bg-gray-50 border-gray-200'}`}>
                                        <div className={`text-xs font-bold mb-1 ${stats.sickDuringTeamMeeting > 0 ? 'text-yellow-700' : 'text-gray-500'}`}>Bei Teamsitzung</div>
                                        <div className={`text-2xl font-bold ${stats.sickDuringTeamMeeting > 0 ? 'text-yellow-700' : 'text-gray-400'}`}>{stats.sickDuringTeamMeeting || 0}</div>
                                    </div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-gray-100">
                                    <div className="text-xs text-gray-500 font-bold mb-2">Krankmeldungen nach Wochentag</div>
                                    <div className="grid grid-cols-7 gap-1 text-center">
                                        {['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'].map((day, i) => (
                                            <div key={day} className="text-xs">
                                                <div className="text-gray-400">{day}</div>
                                                <div className={`font-bold ${stats.sickByDayOfWeek?.[i] > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                                                    {stats.sickByDayOfWeek?.[i] || 0}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Effizienz */}
                            <div>
                                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                                    <Timer size={18} /> Effizienz
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className={`p-4 rounded-xl border ${stats.avgFlexResponseHours !== null ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                                        <div className={`text-xs font-bold mb-1 ${stats.avgFlexResponseHours !== null ? 'text-green-600' : 'text-gray-500'}`}>
                                            Ø Flex-Reaktion
                                        </div>
                                        <div className={`text-2xl font-bold ${stats.avgFlexResponseHours !== null ? 'text-green-700' : 'text-gray-400'}`}>
                                            {stats.avgFlexResponseHours !== null ? `${stats.avgFlexResponseHours}h` : '-'}
                                        </div>
                                        <div className="text-xs text-gray-400">Zeit bis Übernahme</div>
                                    </div>
                                    <div className={`p-4 rounded-xl border ${stats.unfilledShiftCount === 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                        <div className={`text-xs font-bold mb-1 ${stats.unfilledShiftCount === 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            Unbesetzte Schichten
                                        </div>
                                        <div className={`text-2xl font-bold ${stats.unfilledShiftCount === 0 ? 'text-green-700' : 'text-red-700'}`}>
                                            {stats.unfilledShiftCount}
                                        </div>
                                        <div className="text-xs text-gray-400">Vergangene Schichten</div>
                                    </div>
                                </div>
                            </div>

                            {/* Ausblick: Kommende Urlaube */}
                            {stats.upcomingVacations?.length > 0 && (
                                <div>
                                    <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                                        <Plane size={18} /> Kommende Urlaube (14 Tage)
                                    </h3>
                                    <div className="space-y-2">
                                        {stats.upcomingVacations.map(vac => (
                                            <div key={vac.id} className="bg-orange-50 p-3 rounded-xl border border-orange-100 flex justify-between items-center">
                                                <div>
                                                    <div className="font-semibold text-gray-800">
                                                        {vac.profiles?.display_name || vac.profiles?.full_name || 'Unbekannt'}
                                                    </div>
                                                    <div className="text-xs text-orange-600">
                                                        {format(new Date(vac.start_date), 'dd.MM.')} - {format(new Date(vac.end_date), 'dd.MM.yyyy')}
                                                    </div>
                                                </div>
                                                <Plane size={20} className="text-orange-400" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Employee View - List of all employees */}
                    {viewMode === 'employee' && employeeStats.length > 0 && (
                        <div>
                            <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                                <User size={18} /> Mitarbeiter Details
                            </h3>
                            <div className="space-y-3">
                                {employeeStats.map(emp => (
                                    <div key={emp.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                        <div
                                            className="flex justify-between items-start mb-3 cursor-pointer"
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
                                                        <Coffee size={12} className="mx-auto text-teal-500 mb-0.5" />
                                                        <div className="text-teal-400 font-medium">Unterb.</div>
                                                        <div className="font-bold text-teal-700">{emp.interruptionCount}</div>
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
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
