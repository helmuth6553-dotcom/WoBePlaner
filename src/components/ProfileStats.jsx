import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import { Clock, TrendingUp, TrendingDown, Zap, BarChart3, CalendarClock, ChevronDown, ChevronUp, BellRing } from 'lucide-react'
import { format, startOfMonth, endOfMonth, isSameMonth, eachDayOfInterval, isWeekend } from 'date-fns'
import { de } from 'date-fns/locale'
import { calculateGenericBalance } from '../utils/balanceHelpers'
import { calculateMonthlyHistory } from '../utils/monthlyHistory'
import { calculateWorkHours, calculateDailyAbsenceHours } from '../utils/timeCalculations'
import { getHolidays, isHoliday } from '../utils/holidays'

const SHIFT_TYPE_LABELS = {
    TD1: 'Tagdienst 1',
    TD2: 'Tagdienst 2',
    ND: 'Nachtdienst',
    DBD: 'Doppeldienst',
    TEAM: 'Teamsitzung',
    FORTBILDUNG: 'Fortbildung',
    EINSCHULUNG: 'Einschulung',
}

const SHIFT_TYPE_COLORS = {
    TD1: 'bg-blue-100 text-blue-700',
    TD2: 'bg-sky-100 text-sky-700',
    ND: 'bg-indigo-100 text-indigo-700',
    DBD: 'bg-violet-100 text-violet-700',
    TEAM: 'bg-purple-100 text-purple-700',
    FORTBILDUNG: 'bg-fuchsia-100 text-fuchsia-700',
    EINSCHULUNG: 'bg-pink-100 text-pink-700',
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
            .select('correction_hours, effective_month')
            .eq('user_id', user.id)

        try {
            const b = calculateGenericBalance(
                profile, allMyShifts, myAbsences || [], myEntries || [], new Date(), myCorrs || []
            )
            setBalance(b)

            const history = calculateMonthlyHistory(
                profile, allMyShifts, myAbsences || [], myEntries || [], myCorrs || [], 12
            )
            setMonthlyData(history)

            // --- Compute shift breakdown for current month ---
            const now = new Date()
            const mStart = startOfMonth(now)
            const mEnd = endOfMonth(now)
            const entryMap = {}
                ; (myEntries || []).forEach(e => { if (e.shift_id) entryMap[e.shift_id] = e })

            const currentShifts = allMyShifts.filter(s => {
                if (!s.start_time) return false
                const d = new Date(s.start_time)
                return isSameMonth(d, now)
            })

            const breakdown = {}
            currentShifts.forEach(shift => {
                const type = normalizeType(shift.type)
                const entry = entryMap[shift.id]
                let hours = 0
                if (entry && (entry.calculated_hours || entry.calculated_hours === 0)) {
                    hours = entry.calculated_hours
                } else if (shift.start_time && shift.end_time) {
                    hours = calculateWorkHours(shift.start_time, shift.end_time, type)
                }
                if (!breakdown[type]) breakdown[type] = { hours: 0, count: 0 }
                breakdown[type].hours += hours
                breakdown[type].count += 1
            })
            // Round
            Object.keys(breakdown).forEach(k => {
                breakdown[k].hours = Math.round(breakdown[k].hours * 100) / 100
            })
            setShiftBreakdown(breakdown)

            // --- Compute absence breakdown for current month ---
            const year = now.getFullYear()
            const holidays = getHolidays(year)
            const absBreak = {}
                ; (myAbsences || []).forEach(abs => {
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
                        // Estimate days
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

            // --- Compute interruptions (Bereitschaft → aktiv) by month ---
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

        } catch (err) {
            console.error('ProfileStats balance error:', err)
        }
    }

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
                            <span className="text-xs text-gray-400">
                                {format(new Date(), 'MMMM yyyy', { locale: de })}
                            </span>
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

                    {detailExpanded && (
                        <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
                            {/* Geleistete Stunden nach Diensttyp */}
                            {sortedShiftTypes.length > 0 && (
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase mb-2">Geleistete Stunden</p>
                                    <div className="space-y-1.5">
                                        {sortedShiftTypes.map(([type, data]) => {
                                            const label = SHIFT_TYPE_LABELS[type] || type
                                            const colors = SHIFT_TYPE_COLORS[type] || 'bg-gray-100 text-gray-700'
                                            return (
                                                <div key={type} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-gray-50">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${colors}`}>
                                                            {type}
                                                        </span>
                                                        <span className="text-sm text-gray-600">{label}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-sm font-bold text-gray-900">{data.hours}h</span>
                                                        <span className="text-[10px] text-gray-400 ml-1">({data.count}×)</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div className="flex justify-end mt-1.5 pr-3">
                                        <span className="text-xs font-bold text-gray-500">
                                            Gesamt Ist: {Math.round(totalShiftHours * 100) / 100}h
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Abwesenheiten nach Typ */}
                            {sortedAbsenceTypes.length > 0 && (
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase mb-2">Abwesenheiten</p>
                                    <div className="space-y-1.5">
                                        {sortedAbsenceTypes.map(([type, data]) => {
                                            const colors = ABSENCE_TYPE_COLORS[type] || 'bg-gray-100 text-gray-700'
                                            return (
                                                <div key={type} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-gray-50">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${colors}`}>
                                                            {type}
                                                        </span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-sm font-bold text-gray-900">{data.hours}h</span>
                                                        <span className="text-[10px] text-gray-400 ml-1">({data.days} Tage)</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div className="flex justify-end mt-1.5 pr-3">
                                        <span className="text-xs font-bold text-gray-500">
                                            Gesamt Abwesenheit: {Math.round(totalAbsenceHours * 100) / 100}h
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Saldo-Berechnung */}
                            <div className="border-t border-gray-100 pt-3">
                                <p className="text-xs font-bold text-gray-400 uppercase mb-2">Saldo-Berechnung</p>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Soll</span>
                                        <span className="font-bold text-gray-700">{balance.target}h</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Ist (gearbeitet)</span>
                                        <span className="font-bold text-blue-700">{balance.actual}h</span>
                                    </div>
                                    {balance.vacation > 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">+ Abwesenheit (angerechnet)</span>
                                            <span className="font-bold text-amber-700">{balance.vacation}h</span>
                                        </div>
                                    )}
                                    <div className="border-t border-dashed border-gray-200 my-1"></div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Differenz Monat</span>
                                        <span className={`font-bold ${balance.diff >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                            {balance.diff > 0 ? '+' : ''}{balance.diff}h
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Übertrag Vormonate</span>
                                        <span className={`font-bold ${balance.carryover >= 0 ? 'text-gray-700' : 'text-red-700'}`}>
                                            {balance.carryover > 0 ? '+' : ''}{balance.carryover}h
                                        </span>
                                    </div>
                                    {balance.correction !== 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">Korrekturen</span>
                                            <span className="font-bold text-purple-700">
                                                {balance.correction > 0 ? '+' : ''}{balance.correction}h
                                            </span>
                                        </div>
                                    )}
                                    <div className="border-t border-gray-200 my-1"></div>
                                    <div className="flex justify-between text-sm">
                                        <span className="font-bold text-gray-900">Gesamtsaldo</span>
                                        <span className={`font-black text-base ${balance.total >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                            {balance.total > 0 ? '+' : ''}{balance.total}h
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
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
