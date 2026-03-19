import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import { Clock, TrendingUp, TrendingDown, Zap, BarChart3, CalendarClock, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, BellRing, PenTool, AlertCircle } from 'lucide-react'
import { format, startOfMonth, endOfMonth, isSameMonth, eachDayOfInterval, isWeekend, addMonths, subMonths } from 'date-fns'
import { de } from 'date-fns/locale'
import { calculateGenericBalance } from '../utils/balanceHelpers'
import { calculateMonthlyHistory } from '../utils/monthlyHistory'
import { calculateWorkHours, calculateDailyAbsenceHours, processInterruptions } from '../utils/timeCalculations'
import { getHolidays, isHoliday } from '../utils/holidays'

const SHIFT_TYPE_LABELS = {
    TD: 'Tagdienst',
    TD1: 'Tagdienst 1',
    TD2: 'Tagdienst 2',
    ND: 'Nachtdienst',
    DBD: 'Doppeldienst',
    TEAM: 'Teamsitzung',
    FORTBILDUNG: 'Fortbildung',
    EINSCHULUNG: 'Einschulung',
    MITARBEITERGESPRAECH: 'MA-Gespräch',
    SONSTIGES: 'Sonstiges',
    SUPERVISION: 'Supervision',
    AST: 'Anlaufstelle',
}

const SHIFT_TYPE_COLORS = {
    TD: 'bg-blue-100 text-blue-700',
    TD1: 'bg-blue-100 text-blue-700',
    TD2: 'bg-sky-100 text-sky-700',
    ND: 'bg-indigo-100 text-indigo-700',
    DBD: 'bg-violet-100 text-violet-700',
    TEAM: 'bg-purple-100 text-purple-700',
    FORTBILDUNG: 'bg-fuchsia-100 text-fuchsia-700',
    EINSCHULUNG: 'bg-pink-100 text-pink-700',
    MITARBEITERGESPRAECH: 'bg-emerald-100 text-emerald-700',
    SONSTIGES: 'bg-gray-100 text-gray-700',
    SUPERVISION: 'bg-violet-100 text-violet-800',
    AST: 'bg-teal-100 text-teal-700',
}

const ABSENCE_TYPE_COLORS = {
    Urlaub: 'bg-teal-100 text-teal-700',
    Krankenstand: 'bg-amber-100 text-amber-700',
    Krank: 'bg-amber-100 text-amber-700',
    Pflegeurlaub: 'bg-orange-100 text-orange-700',
    Zeitausgleich: 'bg-lime-100 text-lime-700',
}

function normalizeType(type) {
    if (!type) return 'SONSTIGE'
    const up = type.toUpperCase()
    if (up === 'TAGDIENST' || up === 'TAG') return 'TD1'
    if (up === 'NACHT' || up === 'NACHTDIENST') return 'ND'
    if (up === 'DOPPELDIENST') return 'DBD'
    if (up === 'TEAMSITZUNG') return 'TEAM'
    // Already normalized
    if (SHIFT_TYPE_LABELS[up]) return up
    return type
}

export default function ProfileStats() {
    const { user } = useAuth()
    const [balance, setBalance] = useState(null)
    const [monthlyData, setMonthlyData] = useState([])
    const [flexHistory, setFlexHistory] = useState([])
    const [teamAvgFlex, setTeamAvgFlex] = useState(0)
    const [nextShift, setNextShift] = useState(null)
    const [loading, setLoading] = useState(true)
    const [detailExpanded, setDetailExpanded] = useState(false)
    const [shiftBreakdown, setShiftBreakdown] = useState({})
    const [absenceBreakdown, setAbsenceBreakdown] = useState({})
    const [interruptionsByMonth, setInterruptionsByMonth] = useState({})
    const [interruptionDetails, setInterruptionDetails] = useState([])
    const [timeAdjustments, setTimeAdjustments] = useState([])
    const [currentMonthCorrections, setCurrentMonthCorrections] = useState([])
    const [expandedInterruptions, setExpandedInterruptions] = useState({})
    const [selectedMonth, setSelectedMonth] = useState(new Date())
    // Raw fetched data — stored so we can recompute breakdown for any month
    const [rawData, setRawData] = useState(null)

    useEffect(() => {
        if (!user) return
        fetchAll()
    }, [user])

    const fetchAll = async () => {
        setLoading(true)
        try {
            await Promise.all([
                fetchBalanceAndHistory(),
                fetchFlexHistory(),
                fetchNextShift(),
            ])
        } finally {
            setLoading(false)
        }
    }

    const fetchBalanceAndHistory = async () => {
        const { data: profile } = await supabase
            .from('profiles')
            .select('weekly_hours, start_date, initial_balance')
            .eq('id', user.id).single()
        if (!profile) return

        const { data: myInterests } = await supabase
            .from('shift_interests')
            .select('shift:shifts(id, start_time, end_time, assigned_to, type)')
            .eq('user_id', user.id)

        const { data: myDirectShifts } = await supabase
            .from('shifts')
            .select('id, start_time, end_time, assigned_to, type')
            .eq('assigned_to', user.id)

        const { data: teamShifts } = await supabase
            .from('shifts')
            .select('id, start_time, end_time, type')
            .eq('type', 'TEAM')

        const shiftsFromInterests = myInterests?.map(i => i.shift).filter(s => s) || []
        const allMyShifts = [...shiftsFromInterests]
            ; (myDirectShifts || []).forEach(s => {
                if (!allMyShifts.some(h => h.id === s.id)) allMyShifts.push(s)
            })
            ; (teamShifts || []).forEach(s => {
                if (!allMyShifts.some(h => h.id === s.id)) allMyShifts.push(s)
            })

        const { data: myEntries } = await supabase
            .from('time_entries').select('*').eq('user_id', user.id)

        const { data: myAbsences } = await supabase
            .from('absences')
            .select('start_date, end_date, user_id, status, type, planned_hours')
            .eq('user_id', user.id).eq('status', 'genehmigt')

        const { data: myCorrs } = await supabase
            .from('balance_corrections')
            .select('correction_hours, effective_month, reason, created_at, created_by_profile:profiles!balance_corrections_created_by_fkey(full_name)')
            .eq('user_id', user.id)

        try {
            const history = calculateMonthlyHistory(
                profile, allMyShifts, myAbsences || [], myEntries || [], myCorrs || [], 12
            )
            setMonthlyData(history)

            // --- Compute interruptions (Bereitschaft → aktiv) by month (global, not month-specific) ---
            const shiftStartMap = {}
            allMyShifts.forEach(s => { if (s.id) shiftStartMap[s.id] = s.start_time })

            const intByMonth = {}
                ; (myEntries || []).forEach(entry => {
                    const ints = entry.interruptions
                    if (!ints || !Array.isArray(ints) || ints.length === 0) return
                    const shiftStart = shiftStartMap[entry.shift_id]
                    if (!shiftStart) return
                    const key = format(new Date(shiftStart), 'yyyy-MM')
                    intByMonth[key] = (intByMonth[key] || 0) + ints.length
                })
            setInterruptionsByMonth(intByMonth)

            // Store raw data for month-specific recomputation
            setRawData({ profile, allMyShifts, myEntries: myEntries || [], myAbsences: myAbsences || [], myCorrs: myCorrs || [] })

        } catch (err) {
            console.error('ProfileStats balance error:', err)
        }
    }

    // Recompute breakdown, balance, adjustments etc. when selectedMonth or rawData changes
    useEffect(() => {
        if (!rawData) return
        const { profile, allMyShifts, myEntries, myAbsences, myCorrs } = rawData
        const targetDate = selectedMonth

        const b = calculateGenericBalance(
            profile, allMyShifts, myAbsences, myEntries, targetDate, myCorrs
        )
        setBalance(b)

        const mStart = startOfMonth(targetDate)
        const mEnd = endOfMonth(targetDate)
        const entryMap = {}
        myEntries.forEach(e => { if (e.shift_id) entryMap[e.shift_id] = e })

        // Collect absence days for this month to exclude TEAM shifts on vacation/sick days
        const myAbsenceDays = new Set()
        myAbsences.forEach(abs => {
            if (!abs.start_date || !abs.end_date) return
            const absStart = new Date(abs.start_date) < mStart ? mStart : new Date(abs.start_date)
            const absEnd = new Date(abs.end_date) > mEnd ? mEnd : new Date(abs.end_date)
            if (absStart <= absEnd) {
                eachDayOfInterval({ start: absStart, end: absEnd }).forEach(d => {
                    if (!isWeekend(d)) myAbsenceDays.add(d.toISOString().split('T')[0])
                })
            }
        })

        const currentShifts = allMyShifts.filter(s => {
            if (!s.start_time) return false
            const d = new Date(s.start_time)
            if (!isSameMonth(d, targetDate)) return false
            // Exclude TEAM shifts on days with absences
            if (s.type?.toUpperCase() === 'TEAM') {
                const dateKey = d.toISOString().split('T')[0]
                if (myAbsenceDays.has(dateKey)) return false
            }
            return true
        })

        const breakdown = {}
        const adjustments = []
        const intDetails = []

        // Group shifts by date to detect TD1+TD2 pairs
        const shiftsByDate = {}
        currentShifts.forEach(shift => {
            const dateKey = new Date(shift.start_time).toISOString().split('T')[0]
            if (!shiftsByDate[dateKey]) shiftsByDate[dateKey] = []
            shiftsByDate[dateKey].push(shift)
        })

        // Identify TD1+TD2 pairs (same day) — these are merged in TimeTracking
        const mergedTdPairs = new Set()
        const tdPairsByDate = {}
        Object.entries(shiftsByDate).forEach(([dateKey, dayShifts]) => {
            const td1 = dayShifts.find(s => {
                const t = normalizeType(s.type)
                return t === 'TD1'
            })
            const td2 = dayShifts.find(s => normalizeType(s.type) === 'TD2')
            if (td1 && td2) {
                mergedTdPairs.add(td1.id)
                mergedTdPairs.add(td2.id)
                tdPairsByDate[dateKey] = { td1, td2 }
            }
        })

        // First: handle TD1+TD2 merged pairs in breakdown
        const processedBreakdownIds = new Set()
        Object.values(tdPairsByDate).forEach(({ td1, td2 }) => {
            const td1Entry = entryMap[td1.id]
            const td2Entry = entryMap[td2.id]
            const actualEntry = td1Entry || td2Entry

            let hours = 0
            if (actualEntry && (actualEntry.calculated_hours || actualEntry.calculated_hours === 0)) {
                hours = actualEntry.calculated_hours
            } else {
                const td1Hours = calculateWorkHours(td1.start_time, td1.end_time, 'TD1')
                const td2Hours = calculateWorkHours(td2.start_time, td2.end_time, 'TD2')
                const overlapMin = Math.max(0, (new Date(td1.end_time) - new Date(td2.start_time)) / 60000)
                hours = td1Hours + td2Hours - (overlapMin / 60)
            }

            if (!breakdown['TD']) breakdown['TD'] = { hours: 0, count: 0 }
            breakdown['TD'].hours += hours
            breakdown['TD'].count += 1
            processedBreakdownIds.add(td1.id)
            processedBreakdownIds.add(td2.id)
        })

        currentShifts.forEach(shift => {
            if (processedBreakdownIds.has(shift.id)) return
            const type = normalizeType(shift.type)
            const entry = entryMap[shift.id]
            let hours = 0
            const plannedHours = (shift.start_time && shift.end_time)
                ? calculateWorkHours(shift.start_time, shift.end_time, type)
                : 0

            if (entry && (entry.calculated_hours || entry.calculated_hours === 0)) {
                hours = entry.calculated_hours
            } else {
                hours = plannedHours
            }

            if (!breakdown[type]) breakdown[type] = { hours: 0, count: 0 }
            breakdown[type].hours += hours
            breakdown[type].count += 1

            // --- Unterbrechungs-Details für ND-Schichten ---
            if (entry && entry.interruptions && entry.interruptions.length > 0 && type === 'ND') {
                const shiftStart = new Date(entry.actual_start || shift.start_time)

                let rStart = new Date(shiftStart)
                if (shiftStart.getHours() >= 12) {
                    rStart = new Date(rStart.getTime() + 86400000)
                }
                rStart.setHours(0, 30, 0, 0)
                const rEnd = new Date(rStart)
                rEnd.setHours(6, 0, 0, 0)

                const intResult = processInterruptions(entry.interruptions, rStart, rEnd)
                if (intResult.rawCount > 0) {
                    intDetails.push({
                        date: shift.start_time,
                        shiftType: type,
                        count: intResult.rawCount,
                        creditedMinutes: intResult.creditedMinutes,
                        deductedMinutes: intResult.deductedReadinessMinutes,
                        details: intResult.details,
                    })
                }
            }
        })
        Object.keys(breakdown).forEach(k => {
            breakdown[k].hours = Math.round(breakdown[k].hours * 100) / 100
        })
        setShiftBreakdown(breakdown)

        // --- Zeitkorrekturen ---
        const processedForAdj = new Set()

        Object.entries(tdPairsByDate).forEach(([, { td1, td2 }]) => {
            const td1Entry = entryMap[td1.id]
            const td2Entry = entryMap[td2.id]
            if (!td1Entry && !td2Entry) return

            const td1Planned = calculateWorkHours(td1.start_time, td1.end_time, 'TD1')
            const td2Planned = calculateWorkHours(td2.start_time, td2.end_time, 'TD2')
            const td1End = new Date(td1.end_time)
            const td2Start = new Date(td2.start_time)
            const overlapMinutes = Math.max(0, (td1End - td2Start) / 60000)
            const combinedPlanned = td1Planned + td2Planned - (overlapMinutes / 60)

            const actualEntry = td1Entry || td2Entry
            const combinedActual = actualEntry.calculated_hours || 0

            const diff = combinedActual - combinedPlanned
            if (Math.abs(diff) > 0.01) {
                adjustments.push({
                    date: td1.start_time,
                    shiftType: 'TD',
                    plannedHours: Math.round(combinedPlanned * 100) / 100,
                    actualHours: Math.round(combinedActual * 100) / 100,
                    diff: Math.round(diff * 100) / 100,
                    hasInterruptions: false,
                    actualStart: actualEntry.actual_start,
                    actualEnd: actualEntry.actual_end,
                    plannedStart: td1.start_time,
                    plannedEnd: td2.end_time,
                })
            }
            processedForAdj.add(td1.id)
            processedForAdj.add(td2.id)
        })

        currentShifts.forEach(shift => {
            if (processedForAdj.has(shift.id)) return
            const type = normalizeType(shift.type)
            const entry = entryMap[shift.id]
            if (!entry || (entry.calculated_hours !== 0 && !entry.calculated_hours)) return

            const plannedH = (shift.start_time && shift.end_time)
                ? calculateWorkHours(shift.start_time, shift.end_time, type)
                : 0
            let diff = entry.calculated_hours - plannedH

            if (type === 'ND' && entry.interruptions && entry.interruptions.length > 0) {
                const matchingInt = intDetails.find(d => d.date === shift.start_time)
                if (matchingInt) {
                    const intEffect = (matchingInt.creditedMinutes - matchingInt.deductedMinutes * 0.5) / 60
                    diff -= intEffect
                }
            }

            if (Math.abs(diff) > 0.01) {
                adjustments.push({
                    date: shift.start_time,
                    shiftType: type,
                    plannedHours: Math.round(plannedH * 100) / 100,
                    actualHours: Math.round(entry.calculated_hours * 100) / 100,
                    diff: Math.round(diff * 100) / 100,
                    hasInterruptions: false,
                    actualStart: entry.actual_start,
                    actualEnd: entry.actual_end,
                    plannedStart: shift.start_time,
                    plannedEnd: shift.end_time,
                })
            }
        })

        setTimeAdjustments(adjustments)
        setInterruptionDetails(intDetails)

        // --- Absence breakdown ---
        const year = targetDate.getFullYear()
        const holidays = getHolidays(year)
        const absBreak = {}
        myAbsences.forEach(abs => {
            if (!abs.start_date || !abs.end_date) return
            const absStart = new Date(abs.start_date)
            const absEnd = new Date(abs.end_date)
            const start = absStart < mStart ? mStart : absStart
            const end = absEnd > mEnd ? mEnd : absEnd
            if (start > end) return
            if (!(absStart <= mEnd && absEnd >= mStart)) return

            const absType = abs.type || 'Sonstige'
            if (!absBreak[absType]) absBreak[absType] = { hours: 0, days: 0 }

            if (abs.planned_hours && Number(abs.planned_hours) > 0) {
                absBreak[absType].hours += Number(abs.planned_hours)
                const days = eachDayOfInterval({ start, end })
                absBreak[absType].days += days.filter(d => !isWeekend(d) && !isHoliday(d, holidays)).length
            } else {
                const days = eachDayOfInterval({ start, end })
                days.forEach(day => {
                    const hours = calculateDailyAbsenceHours(day, abs, allMyShifts, profile)
                    if (hours > 0) {
                        absBreak[absType].hours += hours
                        absBreak[absType].days += 1
                    }
                })
            }
        })
        Object.keys(absBreak).forEach(k => {
            absBreak[k].hours = Math.round(absBreak[k].hours * 100) / 100
        })
        setAbsenceBreakdown(absBreak)

        // --- Admin corrections for selected month ---
        const monthCorrs = myCorrs.filter(c => {
            if (!c.effective_month) return false
            return isSameMonth(new Date(c.effective_month), targetDate)
        })
        setCurrentMonthCorrections(monthCorrs)

        // Reset expanded states when switching months
        setExpandedInterruptions({})
    }, [rawData, selectedMonth])

    const fetchFlexHistory = async () => {
        const { data: myFlex } = await supabase
            .from('shift_interests')
            .select('user_id, shift:shifts(start_time)')
            .eq('user_id', user.id)
            .eq('is_flex', true)

        const byMonth = {}
            ; (myFlex || []).forEach(f => {
                const st = f.shift?.start_time
                if (!st) return
                const key = format(new Date(st), 'yyyy-MM')
                byMonth[key] = (byMonth[key] || 0) + 1
            })
        setFlexHistory(byMonth)

        const { data: profiles } = await supabase
            .from('profiles')
            .select('id')
            .or('is_active.eq.true,is_active.is.null')
            .neq('role', 'admin')

        const nonAdminIds = (profiles || []).map(p => p.id)

        const { data: allFlex } = await supabase
            .from('shift_interests')
            .select('user_id')
            .eq('is_flex', true)

        const totalFlex = (allFlex || []).filter(f => nonAdminIds.includes(f.user_id)).length
        setTeamAvgFlex(nonAdminIds.length > 0 ? Math.round((totalFlex / nonAdminIds.length) * 10) / 10 : 0)
    }

    const fetchNextShift = async () => {
        const now = new Date().toISOString()

        const { data: interestShifts } = await supabase
            .from('shift_interests')
            .select('shift:shifts(id, start_time, end_time, type, title)')
            .eq('user_id', user.id)

        const { data: directShifts } = await supabase
            .from('shifts')
            .select('id, start_time, end_time, type, title')
            .eq('assigned_to', user.id)
            .gte('start_time', now)
            .order('start_time', { ascending: true })
            .limit(5)

        const { data: teamShifts } = await supabase
            .from('shifts')
            .select('id, start_time, end_time, type, title')
            .eq('type', 'TEAM')
            .gte('start_time', now)
            .order('start_time', { ascending: true })
            .limit(5)

        const allUpcoming = [
            ...(interestShifts?.map(i => i.shift).filter(s => s && s.start_time >= now) || []),
            ...(directShifts || []),
            ...(teamShifts || []),
        ]

        const unique = []
        allUpcoming.forEach(s => {
            if (s && !unique.some(u => u.id === s.id)) unique.push(s)
        })
        unique.sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
        setNextShift(unique[0] || null)
    }

    // Chart calculations
    const maxAbsDiff = useMemo(() => {
        if (monthlyData.length === 0) return 1
        return Math.max(...monthlyData.map(m => Math.abs(m.diff)), 1)
    }, [monthlyData])

    const cumulativeData = useMemo(() => {
        let cumulative = 0
        return monthlyData.map(m => {
            cumulative += m.diff
            return { ...m, cumulative: Math.round(cumulative * 100) / 100 }
        })
    }, [monthlyData])

    const maxAbsCumulative = useMemo(() => {
        if (cumulativeData.length === 0) return 1
        return Math.max(...cumulativeData.map(m => Math.abs(m.cumulative)), 1)
    }, [cumulativeData])

    const flexMonths = useMemo(() => {
        return monthlyData.map(m => ({
            month: m.month,
            label: m.label,
            count: flexHistory[m.month] || 0,
        }))
    }, [monthlyData, flexHistory])

    const maxFlex = useMemo(() => {
        return Math.max(...flexMonths.map(m => m.count), 1)
    }, [flexMonths])

    const interruptionMonths = useMemo(() => {
        return monthlyData.map(m => ({
            month: m.month,
            label: m.label,
            count: interruptionsByMonth[m.month] || 0,
        }))
    }, [monthlyData, interruptionsByMonth])

    const maxInterruptions = useMemo(() => {
        return Math.max(...interruptionMonths.map(m => m.count), 1)
    }, [interruptionMonths])

    const totalInterruptionsThisMonth = useMemo(() => {
        const currentKey = format(new Date(), 'yyyy-MM')
        return interruptionsByMonth[currentKey] || 0
    }, [interruptionsByMonth])

    const totalInterruptionsAllTime = useMemo(() => {
        return Object.values(interruptionsByMonth).reduce((sum, n) => sum + n, 0)
    }, [interruptionsByMonth])

    // Sorted breakdowns for display
    const sortedShiftTypes = useMemo(() => {
        return Object.entries(shiftBreakdown)
            .sort((a, b) => b[1].hours - a[1].hours)
    }, [shiftBreakdown])

    const sortedAbsenceTypes = useMemo(() => {
        return Object.entries(absenceBreakdown)
            .sort((a, b) => b[1].hours - a[1].hours)
    }, [absenceBreakdown])

    const totalShiftHours = useMemo(() => {
        return sortedShiftTypes.reduce((sum, [, v]) => sum + v.hours, 0)
    }, [sortedShiftTypes])

    const totalAbsenceHours = useMemo(() => {
        return sortedAbsenceTypes.reduce((sum, [, v]) => sum + v.hours, 0)
    }, [sortedAbsenceTypes])

    // Kontoauszug: alle Posten mit laufender Summe
    const ledgerRows = useMemo(() => {
        const rows = []
        let running = 0
        const lastShiftIdx = sortedShiftTypes.length - 1
        sortedShiftTypes.forEach(([type, data], i) => {
            running = Math.round((running + data.hours) * 100) / 100
            rows.push({ kind: 'shift', type, label: SHIFT_TYPE_LABELS[type] || type,
                colors: SHIFT_TYPE_COLORS[type] || 'bg-gray-100 text-gray-700',
                hours: data.hours, count: data.count, running,
                isLastShift: i === lastShiftIdx && sortedAbsenceTypes.length === 0 && currentMonthCorrections.length === 0 })
        })
        const lastAbsIdx = sortedAbsenceTypes.length - 1
        sortedAbsenceTypes.forEach(([type, data], i) => {
            running = Math.round((running + data.hours) * 100) / 100
            rows.push({ kind: 'absence', type,
                colors: ABSENCE_TYPE_COLORS[type] || 'bg-gray-100 text-gray-700',
                hours: data.hours, days: data.days, running,
                isFirstAbsence: i === 0,
                isLastAbsence: i === lastAbsIdx && currentMonthCorrections.length === 0 })
        })
        currentMonthCorrections.forEach((corr, i) => {
            running = Math.round((running + corr.correction_hours) * 100) / 100
            rows.push({ kind: 'correction', hours: corr.correction_hours,
                reason: corr.reason, running, corr,
                isFirstCorrection: i === 0 })
        })
        return { rows, totalGeleistet: running }
    }, [sortedShiftTypes, sortedAbsenceTypes, currentMonthCorrections])

    const totalInterruptionCredit = useMemo(() => {
        // Netto-Gewinn: credited at 100% minus what passive would have been (50%)
        return Math.round(interruptionDetails.reduce((sum, d) => sum + (d.creditedMinutes - d.deductedMinutes * 0.5), 0) / 60 * 100) / 100
    }, [interruptionDetails])

    const totalInterruptionCount = useMemo(() => {
        return interruptionDetails.reduce((sum, d) => sum + d.count, 0)
    }, [interruptionDetails])

    const totalAdjustmentDiff = useMemo(() => {
        return Math.round(timeAdjustments.reduce((sum, a) => sum + a.diff, 0) * 100) / 100
    }, [timeAdjustments])

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="animate-pulse bg-gray-100 rounded-2xl h-24"></div>
                <div className="animate-pulse bg-gray-100 rounded-2xl h-64"></div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Nächster Dienst */}
            <div className="bg-white p-5 rounded-[1.5rem] shadow-[0_2px_10px_rgb(0,0,0,0.04)] border border-gray-100/80">
                <div className="flex items-center gap-2 mb-3">
                    <CalendarClock size={20} className="text-indigo-600" />
                    <h3 className="font-bold text-gray-900">Nächster Dienst</h3>
                </div>
                {nextShift ? (
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-bold text-gray-900">
                                {nextShift.type}{nextShift.title ? ` — ${nextShift.title}` : ''}
                            </p>
                            <p className="text-sm text-gray-500">
                                {format(new Date(nextShift.start_time), "EEEE, d. MMMM", { locale: de })}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-black text-indigo-700">
                                {format(new Date(nextShift.start_time), 'HH:mm')}
                            </p>
                            <p className="text-xs text-gray-400">
                                bis {format(new Date(nextShift.end_time), 'HH:mm')}
                            </p>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-gray-400">Keine anstehenden Dienste</p>
                )}
            </div>

            {/* Stundenkonto mit expandierbarer Aufschlüsselung */}
            {balance && (
                <div className="bg-white rounded-[1.5rem] shadow-[0_2px_10px_rgb(0,0,0,0.04)] border border-gray-100/80 overflow-hidden">
                    <button
                        onClick={() => setDetailExpanded(!detailExpanded)}
                        className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <Clock size={20} className="text-gray-700" />
                            <h3 className="font-bold text-gray-900">Stundenkonto</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${balance.total >= 0
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-red-50 text-red-700'
                                }`}>
                                {balance.total >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                {balance.total > 0 ? '+' : ''}{balance.total}h
                            </div>
                            {detailExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                        </div>
                    </button>

                    {/* Month navigation */}
                    {detailExpanded && (
                        <div className="flex items-center justify-center gap-3 px-5 pb-2">
                            <button
                                onClick={(e) => { e.stopPropagation(); setSelectedMonth(prev => subMonths(prev, 1)) }}
                                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                            >
                                <ChevronLeft size={18} className="text-gray-500" />
                            </button>
                            <span className="text-sm font-medium text-gray-700 min-w-[140px] text-center">
                                {format(selectedMonth, 'MMMM yyyy', { locale: de })}
                            </span>
                            <button
                                onClick={(e) => { e.stopPropagation(); setSelectedMonth(prev => addMonths(prev, 1)) }}
                                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                                disabled={isSameMonth(selectedMonth, new Date())}
                            >
                                <ChevronRight size={18} className={isSameMonth(selectedMonth, new Date()) ? 'text-gray-200' : 'text-gray-500'} />
                            </button>
                        </div>
                    )}

                    {detailExpanded && balance && (() => {
                        const monthLabel = format(selectedMonth, 'MMMM', { locale: de })
                        const { rows, totalGeleistet } = ledgerRows
                        const lastShiftIdx = rows.findLastIndex(r => r.kind === 'shift')
                        const lastAbsIdx = rows.findLastIndex(r => r.kind === 'absence')
                        const diffMonat = Math.round((totalGeleistet - balance.target) * 100) / 100

                        return (
                        <div className="px-5 pb-5 border-t border-gray-100 pt-4">
                            <p className="text-xs font-bold text-gray-400 uppercase mb-3">Stundenübersicht {monthLabel}</p>

                            {/* Kontoauszug-Zeilen */}
                            <div className="space-y-0">
                                {rows.map((row, i) => {
                                    const isLastShift = i === lastShiftIdx
                                    const isLastAbs = i === lastAbsIdx
                                    const showSeparator = row.isFirstAbsence || row.isFirstCorrection

                                    return (
                                        <div key={`${row.kind}-${row.type || i}`}>
                                            {showSeparator && <div className="border-t border-gray-200 my-1.5" />}
                                            <div className="flex items-center py-1.5 px-2 rounded-lg hover:bg-gray-50/50">
                                                {/* Links: Badge + Label */}
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    {row.kind === 'shift' && (
                                                        <>
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${row.colors}`}>
                                                                {row.type}
                                                            </span>
                                                            <span className="text-sm text-gray-600 truncate">{row.label}</span>
                                                        </>
                                                    )}
                                                    {row.kind === 'absence' && (
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${row.colors}`}>
                                                            {row.type}
                                                        </span>
                                                    )}
                                                    {row.kind === 'correction' && (
                                                        <>
                                                            <PenTool size={12} className="text-purple-500 shrink-0" />
                                                            <span className="text-sm text-gray-600 truncate">Korrektur</span>
                                                        </>
                                                    )}
                                                </div>

                                                {/* Mitte: Stunden + Count */}
                                                <div className="text-right w-24 shrink-0">
                                                    <span className="text-sm font-bold text-gray-900">{row.hours}h</span>
                                                    {row.count != null && (
                                                        <span className="text-[10px] text-gray-400 ml-1">({row.count}×)</span>
                                                    )}
                                                    {row.days != null && (
                                                        <span className="text-[10px] text-gray-400 ml-1">({row.days}d)</span>
                                                    )}
                                                </div>

                                                {/* Rechts: Laufende Summe */}
                                                <div className={`text-right w-16 shrink-0 font-mono text-sm ${
                                                    isLastShift && lastAbsIdx === -1 ? 'font-bold text-blue-700' :
                                                    isLastShift ? 'text-gray-400' :
                                                    isLastAbs ? 'font-bold text-gray-700' :
                                                    'text-gray-300'
                                                }`}>
                                                    {row.running}h
                                                </div>
                                            </div>

                                            {/* Korrektur-Details */}
                                            {row.kind === 'correction' && row.corr && (
                                                <div className="text-[10px] text-gray-400 ml-8 mb-1">
                                                    {row.corr.reason && <span>{row.corr.reason}</span>}
                                                    {row.corr.created_by_profile?.full_name && (
                                                        <span> · von {row.corr.created_by_profile.full_name}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}

                                {/* Unterbrechungen (aufklappbar, nach den Dienst-Rows) */}
                                {interruptionDetails.length > 0 && (
                                    <div className="mt-1 space-y-1">
                                        {interruptionDetails.map((item, idx) => {
                                            const dateStr = format(new Date(item.date), 'dd.MM.', { locale: de })
                                            const isExpanded = expandedInterruptions[`int-${idx}`]
                                            const netGain = Math.round((item.creditedMinutes - item.deductedMinutes * 0.5) / 60 * 100) / 100
                                            return (
                                                <div key={`int-${idx}`}>
                                                    <button
                                                        onClick={() => setExpandedInterruptions(prev => ({ ...prev, [`int-${idx}`]: !prev[`int-${idx}`] }))}
                                                        className="w-full flex items-center justify-between py-1 px-3 rounded-lg bg-orange-50/60 hover:bg-orange-100 transition-colors text-xs"
                                                    >
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">{dateStr}</span>
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">ND</span>
                                                            <span className="text-gray-500">{item.count}× Unterbr.</span>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <span className="font-bold text-orange-700">+{netGain}h</span>
                                                            {isExpanded ? <ChevronUp size={10} className="text-gray-400" /> : <ChevronDown size={10} className="text-gray-400" />}
                                                        </div>
                                                    </button>
                                                    {isExpanded && (
                                                        <div className="ml-4 mt-1 space-y-0.5 mb-1">
                                                            {item.details.map((d, di) => {
                                                                const actualH = Math.round(d.actualMinutes / 60 * 100) / 100
                                                                const creditedH = Math.round(d.creditedMinutes / 60 * 100) / 100
                                                                const detailNet = Math.round((d.creditedMinutes - d.actualMinutes * 0.5) / 60 * 100) / 100
                                                                return (
                                                                    <div key={di} className="flex items-center justify-between py-0.5 px-2 text-[11px]">
                                                                        <span className="text-gray-500">
                                                                            {format(new Date(d.start), 'HH:mm')}–{format(new Date(d.end), 'HH:mm')}
                                                                            <span className="text-gray-400 ml-1">({actualH}h{creditedH !== actualH ? ` → ${creditedH}h` : ''})</span>
                                                                        </span>
                                                                        <span className="text-orange-600 font-bold">+{detailNet}h</span>
                                                                    </div>
                                                                )
                                                            })}
                                                            <p className="text-[10px] text-gray-400 px-2">100% statt 50% Bereitschaft</p>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}

                                {/* Zeitkorrekturen (aufklappbar) */}
                                {timeAdjustments.length > 0 && (() => {
                                    const isExpanded = expandedInterruptions['adj-all']
                                    return (
                                        <div className="mt-1">
                                            <button
                                                onClick={() => setExpandedInterruptions(prev => ({ ...prev, ['adj-all']: !prev['adj-all'] }))}
                                                className="w-full flex items-center justify-between py-1 px-3 rounded-lg bg-cyan-50/60 hover:bg-cyan-100 transition-colors text-xs"
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700">±</span>
                                                    <span className="text-gray-500">Zeitkorrekturen ({timeAdjustments.length}×)</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <span className={`font-bold ${totalAdjustmentDiff >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                                        {totalAdjustmentDiff > 0 ? '+' : ''}{totalAdjustmentDiff}h
                                                    </span>
                                                    {isExpanded ? <ChevronUp size={10} className="text-gray-400" /> : <ChevronDown size={10} className="text-gray-400" />}
                                                </div>
                                            </button>
                                            {isExpanded && (
                                                <div className="ml-4 mt-1 space-y-0.5 mb-1">
                                                    {timeAdjustments.map((adj, idx) => {
                                                        const dateStr = format(new Date(adj.date), 'dd.MM.', { locale: de })
                                                        const colors = SHIFT_TYPE_COLORS[adj.shiftType] || 'bg-gray-100 text-gray-700'
                                                        return (
                                                            <div key={idx} className="flex items-center justify-between py-0.5 px-2 text-[11px]">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-gray-200 text-gray-600">{dateStr}</span>
                                                                    <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${colors}`}>{adj.shiftType}</span>
                                                                    <span className="text-gray-500">{adj.plannedHours}h → {adj.actualHours}h</span>
                                                                </div>
                                                                <span className={`font-bold ${adj.diff >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                                                    {adj.diff > 0 ? '+' : ''}{adj.diff}h
                                                                </span>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })()}

                                {(interruptionDetails.length > 0 || timeAdjustments.length > 0) && (
                                    <p className="text-[10px] text-gray-400 mt-1 px-2">Bereits in den Dienststunden enthalten.</p>
                                )}
                            </div>

                            {/* Saldo-Berechnung */}
                            <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
                                <div className="flex items-center justify-between px-2 py-1 text-sm">
                                    <span className="text-gray-500">Geleistet</span>
                                    <span className="font-mono font-bold text-gray-700">{totalGeleistet}h</span>
                                </div>
                                <div className="flex items-center justify-between px-2 py-1 text-sm">
                                    <span className="text-gray-500">Soll {monthLabel}</span>
                                    <span className="font-mono text-gray-500">−{balance.target}h</span>
                                </div>
                                <div className="border-t border-dashed border-gray-200 mx-2" />
                                <div className="flex items-center justify-between px-2 py-1 text-sm">
                                    <span className="text-gray-500">Differenz Monat</span>
                                    <span className={`font-mono font-bold ${diffMonat >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {diffMonat > 0 ? '+' : ''}{diffMonat}h
                                    </span>
                                </div>
                                <div className="flex items-center justify-between px-2 py-1 text-sm">
                                    <span className="text-gray-500">Übertrag Vormonate</span>
                                    <span className={`font-mono ${balance.carryover >= 0 ? 'text-gray-600' : 'text-red-600'}`}>
                                        {balance.carryover > 0 ? '+' : ''}{balance.carryover}h
                                    </span>
                                </div>
                                <div className="border-t-2 border-gray-300 mx-2" />
                                <div className="flex items-center justify-between px-2 py-1.5">
                                    <span className="text-sm font-bold text-gray-900">Gesamtsaldo</span>
                                    <span className={`font-mono font-black text-base ${balance.total >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {balance.total > 0 ? '+' : ''}{balance.total}h
                                    </span>
                                </div>
                            </div>
                        </div>
                        )
                    })()}
                </div>
            )}

            {/* Stundenverlauf 12 Monate */}
            {cumulativeData.length > 0 && (
                <div className="bg-white p-5 rounded-[1.5rem] shadow-[0_2px_10px_rgb(0,0,0,0.04)] border border-gray-100/80">
                    <div className="flex items-center gap-2 mb-1">
                        <BarChart3 size={20} className="text-gray-700" />
                        <h3 className="font-bold text-gray-900">Stundenverlauf</h3>
                    </div>
                    <p className="text-xs text-gray-400 mb-4">Monatlicher Saldo der letzten 12 Monate</p>

                    {/* Cumulative Trend Line */}
                    <div className="mt-2">
                        <div className="flex items-center justify-between mb-6">
                            <p className="text-xs text-gray-400">Kumulierter Gesamtsaldo am Monatsende</p>
                            <span className={`text-xs font-bold ${(cumulativeData[cumulativeData.length - 1]?.cumulative ?? 0) >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                                {(cumulativeData[cumulativeData.length - 1]?.cumulative ?? 0) > 0 ? '+' : ''}
                                {cumulativeData[cumulativeData.length - 1]?.cumulative ?? 0}h
                            </span>
                        </div>
                        <div className="relative h-28">
                            <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-gray-200" />
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 text-[9px] text-gray-300 -ml-1">0</div>
                            <svg className="w-full h-full overflow-visible" viewBox="0 0 500 100" preserveAspectRatio="none">
                                <polygon
                                    fill="url(#trendGradient)"
                                    opacity="0.15"
                                    points={[
                                        `${(0 / (cumulativeData.length - 1 || 1)) * 480 + 10},50`,
                                        ...cumulativeData.map((m, i) => {
                                            const x = (i / (cumulativeData.length - 1 || 1)) * 480 + 10
                                            const y = 50 - (m.cumulative / maxAbsCumulative) * 40
                                            return `${x},${y}`
                                        }),
                                        `${((cumulativeData.length - 1) / (cumulativeData.length - 1 || 1)) * 480 + 10},50`,
                                    ].join(' ')}
                                />
                                <defs>
                                    <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#0d9488" />
                                        <stop offset="100%" stopColor="#0d9488" stopOpacity="0" />
                                    </linearGradient>
                                </defs>
                                <polyline
                                    fill="none"
                                    stroke="#0d9488"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    vectorEffect="non-scaling-stroke"
                                    points={cumulativeData.map((m, i) => {
                                        const x = (i / (cumulativeData.length - 1 || 1)) * 480 + 10
                                        const y = 50 - (m.cumulative / maxAbsCumulative) * 40
                                        return `${x},${y}`
                                    }).join(' ')}
                                />
                                {cumulativeData.map((m, i) => {
                                    const x = (i / (cumulativeData.length - 1 || 1)) * 480 + 10
                                    const y = 50 - (m.cumulative / maxAbsCumulative) * 40
                                    return (
                                        <g key={m.month}>
                                            <circle
                                                cx={x}
                                                cy={y}
                                                r="4"
                                                fill={m.cumulative >= 0 ? '#0d9488' : '#ef4444'}
                                                stroke="white"
                                                strokeWidth="2"
                                                vectorEffect="non-scaling-stroke"
                                            />
                                            <text
                                                x={x}
                                                y={y - 8}
                                                fontSize="10"
                                                fill="#4b5563"
                                                textAnchor="middle"
                                                fontWeight="600"
                                            >
                                                {m.cumulative > 0 ? '+' : ''}{m.cumulative}
                                            </text>
                                        </g>
                                    )
                                })}
                            </svg>
                        </div>
                        <div className="flex gap-1 mt-1">
                            {cumulativeData.map(m => (
                                <div key={m.month} className="flex-1 text-center">
                                    <span className="text-[9px] text-gray-400">{m.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Einspring-Historie */}
            <div className="bg-white p-5 rounded-[1.5rem] shadow-[0_2px_10px_rgb(0,0,0,0.04)] border border-gray-100/80">
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                        <Zap size={20} className="text-emerald-600" />
                        <h3 className="font-bold text-gray-900">Einspring-Historie</h3>
                    </div>
                    <span className="text-xs text-gray-400">Team-Schnitt: {teamAvgFlex}×</span>
                </div>
                <p className="text-xs text-gray-400 mb-4">Flex-Einsätze pro Monat</p>

                <div className="flex items-end gap-1 h-20 mb-1">
                    {flexMonths.map(m => {
                        const barHeight = maxFlex > 0 ? (m.count / maxFlex) * 100 : 0
                        return (
                            <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full relative">
                                {m.count > 0 && (
                                    <div 
                                        className="absolute left-1/2 -translate-x-1/2 pb-1 text-[10px] font-bold text-emerald-700 z-10"
                                        style={{ bottom: `${Math.max(barHeight, 8)}%` }}
                                    >
                                        {m.count}
                                    </div>
                                )}
                                {m.count > 0 ? (
                                    <div
                                        className="w-full bg-emerald-400 rounded-t-sm transition-all"
                                        style={{ height: `${Math.max(barHeight, 8)}%` }}
                                    />
                                ) : (
                                    <div className="w-full bg-gray-100 rounded-t-sm" style={{ height: '4%' }} />
                                )}
                            </div>
                        )
                    })}
                </div>
                <div className="flex gap-1">
                    {flexMonths.map(m => (
                        <div key={m.month} className="flex-1 text-center">
                            <span className="text-[9px] text-gray-400">{m.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Bereitschafts-Unterbrechungen */}
            <div className="bg-white p-5 rounded-[1.5rem] shadow-[0_2px_10px_rgb(0,0,0,0.04)] border border-gray-100/80">
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                        <BellRing size={20} className="text-orange-500" />
                        <h3 className="font-bold text-gray-900">Bereitschafts-Unterbrechungen</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        {totalInterruptionsThisMonth > 0 && (
                            <span className="text-xs font-bold bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">
                                {totalInterruptionsThisMonth}× diesen Monat
                            </span>
                        )}
                        <span className="text-xs text-gray-400">{totalInterruptionsAllTime}× gesamt</span>
                    </div>
                </div>
                <p className="text-xs text-gray-400 mb-4">Wechsel von Bereitschaft zu aktiver Arbeit pro Monat (ND)</p>

                {interruptionMonths.some(m => m.count > 0) ? (
                    <>
                        <div className="flex items-end gap-1 h-20 mb-1">
                            {interruptionMonths.map(m => {
                                const barHeight = maxInterruptions > 0 ? (m.count / maxInterruptions) * 100 : 0
                                return (
                                    <div key={m.month} className="flex-1 flex flex-col items-center justify-end h-full relative">
                                        {m.count > 0 && (
                                            <div 
                                                className="absolute left-1/2 -translate-x-1/2 pb-1 text-[10px] font-bold text-orange-700 z-10"
                                                style={{ bottom: `${Math.max(barHeight, 8)}%` }}
                                            >
                                                {m.count}
                                            </div>
                                        )}
                                        {m.count > 0 ? (
                                            <div
                                                className="w-full bg-orange-400 rounded-t-sm transition-all"
                                                style={{ height: `${Math.max(barHeight, 8)}%` }}
                                            />
                                        ) : (
                                            <div className="w-full bg-gray-100 rounded-t-sm" style={{ height: '4%' }} />
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                        <div className="flex gap-1">
                            {interruptionMonths.map(m => (
                                <div key={m.month} className="flex-1 text-center">
                                    <span className="text-[9px] text-gray-400">{m.label}</span>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <p className="text-sm text-gray-400">Keine Unterbrechungen in den letzten 12 Monaten</p>
                )}
            </div>
        </div>
    )
}
