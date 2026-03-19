import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { format, startOfMonth, endOfMonth, subMonths, addMonths, startOfYear, subYears, addYears } from 'date-fns'
import { de } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, BarChart3, Activity, Users, ChevronDown, ChevronUp, Layers, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { calculateWorkHours, processInterruptions } from '../../utils/timeCalculations'
import { calculateGenericBalance } from '../../utils/balanceHelpers'
import { getHolidays, isHoliday } from '../../utils/holidays'
import { calculateAllFairnessIndices } from '../../utils/fairnessIndex'
import { eachDayOfInterval, isWeekend, getDay, differenceInDays, getYear } from 'date-fns'

// ─── Insights Engine ───
function generateInsights(stats, employeeStats, monthlyData) {
    if (!stats || !employeeStats?.length) return []
    const insights = []
    const prev = monthlyData?.length >= 2 ? monthlyData[monthlyData.length - 2]?.stats : null

    // 1. Häufigster Kranktag
    const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
    const sickDays = Object.entries(stats.sickByDayOfWeek || {})
    const maxSickDay = sickDays.reduce((max, [d, c]) => c > max[1] ? [d, c] : max, ['0', 0])
    if (maxSickDay[1] > 0) {
        const avg = sickDays.reduce((s, [, c]) => s + c, 0) / 7
        if (maxSickDay[1] > avg * 1.5 && avg > 0) {
            const ratio = (maxSickDay[1] / avg).toFixed(1)
            insights.push({ color: 'amber', text: `${days[maxSickDay[0]]}`, detail: `hat ${ratio}× so viele Krankmeldungen wie der Durchschnitt`, priority: maxSickDay[1] })
        }
    }

    // 2. MA mit höchstem Puffer (Überlastungsrisiko)
    const sorted = [...employeeStats].sort((a, b) => b.puffer - a.puffer)
    if (sorted[0]?.puffer > 20) {
        insights.push({ color: 'orange', text: `${sorted[0].name.split(' ')[0]}`, detail: `hat ${sorted[0].puffer > 0 ? '+' : ''}${sorted[0].puffer}h Überstunden — höchste im Team`, priority: sorted[0].puffer })
    }

    // 3. MA mit niedrigstem Puffer (Defizit)
    const lowest = sorted[sorted.length - 1]
    if (lowest?.puffer < -10) {
        insights.push({ color: 'rose', text: `${lowest.name.split(' ')[0]}`, detail: `hat ${lowest.puffer}h Defizit — höchster negativer Puffer`, priority: Math.abs(lowest.puffer) })
    }

    // 4. Flex Δ vs. Vormonat
    if (prev) {
        const flexDelta = stats.flexCount - (prev.flexCount || 0)
        if (flexDelta !== 0) {
            const sign = flexDelta > 0 ? '+' : ''
            insights.push({ color: flexDelta > 0 ? 'emerald' : 'rose', text: `Flex-Einsätze ${sign}${flexDelta} vs. Vormonat`, detail: `— Team deckt ${flexDelta > 0 ? 'mehr' : 'weniger'} ab`, priority: Math.abs(flexDelta) * 3 })
        }
    }

    // 5. Krank-Trend (3+ Monate steigend)
    if (monthlyData?.length >= 3) {
        const last3 = monthlyData.slice(-3).map(m => m.stats.sickCount)
        if (last3[0] < last3[1] && last3[1] < last3[2] && last3[2] > 0) {
            insights.push({ color: 'rose', text: 'Krankmeldungen steigen', detail: `seit 3 Monaten (${last3.join(' → ')})`, priority: last3[2] * 5 })
        }
    }

    // 6. MA ohne Arbeit diesen Monat
    const noWork = employeeStats.filter(e => e.workedHours === 0 && e.sickHours === 0 && e.vacationHours === 0)
    noWork.forEach(e => {
        insights.push({ color: 'rose', text: `${e.name.split(' ')[0]}`, detail: `0h erfasst diesen Monat`, priority: 30 })
    })

    return insights.sort((a, b) => b.priority - a.priority).slice(0, 3)
}

// ─── Sparkline Component ───
function Sparkline({ data, width = 80, height = 20 }) {
    if (!data || data.length < 2) return <div style={{ width, height }} />
    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1
    const points = data.map((v, i) => {
        const x = 2 + (i / (data.length - 1)) * (width - 4)
        const y = height - ((v - min) / range) * (height - 4) - 2
        return `${x},${y}`
    }).join(' ')
    const lastVal = data[data.length - 1]
    const lastX = width - 2
    const lastY = height - ((lastVal - min) / range) * (height - 4) - 2
    const color = lastVal >= 0 ? '#059669' : '#f43f5e'

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-16 h-4">
            <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
            <circle cx={lastX} cy={lastY} r="2" fill={color} />
        </svg>
    )
}

// ─── Delta Indicator ───
function Delta({ current, previous, inverted = false }) {
    if (previous === undefined || previous === null) return null
    const diff = current - previous
    if (diff === 0) return <span className="text-[9px] font-bold text-gray-400">±0</span>
    const isUp = diff > 0
    const isPositive = inverted ? !isUp : isUp
    return (
        <span className={`text-[9px] font-bold ${isPositive ? 'text-emerald-600' : 'text-rose-500'}`}>
            {isUp ? '+' : '−'}{Math.abs(diff)}
        </span>
    )
}

/**
 * AdminOverview — Mockup-exaktes Design mit echten Daten
 */
export default function AdminOverview() {
    const [selectedMonth, setSelectedMonth] = useState(new Date())
    const [globalMode, setGlobalMode] = useState('monat')
    const [stats, setStats] = useState(null)
    const [employeeStats, setEmployeeStats] = useState([])
    const [monthlyData, setMonthlyData] = useState([])
    const [fairnessData, setFairnessData] = useState([])
    const [loading, setLoading] = useState(true)
    const [showWorkedDetails, setShowWorkedDetails] = useState(false)
    const [showSickDetails, setShowSickDetails] = useState(false)
    const [expandedEmployeeIds, setExpandedEmployeeIds] = useState([])
    const [selectedAreaMonth, setSelectedAreaMonth] = useState(null)
    const [showProfil, setShowProfil] = useState(false)
    const [profilSort, setProfilSort] = useState('total')

    const toggleEmployee = (id) => {
        setExpandedEmployeeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }

    useEffect(() => {
        fetchAll()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMonth, globalMode])

    // ─── Shared month calculation ───
    const calcMonthStats = async (monthDate) => {
        const start = startOfMonth(monthDate)
        const end = endOfMonth(monthDate)
        const startStr = start.toISOString()
        const endStr = end.toISOString()
        const startDateStr = format(start, 'yyyy-MM-dd')
        const endDateStr = format(end, 'yyyy-MM-dd')

        const [shiftsRes, profilesRes, entriesRes, absencesRes, interestsRes, logsRes, correctionsRes] = await Promise.all([
            supabase.from('shifts').select('*').gte('start_time', startStr).lte('start_time', endStr),
            supabase.from('profiles').select('id, weekly_hours, role, full_name, display_name, email, start_date, created_at, initial_balance').or('is_active.eq.true,is_active.is.null'),
            supabase.from('time_entries').select('*, shifts(*)').gte('actual_start', startStr).lte('actual_start', endStr),
            supabase.from('absences').select('*').eq('status', 'genehmigt').lte('start_date', endDateStr).gte('end_date', startDateStr),
            supabase.from('shift_interests').select('*, shifts(*)'),
            supabase.from('shift_logs').select('*, shift:shifts(start_time)'),
            supabase.from('balance_corrections').select('*')
        ])

        const shifts = shiftsRes.data
        const profiles = profilesRes.data
        const entries = entriesRes.data
        const absences = absencesRes.data
        const corrections = correctionsRes.data || []

        const monthInterests = interestsRes.data?.filter(i => {
            if (!i.shifts?.start_time) return false
            const d = new Date(i.shifts.start_time)
            return d >= start && d <= end
        }) || []

        const monthSwaps = logsRes.data?.filter(log => {
            if (!log.shift?.start_time) return false
            const d = new Date(log.shift.start_time)
            return d >= start && d <= end
        }) || []

        // Entry-Map: shift_id → { user_id → time_entry } (2-stufig für TEAM/Fortbildung)
        const entryMap = {}
        entries?.forEach(e => {
            if (e.shift_id) {
                if (!entryMap[e.shift_id]) entryMap[e.shift_id] = {}
                entryMap[e.shift_id][e.user_id] = e
            }
        })

        const getShiftHours = (shift, userId) => {
            const shiftEntries = entryMap[shift.id]
            const entry = userId ? shiftEntries?.[userId] : Object.values(shiftEntries || {})[0]
            if (entry && (entry.calculated_hours || entry.calculated_hours === 0)) {
                return Number(entry.calculated_hours)
            }
            return calculateWorkHours(shift.start_time, shift.end_time, shift.type)
        }

        const shiftHours = { TD: 0, TD1: 0, TD2: 0, ND: 0, DBD: 0, AST: 0, TEAM: 0, FORTBILDUNG: 0, EINSCHULUNG: 0, MITARBEITERGESPRAECH: 0, SONSTIGES: 0, SUPERVISION: 0 }
        const sickHours = { TD1: 0, TD2: 0, ND: 0, DBD: 0, AST: 0, TEAM: 0, FORTBILDUNG: 0, EINSCHULUNG: 0, MITARBEITERGESPRAECH: 0, SONSTIGES: 0, SUPERVISION: 0 }
        let flexCount = 0
        let sickCount = 0
        const swapCount = monthSwaps.length
        const employees = profiles?.filter(p => p.role !== 'admin') || []

        // Build per-employee absence day sets to exclude TEAM shifts on vacation/sick days
        const empAbsenceDays = {}
        absences?.forEach(abs => {
            if (!abs.user_id || !abs.start_date || !abs.end_date) return
            const absStart = new Date(abs.start_date) < start ? start : new Date(abs.start_date)
            const absEnd = new Date(abs.end_date) > end ? end : new Date(abs.end_date)
            if (absStart <= absEnd) {
                if (!empAbsenceDays[abs.user_id]) empAbsenceDays[abs.user_id] = new Set()
                eachDayOfInterval({ start: absStart, end: absEnd }).forEach(d => {
                    if (!isWeekend(d)) empAbsenceDays[abs.user_id].add(d.toISOString().split('T')[0])
                })
            }
        })
        const allAbsenceDaysByUser = empAbsenceDays

        // Planned hours
        let totalPlannedHours = 0
        shifts?.forEach(s => {
            if (!['TEAM', 'FORTBILDUNG', 'EINSCHULUNG', 'MITARBEITERGESPRAECH', 'SONSTIGES', 'SUPERVISION'].includes(s.type)) {
                totalPlannedHours += calculateWorkHours(s.start_time, s.end_time, s.type)
            }
        })
        shifts?.filter(s => s.type === 'TEAM').forEach(s => {
            const dateKey = new Date(s.start_time).toISOString().split('T')[0]
            const availableCount = employees.filter(emp => !allAbsenceDaysByUser[emp.id]?.has(dateKey)).length
            totalPlannedHours += calculateWorkHours(s.start_time, s.end_time, s.type) * availableCount
        })
        shifts?.filter(s => ['FORTBILDUNG', 'EINSCHULUNG', 'MITARBEITERGESPRAECH', 'SONSTIGES', 'SUPERVISION'].includes(s.type)).forEach(s => {
            totalPlannedHours += calculateWorkHours(s.start_time, s.end_time, s.type) * monthInterests.filter(i => i.shift_id === s.id).length
        })

        // Soll & holidays (for vacation detail calculations)
        const daysInMonth = eachDayOfInterval({ start, end })
        const holidays = getHolidays(getYear(start))
        let totalSollHours = 0 // Will be derived from per-employee calculateGenericBalance results

        const SPECIAL_TYPES = ['FORTBILDUNG', 'EINSCHULUNG', 'MITARBEITERGESPRAECH', 'SONSTIGES', 'SUPERVISION']

        // Sick
        absences?.forEach(abs => {
            if (abs.type !== 'Krank' && abs.type !== 'Krankenstand') return
            sickCount++
            abs.planned_shifts_snapshot?.forEach(shift => {
                const type = shift.type?.toUpperCase()
                if (Object.hasOwn(sickHours, type)) sickHours[type] += calculateWorkHours(shift.start_time, shift.end_time, shift.type)
            })
        })

        // Vacation
        let totalVacationHours = 0
        absences?.forEach(abs => {
            if (abs.type !== 'Urlaub') return
            const absStart = new Date(abs.start_date) < start ? start : new Date(abs.start_date)
            const absEnd = new Date(abs.end_date) > end ? end : new Date(abs.end_date)
            if (absStart <= absEnd) {
                const vacWorkDays = eachDayOfInterval({ start: absStart, end: absEnd }).filter(d => !isWeekend(d) && !isHoliday(d, holidays)).length
                const user = employees.find(e => e.id === abs.user_id)
                totalVacationHours += vacWorkDays * ((user?.weekly_hours || 40) / 5)
            }
        })

        // Flex
        const urgentShifts = shifts?.filter(s => s.urgent_since) || []
        const autoFlex = urgentShifts.filter(s => monthInterests.some(i => i.shift_id === s.id)).map(s => s.id)
        const manualFlex = monthInterests.filter(i => i.is_flex === true).map(i => i.shift_id)
        flexCount = new Set([...autoFlex, ...manualFlex]).size

        // Interruptions
        let totalInterruptionCount = 0, totalInterruptionNetGain = 0
        entries?.forEach(entry => {
            if (!entry.interruptions?.length) return
            const shiftStart = new Date(entry.actual_start || entry.shifts?.start_time)
            if (isNaN(shiftStart.getTime())) return
            let rStart = new Date(shiftStart)
            if (shiftStart.getHours() >= 12) rStart = new Date(rStart.getTime() + 86400000)
            rStart.setHours(0, 30, 0, 0)
            const rEnd = new Date(rStart)
            rEnd.setHours(6, 0, 0, 0)
            const res = processInterruptions(entry.interruptions, rStart, rEnd)
            totalInterruptionCount += res.rawCount
            totalInterruptionNetGain += (res.creditedMinutes - res.deductedReadinessMinutes * 0.5) / 60
        })

        const nightShiftCount = shifts?.filter(s => s.type === 'ND' && (s.assigned_to || monthInterests.some(i => i.shift_id === s.id))).length || 0
        const weekendShiftCount = shifts?.filter(s => { const d = new Date(s.start_time); return (d.getDay() === 0 || d.getDay() === 6) && (s.assigned_to || monthInterests.some(i => i.shift_id === s.id)) }).length || 0
        const sickByDayOfWeek = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
        absences?.forEach(abs => { if (abs.type === 'Krank' || abs.type === 'Krankenstand') sickByDayOfWeek[new Date(abs.start_date).getDay()]++ })

        const totalSickHours = Object.values(sickHours).reduce((a, b) => a + b, 0)

        // Per-employee — uses calculateGenericBalance as Single Source of Truth
        const empStats = employees.map(emp => {
            const wh = emp.weekly_hours || 40

            // Build employee's shift list (same assignment logic as before)
            const empShifts = shifts?.filter(s => {
                const type = s.type?.toUpperCase()
                if (type === 'TEAM') return true // TEAM for everyone (absence exclusion handled by calculateGenericBalance)
                if (SPECIAL_TYPES.includes(type)) {
                    return monthInterests.some(i => i.shift_id === s.id && i.user_id === emp.id)
                }
                return s.assigned_to === emp.id
                    || monthInterests.some(i => i.shift_id === s.id && i.user_id === emp.id)
            }) || []

            const empAbsences = absences?.filter(a => a.user_id === emp.id) || []
            const empEntries = entries?.filter(e => e.user_id === emp.id) || []
            const empCorrections = corrections?.filter(c => c.user_id === emp.id) || []

            // Call calculateGenericBalance with detailed mode — Single Source of Truth
            const b = calculateGenericBalance(
                emp, empShifts, empAbsences, empEntries, monthDate, empCorrections, { detailed: true }
            )

            // Map detailed shiftTypeHours { TD: { hours, count } } → flat { TD: hours }
            const flatShiftHours = {}
            if (b?.shiftTypeHours) {
                Object.entries(b.shiftTypeHours).forEach(([k, v]) => { flatShiftHours[k] = v.hours })
            }

            // Operative metrics (NOT part of hour calculation, remain local)
            let empFlex = 0
            urgentShifts.forEach(s => { if (monthInterests.find(i => i.shift_id === s.id && i.user_id === emp.id)) empFlex++ })
            let empSwap = 0
            monthSwaps.forEach(sw => { if (sw.new_user_id === emp.id || sw.old_user_id === emp.id) empSwap++ })

            // Vacation detail stats (display metrics, not hour calculation)
            let empVacDays = 0, leadTime = 0, vacCount = 0, maxBlock = 0, bridgeDays = 0
            absences?.forEach(abs => {
                if (abs.user_id !== emp.id || abs.type !== 'Urlaub') return
                const s0 = new Date(abs.start_date) < start ? start : new Date(abs.start_date)
                const e0 = new Date(abs.end_date) > end ? end : new Date(abs.end_date)
                if (s0 <= e0) {
                    const full = eachDayOfInterval({ start: new Date(abs.start_date), end: new Date(abs.end_date) })
                    const net = full.filter(d => !isWeekend(d) && !isHoliday(d, holidays))
                    empVacDays += net.length
                    if (net.length > maxBlock) maxBlock = net.length
                    leadTime += differenceInDays(new Date(abs.start_date), new Date(abs.created_at))
                    vacCount++
                    net.forEach(d => { const day = getDay(d); if (day === 1 || day === 5) bridgeDays++ })
                }
            })

            const workedHours = b ? (b.actual - b.correction) : 0
            const sickHours = b?.absenceBreakdown?.Krank?.hours || 0
            const vacationHours = b ? b.vacation : 0
            const istHours = workedHours + sickHours + vacationHours

            return {
                id: emp.id, name: emp.display_name || emp.full_name || emp.email || 'Unbekannt',
                weeklyHours: wh, sollHours: b ? b.target : 0,
                workedHours: Math.round(workedHours * 100) / 100,
                sickHours: Math.round(sickHours * 100) / 100,
                vacationHours: Math.round(vacationHours * 100) / 100,
                istHours: Math.round(istHours * 100) / 100,
                puffer: b ? b.total : 0, // Gesamt-Puffer inkl. Carryover
                sickCount: empAbsences.filter(a => a.type === 'Krank' || a.type === 'Krankenstand').length,
                flexCount: empFlex, swapCount: empSwap,
                nightShiftCount: empShifts.filter(s => s.type === 'ND').length,
                weekendShiftCount: empShifts.filter(s => { const d = new Date(s.start_time); return d.getDay() === 0 || d.getDay() === 6 }).length,
                dbdCount: empShifts.filter(s => s.type === 'DBD').length,
                interruptionCount: b?.interruptions?.count || 0,
                trainingHours: flatShiftHours.FORTBILDUNG || 0,
                vacationDaysNet: empVacDays,
                avgLeadTime: vacCount > 0 ? Math.round(leadTime / vacCount) : 0,
                longestVacationBlock: maxBlock,
                bridgeDayRatio: empVacDays > 0 ? Math.round((bridgeDays / empVacDays) * 100) : 0,
                shiftTypeHours: flatShiftHours
            }
        })

        // Aggregate top-level stats from per-employee results (Single Source of Truth)
        empStats.forEach(emp => {
            Object.entries(emp.shiftTypeHours).forEach(([type, hours]) => {
                if (Object.hasOwn(shiftHours, type)) shiftHours[type] += hours
            })
        })
        const totalWorkedHours = Object.values(shiftHours).reduce((a, b) => a + b, 0)
        // Derive team totals from per-employee stats (consistent with calculateGenericBalance)
        totalSollHours = empStats.reduce((sum, e) => sum + e.sollHours, 0)
        totalVacationHours = empStats.reduce((sum, e) => sum + e.vacationHours, 0)
        const totalIstHours = empStats.reduce((sum, e) => sum + e.istHours, 0)

        return {
            stats: {
                shiftHours, sickHours, flexCount, sickCount, swapCount,
                totalWorkedHours, totalSickHours,
                totalVacationHours: Math.round(totalVacationHours * 100) / 100,
                totalSollHours: Math.round(totalSollHours * 100) / 100,
                totalIstHours: Math.round(totalIstHours * 100) / 100,
                totalPlannedHours: Math.round(totalPlannedHours * 100) / 100,
                puffer: Math.round((totalIstHours - totalSollHours) * 100) / 100,
                employeeCount: employees.length,
                totalInterruptionCount,
                totalInterruptionNetGain: Math.round(totalInterruptionNetGain * 100) / 100,
                sickByDayOfWeek, nightShiftCount, weekendShiftCount
            },
            employeeStats: empStats,
            label: format(monthDate, 'MMM', { locale: de })
        }
    }

    const fetchAll = async () => {
        setLoading(true)
        try {
            // Determine month range based on mode
            let promises = []
            if (globalMode === 'jahr') {
                const yearStart = startOfYear(selectedMonth)
                for (let i = 0; i < 12; i++) promises.push(calcMonthStats(addMonths(yearStart, i)))
            } else {
                for (let i = 11; i >= 0; i--) promises.push(calcMonthStats(subMonths(selectedMonth, i)))
            }
            const results = await Promise.all(promises)
            setMonthlyData(results)

            if (globalMode === 'jahr') {
                // Aggregate all 12 months for year view
                const aggregated = aggregateYearStats(results)
                setStats(aggregated.stats)
                setEmployeeStats(aggregated.employeeStats)
            } else {
                const current = results[results.length - 1]
                setStats(current.stats)
                setEmployeeStats(current.employeeStats)
            }

            // Fairness index
            try {
                const empIds = (globalMode === 'jahr' ? aggregateYearStats(results).employeeStats : results[results.length - 1].employeeStats).map(e => e.id)
                const sixMonthsAgo = subMonths(selectedMonth, 6).toISOString()
                const [flexRes, votesRes] = await Promise.all([
                    supabase.from('shift_interests').select('user_id').eq('is_flex', true).gte('created_at', sixMonthsAgo),
                    supabase.from('coverage_votes').select('user_id, was_eligible, responded').gte('created_at', sixMonthsAgo)
                ])
                if (flexRes.data && votesRes.data) {
                    const fi = calculateAllFairnessIndices(empIds, flexRes.data, votesRes.data)
                    const currentEmpStats = globalMode === 'jahr' ? aggregateYearStats(results).employeeStats : results[results.length - 1].employeeStats
                    const named = fi.map(f => ({ ...f, name: currentEmpStats.find(e => e.id === f.userId)?.name || '?' }))
                    setFairnessData(named)
                }
            } catch { /* coverage_votes table may not exist */ }
        } catch (err) {
            console.error('AdminOverview Error:', err)
        } finally {
            setLoading(false)
        }
    }

    // Year aggregation helper
    const aggregateYearStats = (results) => {
        const validResults = results.filter(r => r?.stats)
        if (!validResults.length) return { stats: null, employeeStats: [] }

        const agg = {
            shiftHours: {},
            sickHours: {},
            flexCount: 0, sickCount: 0, swapCount: 0,
            totalWorkedHours: 0, totalSickHours: 0,
            totalVacationHours: 0, totalSollHours: 0, totalIstHours: 0, totalPlannedHours: 0,
            puffer: 0, employeeCount: validResults[validResults.length - 1].stats.employeeCount,
            totalInterruptionCount: 0, totalInterruptionNetGain: 0,
            sickByDayOfWeek: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
            nightShiftCount: 0, weekendShiftCount: 0
        }

        validResults.forEach(r => {
            const s = r.stats
            Object.entries(s.shiftHours || {}).forEach(([k, v]) => { agg.shiftHours[k] = (agg.shiftHours[k] || 0) + v })
            Object.entries(s.sickHours || {}).forEach(([k, v]) => { agg.sickHours[k] = (agg.sickHours[k] || 0) + v })
            agg.flexCount += s.flexCount
            agg.sickCount += s.sickCount
            agg.swapCount += s.swapCount
            agg.totalWorkedHours += s.totalWorkedHours
            agg.totalSickHours += s.totalSickHours
            agg.totalVacationHours += s.totalVacationHours
            agg.totalSollHours += s.totalSollHours
            agg.totalIstHours += s.totalIstHours
            agg.totalPlannedHours += s.totalPlannedHours
            agg.totalInterruptionCount += s.totalInterruptionCount
            agg.totalInterruptionNetGain += s.totalInterruptionNetGain
            agg.nightShiftCount += s.nightShiftCount
            agg.weekendShiftCount += s.weekendShiftCount
            Object.entries(s.sickByDayOfWeek || {}).forEach(([k, v]) => { agg.sickByDayOfWeek[k] = (agg.sickByDayOfWeek[k] || 0) + v })
        })
        agg.puffer = Math.round((agg.totalIstHours - agg.totalSollHours) * 100) / 100
        agg.totalWorkedHours = Math.round(agg.totalWorkedHours * 100) / 100
        agg.totalSickHours = Math.round(agg.totalSickHours * 100) / 100
        agg.totalVacationHours = Math.round(agg.totalVacationHours * 100) / 100
        agg.totalSollHours = Math.round(agg.totalSollHours * 100) / 100
        agg.totalIstHours = Math.round(agg.totalIstHours * 100) / 100
        agg.totalPlannedHours = Math.round(agg.totalPlannedHours * 100) / 100
        agg.totalInterruptionNetGain = Math.round(agg.totalInterruptionNetGain * 100) / 100

        // Aggregate employee stats
        const empMap = {}
        validResults.forEach(r => {
            r.employeeStats.forEach(e => {
                if (!empMap[e.id]) {
                    empMap[e.id] = { ...e, shiftTypeHours: { ...e.shiftTypeHours } }
                } else {
                    const m = empMap[e.id]
                    m.sollHours += e.sollHours
                    m.workedHours = Math.round((m.workedHours + e.workedHours) * 100) / 100
                    m.sickHours = Math.round((m.sickHours + e.sickHours) * 100) / 100
                    m.vacationHours = Math.round((m.vacationHours + e.vacationHours) * 100) / 100
                    m.istHours += e.istHours
                    m.puffer = Math.round((m.istHours - m.sollHours) * 100) / 100
                    m.sickCount += e.sickCount
                    m.flexCount += e.flexCount
                    m.swapCount += e.swapCount
                    m.nightShiftCount += e.nightShiftCount
                    m.weekendShiftCount += e.weekendShiftCount
                    m.dbdCount += e.dbdCount
                    m.interruptionCount += e.interruptionCount
                    m.trainingHours = Math.round((m.trainingHours + e.trainingHours) * 100) / 100
                    m.vacationDaysNet += e.vacationDaysNet
                    Object.entries(e.shiftTypeHours || {}).forEach(([k, v]) => {
                        m.shiftTypeHours[k] = (m.shiftTypeHours[k] || 0) + v
                    })
                }
            })
        })
        const empStats = Object.values(empMap)

        return { stats: agg, employeeStats: empStats }
    }

    // Previous month/year stats for deltas
    const prevStats = globalMode === 'jahr' ? null : (monthlyData.length >= 2 ? monthlyData[monthlyData.length - 2]?.stats : null)
    const insights = stats ? generateInsights(stats, employeeStats, monthlyData) : []

    // Shift type config for Dienstprofil
    const shiftTypeConfig = [
        { key: 'TD', label: 'TD', color: 'bg-blue-500' },
        { key: 'TD1', label: 'TD1', color: 'bg-blue-400' },
        { key: 'TD2', label: 'TD2', color: 'bg-sky-400' },
        { key: 'ND', label: 'ND', color: 'bg-indigo-500' },
        { key: 'DBD', label: 'DBD', color: 'bg-violet-500' },
        { key: 'TEAM', label: 'Team', color: 'bg-purple-500' },
        { key: 'FORTBILDUNG', label: 'Fortb.', color: 'bg-fuchsia-500' },
        { key: 'EINSCHULUNG', label: 'Einsch.', color: 'bg-pink-500' },
        { key: 'SONSTIGES', label: 'Sonst.', color: 'bg-gray-400' },
    ]

    // ─── Stacked Area Chart ───
    const AreaChart = ({ data }) => {
        if (!data || data.length < 2) return null
        const w = 500, h = 140, px = 45, py = 20
        const chartW = w - px - 10
        const chartH = h - py

        const maxVal = Math.max(...data.map(d => Math.max(
            d.stats.totalWorkedHours + d.stats.totalVacationHours + d.stats.totalSickHours,
            d.stats.totalSollHours
        )), 1)
        // Round up to nice number for Y axis
        const yMax = Math.ceil(maxVal / 500) * 500 || 500
        const ySteps = [yMax, yMax * 0.75, yMax * 0.5, yMax * 0.25, 0]

        const getX = (i) => px + (i / (data.length - 1)) * chartW
        const getY = (val) => py + (1 - val / yMax) * chartH

        const workY = data.map(d => getY(d.stats.totalWorkedHours))
        const vacY = data.map(d => getY(d.stats.totalWorkedHours + d.stats.totalVacationHours))
        const sickY = data.map(d => getY(d.stats.totalWorkedHours + d.stats.totalVacationHours + d.stats.totalSickHours))
        const baseY = getY(0)

        const makeArea = (topY, bottomY) => {
            const top = topY.map((y, i) => `${getX(i)},${y}`).join(' ')
            const bottom = [...bottomY].reverse().map((y, i) => `${getX(data.length - 1 - i)},${y}`).join(' ')
            return `${top} ${bottom}`
        }

        const sollVal = data[data.length - 1].stats.totalSollHours
        const sollY = getY(sollVal)

        // Month initial letters
        const monthLetters = data.map(m => {
            const l = m.label
            return l.charAt(0).toUpperCase()
        })

        return (
            <div className="relative">
                <svg viewBox={`0 0 ${w} ${h + 40}`} className="w-full" preserveAspectRatio="xMidYMid meet">
                    <defs>
                        <linearGradient id="gWork" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.03" />
                        </linearGradient>
                        <linearGradient id="gVac" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.03" />
                        </linearGradient>
                        <linearGradient id="gSick" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.03" />
                        </linearGradient>
                    </defs>

                    {/* Grid lines + Y labels */}
                    {ySteps.map((val, i) => {
                        const y = getY(val)
                        return (
                            <g key={i}>
                                <line x1={px} y1={y} x2={w - 10} y2={y} stroke="#f3f4f6" strokeWidth="0.5" />
                                <text x={px - 4} y={y + 3} textAnchor="end" fill="#9ca3af" style={{ fontSize: '8px', fontWeight: 500 }}>{Math.round(val)}</text>
                            </g>
                        )
                    })}

                    {/* Soll line */}
                    <line x1={px} y1={sollY} x2={w - 10} y2={sollY} stroke="#1f2937" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
                    <text x={w - 8} y={sollY + 3} fill="#6b7280" style={{ fontSize: '7px', fontWeight: 600 }}>Soll</text>

                    {/* Areas */}
                    <polygon points={makeArea(workY, data.map(() => baseY))} fill="url(#gWork)" />
                    <polygon points={makeArea(vacY, workY)} fill="url(#gVac)" />
                    <polygon points={makeArea(sickY, vacY)} fill="url(#gSick)" />

                    {/* Contour lines */}
                    <polyline fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round"
                        points={workY.map((y, i) => `${getX(i)},${y}`).join(' ')} />
                    <polyline fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeLinejoin="round" opacity="0.7"
                        points={vacY.map((y, i) => `${getX(i)},${y}`).join(' ')} />
                    <polyline fill="none" stroke="#ef4444" strokeWidth="1" strokeLinejoin="round" opacity="0.7"
                        points={sickY.map((y, i) => `${getX(i)},${y}`).join(' ')} />

                    {/* Month labels + puffer */}
                    {data.map((m, i) => {
                        const x = getX(i)
                        const puffer = Math.round(m.stats.totalIstHours - m.stats.totalSollHours)
                        const isCurrent = i === data.length - 1
                        return (
                            <g key={i} className="cursor-pointer" onClick={() => setSelectedAreaMonth(selectedAreaMonth === i ? null : i)}>
                                <text x={x} y={h + 18} textAnchor="middle" fill={isCurrent ? '#1f2937' : '#9ca3af'}
                                    style={{ fontSize: '7.5px', fontWeight: isCurrent ? 700 : 600 }}>{monthLetters[i]}</text>
                                <text x={x} y={h + 30} textAnchor="middle"
                                    fill={puffer >= 0 ? '#059669' : '#e11d48'} style={{ fontSize: '6.5px', fontWeight: 700 }}>
                                    {puffer > 0 ? '+' : ''}{puffer}
                                </text>

                                {selectedAreaMonth === i && (
                                    <g>
                                        <rect x={Math.max(2, Math.min(x - 38, w - 78))} y={Math.max(0, sickY[i] - 52)} width="76" height="48" rx="8" fill="#111827" opacity="0.95" />
                                        <text x={Math.max(6, Math.min(x - 34, w - 74))} y={sickY[i] - 38} fill="#93c5fd" style={{ fontSize: '8px', fontWeight: 700 }}>Arbeit: {Math.round(m.stats.totalWorkedHours)}h</text>
                                        <text x={Math.max(6, Math.min(x - 34, w - 74))} y={sickY[i] - 27} fill="#fcd34d" style={{ fontSize: '8px', fontWeight: 700 }}>Urlaub: {Math.round(m.stats.totalVacationHours)}h</text>
                                        <text x={Math.max(6, Math.min(x - 34, w - 74))} y={sickY[i] - 16} fill="#fca5a5" style={{ fontSize: '8px', fontWeight: 700 }}>Krank: {Math.round(m.stats.totalSickHours)}h</text>
                                        <text x={Math.max(6, Math.min(x - 34, w - 74))} y={sickY[i] - 5} fill="white" style={{ fontSize: '8px', fontWeight: 700 }}>Soll: {Math.round(m.stats.totalSollHours)}h</text>
                                    </g>
                                )}
                            </g>
                        )
                    })}
                </svg>
            </div>
        )
    }

    // ─── Mini Donut ───
    const MiniDonut = ({ work, vacation, sick, soll }) => {
        const total = work + vacation + sick
        const circumference = 2 * Math.PI * 14 // r=14
        const workPct = total > 0 ? (work / total) * circumference : 0
        const vacPct = total > 0 ? (vacation / total) * circumference : 0
        const sickPct = total > 0 ? (sick / total) * circumference : 0
        const pct = soll > 0 ? Math.round((total / soll) * 100) : 0

        return (
            <div className="relative w-16 h-16 shrink-0">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#f3f4f6" strokeWidth="3.5" />
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#3b82f6" strokeWidth="3.5"
                        strokeDasharray={`${workPct} ${circumference}`} strokeLinecap="round" />
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#f59e0b" strokeWidth="3.5"
                        strokeDasharray={`${vacPct} ${circumference}`} strokeDashoffset={`${-workPct}`} strokeLinecap="round" />
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#ef4444" strokeWidth="3.5"
                        strokeDasharray={`${sickPct} ${circumference}`} strokeDashoffset={`${-(workPct + vacPct)}`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[9px] font-bold text-gray-600">{pct}%</span>
                </div>
            </div>
        )
    }

    // Navigation helpers
    const navigateBack = () => {
        if (globalMode === 'jahr') setSelectedMonth(subYears(selectedMonth, 1))
        else setSelectedMonth(subMonths(selectedMonth, 1))
    }
    const navigateForward = () => {
        if (globalMode === 'jahr') setSelectedMonth(addYears(selectedMonth, 1))
        else setSelectedMonth(addMonths(selectedMonth, 1))
    }
    const timeLabel = globalMode === 'jahr'
        ? format(selectedMonth, 'yyyy')
        : format(selectedMonth, 'MMMM yyyy', { locale: de })

    // Shift type labels for IST breakdown
    const shiftLabels = { TD: 'Tagdienst', TD1: 'Tagdienst 1', TD2: 'Tagdienst 2', ND: 'Nachtdienst', DBD: 'Doppeldienst', AST: 'Anlaufstelle', TEAM: 'Teamsitzung', FORTBILDUNG: 'Fortbildung', EINSCHULUNG: 'Einschulung', MITARBEITERGESPRAECH: 'MA-Gespräch', SONSTIGES: 'Sonstiges', SUPERVISION: 'Supervision' }
    const shiftColors = { TD: 'bg-blue-50 text-blue-700', TD1: 'bg-blue-50 text-blue-700', TD2: 'bg-sky-50 text-sky-700', ND: 'bg-indigo-50 text-indigo-700', DBD: 'bg-violet-50 text-violet-700', AST: 'bg-teal-50 text-teal-700', TEAM: 'bg-purple-50 text-purple-700', FORTBILDUNG: 'bg-fuchsia-50 text-fuchsia-700', EINSCHULUNG: 'bg-pink-50 text-pink-700', MITARBEITERGESPRAECH: 'bg-gray-50 text-gray-700', SONSTIGES: 'bg-gray-50 text-gray-700', SUPERVISION: 'bg-violet-50 text-violet-700' }
    const sickColors = { TD1: 'bg-red-50 text-red-700', TD2: 'bg-red-50 text-red-700', ND: 'bg-red-50 text-red-700', DBD: 'bg-red-50 text-red-700', AST: 'bg-red-50 text-red-700', TEAM: 'bg-red-50 text-red-700', FORTBILDUNG: 'bg-red-50 text-red-700', EINSCHULUNG: 'bg-red-50 text-red-700', MITARBEITERGESPRAECH: 'bg-red-50 text-red-700', SONSTIGES: 'bg-red-50 text-red-700', SUPERVISION: 'bg-red-50 text-red-700' }

    return (
        <div>
            {/* ═══ HEADER ═══ */}
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-xl font-bold text-gray-900 tracking-tight">Admin-Übersicht</h1>
                    <p className="text-xs text-gray-400 mt-0.5">{stats?.employeeCount || '–'} Mitarbeiter</p>
                </div>
                <div className="inline-flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
                    <button
                        className={`text-[10px] font-bold px-3 py-1 rounded-md transition-all ${globalMode === 'monat' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        onClick={() => setGlobalMode('monat')}
                    >Monat</button>
                    <button
                        className={`text-[10px] font-bold px-3 py-1 rounded-md transition-all ${globalMode === 'jahr' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        onClick={() => setGlobalMode('jahr')}
                    >Jahr</button>
                </div>
            </div>

            {/* ═══ TIME NAVIGATION ═══ */}
            <div className="flex items-center justify-center mb-5">
                <div className="flex items-center gap-1 bg-white rounded-full border border-gray-100 px-1 py-1 shadow-sm">
                    <button onClick={navigateBack} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
                        <ChevronLeft size={16} className="text-gray-400" />
                    </button>
                    <span className="text-sm font-bold text-gray-800 px-2 min-w-[100px] text-center font-mono capitalize">
                        {timeLabel}
                    </span>
                    <button onClick={navigateForward} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
                        <ChevronRight size={16} className="text-gray-400" />
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="space-y-4">
                    <div className="h-48 bg-gray-200 rounded-[1.5rem] animate-pulse" />
                    <div className="h-32 bg-gray-200 rounded-[1.5rem] animate-pulse" />
                    <div className="h-24 bg-gray-200 rounded-[1.5rem] animate-pulse" />
                </div>
            ) : stats && (
                <div className="space-y-4">

                    {/* ═══ SECTION 1: PULSE CARD ═══ */}
                    <section className="bg-white rounded-[1.5rem] border border-gray-100/80 shadow-[0_2px_10px_rgb(0,0,0,0.04)] p-5">
                        {/* Puffer Hero + Mini Donut */}
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1">Team-Puffer</p>
                                <div className="flex items-baseline gap-2">
                                    <span className={`text-3xl font-black font-mono ${stats.puffer >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {stats.puffer > 0 ? '+' : ''}{stats.puffer.toFixed(2)}
                                    </span>
                                    <span className="text-sm font-bold text-gray-400">Std.</span>
                                </div>
                                {prevStats && (
                                    <div className="flex items-center gap-1.5 mt-1">
                                        {(() => {
                                            const delta = stats.puffer - prevStats.puffer
                                            if (delta === 0) return <Minus size={12} className="text-gray-300" />
                                            return delta > 0
                                                ? <TrendingUp size={12} className="text-emerald-500" />
                                                : <TrendingDown size={12} className="text-rose-500" />
                                        })()}
                                        <span className={`text-[10px] font-bold ${(stats.puffer - (prevStats?.puffer || 0)) >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                            {(() => { const d = Math.round((stats.puffer - (prevStats?.puffer || 0)) * 100) / 100; return `${d > 0 ? '+' : ''}${d.toFixed(2)} vs. ${monthlyData.length >= 2 ? monthlyData[monthlyData.length - 2]?.label : 'Vormonat'}` })()}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <MiniDonut work={stats.totalWorkedHours} vacation={stats.totalVacationHours} sick={stats.totalSickHours} soll={stats.totalSollHours} />
                        </div>

                        {/* Stacked Bar */}
                        <div className="relative mb-3">
                            <p className="text-[10px] text-gray-400 font-medium mb-1.5">IST-Zusammensetzung</p>
                            {(() => {
                                const maxVal = Math.max(stats.totalIstHours, stats.totalSollHours * 1.05, 1)
                                const workPct = (stats.totalWorkedHours / maxVal) * 100
                                const vacPct = (stats.totalVacationHours / maxVal) * 100
                                const sickPct = (stats.totalSickHours / maxVal) * 100
                                const restPct = Math.max(0, 100 - workPct - vacPct - sickPct)
                                const sollPct = (stats.totalSollHours / maxVal) * 100
                                return (
                                    <>
                                        <div className="relative">
                                            <div className="flex h-7 rounded-md overflow-hidden" style={{ background: '#f3f4f6' }}>
                                                <div className="bg-blue-500 h-full transition-all duration-500" style={{ width: `${workPct}%` }} />
                                                <div className="bg-amber-400 h-full transition-all duration-500" style={{ width: `${vacPct}%` }} />
                                                <div className="bg-red-400 h-full transition-all duration-500" style={{ width: `${sickPct}%` }} />
                                                <div className="bg-gray-200 h-full transition-all duration-500" style={{ width: `${restPct}%` }} />
                                            </div>
                                            {/* Soll marker — outside overflow-hidden */}
                                            <div className="absolute top-0 bottom-0" style={{
                                                left: `${sollPct}%`, width: '2px',
                                                background: 'repeating-linear-gradient(to bottom, #1f2937 0px, #1f2937 3px, transparent 3px, transparent 6px)'
                                            }} />
                                        </div>
                                        <div className="flex justify-between mt-1.5">
                                            <div className="flex gap-3">
                                                <span className="flex items-center gap-1 text-[9px] font-bold text-gray-500"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Arbeit</span>
                                                <span className="flex items-center gap-1 text-[9px] font-bold text-gray-500"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Urlaub</span>
                                                <span className="flex items-center gap-1 text-[9px] font-bold text-gray-500"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Krank</span>
                                            </div>
                                            <span className="text-[9px] font-bold text-gray-400">┊ Soll</span>
                                        </div>
                                    </>
                                )
                            })()}
                        </div>

                        {/* 3er Metric Grid */}
                        <div className="grid grid-cols-3 gap-2 mb-4">
                            <div className="bg-gray-50 rounded-lg text-center py-2">
                                <p className="text-[10px] text-gray-400 font-medium">Soll</p>
                                <p className="text-lg font-bold text-gray-800 font-mono">{stats.totalSollHours.toLocaleString('de-AT')}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg text-center py-2">
                                <p className="text-[10px] text-gray-400 font-medium">Geplant</p>
                                <p className="text-lg font-bold text-gray-800 font-mono">{stats.totalPlannedHours.toLocaleString('de-AT')}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg text-center py-2">
                                <p className="text-[10px] text-gray-400 font-medium">IST</p>
                                <p className={`text-lg font-bold font-mono ${stats.puffer >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{stats.totalIstHours.toLocaleString('de-AT')}</p>
                            </div>
                        </div>

                        {/* Insights */}
                        {insights.length > 0 && (
                            <div className="space-y-2">
                                {insights.map((ins, i) => {
                                    const bgMap = { amber: 'bg-amber-50', rose: 'bg-rose-50', emerald: 'bg-emerald-50', orange: 'bg-orange-50' }
                                    const barMap = { amber: 'bg-amber-400', rose: 'bg-rose-400', emerald: 'bg-emerald-500', orange: 'bg-orange-400' }
                                    return (
                                        <div key={i} className={`flex items-start gap-2 ${bgMap[ins.color] || 'bg-gray-50'} rounded-lg px-3 py-2`}>
                                            <div className={`w-[3px] rounded self-stretch shrink-0 ${barMap[ins.color] || 'bg-gray-400'}`} />
                                            <p className="text-[11px] text-gray-700 leading-snug">
                                                <span className="font-bold">{ins.text}</span> {ins.detail}
                                            </p>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </section>

                    {/* ═══ SECTION 2: IST-AUFSCHLÜSSELUNG ═══ */}
                    <section className="bg-white rounded-[1.5rem] border border-gray-100/80 shadow-[0_2px_10px_rgb(0,0,0,0.04)] p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
                            <h2 className="text-sm font-bold text-gray-900">IST-Aufschlüsselung</h2>
                            <span className="ml-auto text-lg font-bold text-gray-800 font-mono">{stats.totalIstHours.toLocaleString('de-AT')}<span className="text-xs text-gray-400 ml-0.5">h</span></span>
                        </div>

                        {/* Arbeit Accordion */}
                        <div className="mb-2">
                            <button onClick={() => setShowWorkedDetails(!showWorkedDetails)}
                                className="w-full flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                                    <span className="text-sm font-bold text-gray-800">Arbeitsstunden</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-gray-700 font-mono">{stats.totalWorkedHours.toFixed(2)}h</span>
                                    {showWorkedDetails ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                                </div>
                            </button>
                            {showWorkedDetails && (
                                <div className="grid grid-cols-2 gap-1.5 mt-2 px-1">
                                    {Object.entries(stats.shiftHours).filter(([, h]) => h > 0).sort((a, b) => b[1] - a[1]).map(([type, hours]) => (
                                        <div key={type} className={`flex justify-between items-center rounded-md px-2.5 py-1.5 ${shiftColors[type] || 'bg-gray-50 text-gray-700'}`}>
                                            <span className="text-[10px] font-medium text-gray-500">{shiftLabels[type] || type}</span>
                                            <span className="text-xs font-bold font-mono">{hours.toFixed(2)}h</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Urlaub */}
                        <div className="mb-2">
                            <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                                    <span className="text-sm font-bold text-gray-800">Urlaubsstunden</span>
                                </div>
                                <span className="text-sm font-bold text-gray-700 font-mono">{stats.totalVacationHours}h</span>
                            </div>
                        </div>

                        {/* Krank */}
                        <div className="mb-2">
                            <button onClick={() => setShowSickDetails(!showSickDetails)}
                                className="w-full flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                                    <span className="text-sm font-bold text-gray-800">Krankstunden</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-gray-700 font-mono">{stats.totalSickHours.toFixed(2)}h</span>
                                    {showSickDetails ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                                </div>
                            </button>
                            {showSickDetails && (
                                <div className="grid grid-cols-2 gap-1.5 mt-2 px-1">
                                    {Object.entries(stats.sickHours).filter(([, h]) => h > 0).sort((a, b) => b[1] - a[1]).map(([type, hours]) => (
                                        <div key={type} className={`flex justify-between items-center rounded-md px-2.5 py-1.5 ${sickColors[type] || 'bg-red-50 text-red-700'}`}>
                                            <span className="text-[10px] font-medium text-gray-500">{shiftLabels[type] || type}</span>
                                            <span className="text-xs font-bold font-mono">{hours.toFixed(2)}h</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Unterbrechungen */}
                        {stats.totalInterruptionCount > 0 && (
                            <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />
                                    <span className="text-sm font-bold text-gray-800">Unterbrechungen</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">{stats.totalInterruptionCount}×</span>
                                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">+{stats.totalInterruptionNetGain}h netto</span>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* ═══ SECTION 3: BETRIEB ═══ */}
                    <section className="bg-white rounded-[1.5rem] border border-gray-100/80 shadow-[0_2px_10px_rgb(0,0,0,0.04)] p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <Activity size={16} className="text-gray-500" />
                            <h2 className="text-sm font-bold text-gray-900">Betrieb</h2>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-4">
                            {[
                                { label: 'Flex', val: stats.flexCount, prev: prevStats?.flexCount, color: 'text-gray-800' },
                                { label: 'Tausch', val: stats.swapCount, prev: prevStats?.swapCount, color: 'text-gray-800' },
                                { label: 'Krank', val: stats.sickCount, prev: prevStats?.sickCount, color: 'text-gray-800', inverted: true },
                                { label: 'Nacht', val: stats.nightShiftCount, prev: prevStats?.nightShiftCount, color: 'text-indigo-600' },
                                { label: 'Wochenende', val: stats.weekendShiftCount, prev: prevStats?.weekendShiftCount, color: 'text-cyan-600' },
                                { label: 'Unterbr.', val: stats.totalInterruptionCount, prev: prevStats?.totalInterruptionCount, color: 'text-orange-500' }
                            ].map(m => (
                                <div key={m.label} className="bg-gray-50 rounded-lg text-center py-2.5 px-1">
                                    <p className="text-[10px] text-gray-400 font-medium">{m.label}</p>
                                    <p className={`text-lg font-bold ${m.color}`}>{m.val}</p>
                                    <Delta current={m.val} previous={m.prev} inverted={m.inverted} />
                                </div>
                            ))}
                        </div>

                        {/* Krankmeldungen nach Wochentag */}
                        <div>
                            <p className="text-[10px] text-gray-400 font-medium mb-2">Krankmeldungen nach Wochentag</p>
                            {(() => {
                                const dayOrder = [1, 2, 3, 4, 5, 6, 0] // Mo-So
                                const dayLabels = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
                                const maxSick = Math.max(...Object.values(stats.sickByDayOfWeek || {}), 1)
                                return (
                                    <div className="flex items-end justify-between gap-1 h-16 px-1">
                                        {dayOrder.map(i => {
                                            const count = stats.sickByDayOfWeek?.[i] || 0
                                            const pct = count > 0 ? Math.max((count / maxSick) * 100, 5) : 2
                                            const isHighest = count === maxSick && count > 0
                                            return (
                                                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                                                    <div className={`w-full rounded-t transition-all ${count > 0 ? (isHighest ? 'bg-red-400' : 'bg-red-300') : 'bg-red-200'}`}
                                                        style={{ height: `${pct}%`, minHeight: '2px' }} />
                                                    <span className="text-[9px] text-gray-400 font-bold mt-1">{dayLabels[i]}</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )
                            })()}
                        </div>
                    </section>

                    {/* ═══ SECTION 3b: DIENSTPROFIL-VERGLEICH ═══ */}
                    {employeeStats.length > 0 && (
                        <section className="bg-white rounded-[1.5rem] border border-gray-100/80 shadow-[0_2px_10px_rgb(0,0,0,0.04)] p-5">
                            <div className="flex items-center gap-2 mb-3 cursor-pointer" onClick={() => setShowProfil(!showProfil)}>
                                <Users size={16} className="text-gray-500" />
                                <h2 className="text-sm font-bold text-gray-900 flex-1">Dienstprofil-Vergleich</h2>
                                <span className="text-[10px] text-gray-400 font-medium mr-1">{employeeStats.length} MA</span>
                                {showProfil ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                            </div>

                            {/* Team Average Bar */}
                            {(() => {
                                const avgHours = {}
                                shiftTypeConfig.forEach(t => {
                                    const sum = employeeStats.reduce((s, e) => s + (e.shiftTypeHours?.[t.key] || 0), 0)
                                    avgHours[t.key] = sum / employeeStats.length
                                })
                                const avgTotal = Object.values(avgHours).reduce((s, v) => s + v, 0) || 1
                                const activeTypes = shiftTypeConfig.filter(t => avgHours[t.key] > 0)

                                return (
                                    <>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-medium text-gray-400 w-16 text-right">Team Ø</span>
                                            <div className="flex-1 h-7 rounded-md flex overflow-hidden" style={{ background: '#f3f4f6' }}>
                                                {activeTypes.map(t => (
                                                    <div key={t.key} className={`h-full ${t.color} transition-all duration-500`}
                                                        style={{ width: `${(avgHours[t.key] / avgTotal) * 100}%` }} />
                                                ))}
                                            </div>
                                            <span className="text-[10px] font-bold text-gray-500 font-mono w-10 text-right">{Math.round(avgTotal)}h</span>
                                        </div>
                                        {/* Legend */}
                                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 ml-[72px]">
                                            {activeTypes.map(t => (
                                                <span key={t.key} className="flex items-center gap-1 text-[9px] font-bold text-gray-500">
                                                    <span className={`w-2 h-2 rounded-sm ${t.color} inline-block`} />{t.label}
                                                </span>
                                            ))}
                                        </div>
                                    </>
                                )
                            })()}

                            {/* Expanded: Sort + Employee Bars */}
                            {showProfil && (
                                <div className="mt-3">
                                    {/* Sort buttons */}
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                        {[{ key: 'total', label: 'Gesamt' }, { key: 'krank', label: 'Krank' }, { key: 'urlaub', label: 'Urlaub' }, ...shiftTypeConfig.filter(t => employeeStats.some(e => (e.shiftTypeHours?.[t.key] || 0) > 0))].map(t => (
                                            <button key={t.key} onClick={() => setProfilSort(t.key)}
                                                className={`text-[9px] font-bold px-2 py-0.5 rounded-md border transition-all ${profilSort === t.key ? 'bg-teal-500 text-white border-teal-500' : 'bg-transparent text-gray-400 border-gray-200 hover:bg-gray-50'}`}>
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>
                                    {/* Employee bars */}
                                    <div className="space-y-1">
                                        {[...employeeStats].sort((a, b) => {
                                            if (profilSort === 'total') return b.workedHours - a.workedHours
                                            if (profilSort === 'krank') return b.sickHours - a.sickHours
                                            if (profilSort === 'urlaub') return b.vacationHours - a.vacationHours
                                            return (b.shiftTypeHours?.[profilSort] || 0) - (a.shiftTypeHours?.[profilSort] || 0)
                                        }).map(emp => {
                                            const empTotal = Object.values(emp.shiftTypeHours || {}).reduce((s, v) => s + v, 0) || 1
                                            const activeTypes = shiftTypeConfig.filter(t => (emp.shiftTypeHours?.[t.key] || 0) > 0)
                                            return (
                                                <div key={emp.id} className="flex items-center gap-2 py-0.5">
                                                    <span className="text-[10px] font-medium text-gray-500 w-16 text-right truncate">{emp.name}</span>
                                                    <div className="flex-1 h-5 rounded-md flex overflow-hidden" style={{ background: '#f3f4f6' }}>
                                                        {activeTypes.map(t => (
                                                            <div key={t.key} className={`h-full ${t.color} transition-all duration-500`}
                                                                style={{ width: `${((emp.shiftTypeHours?.[t.key] || 0) / empTotal) * 100}%` }} />
                                                        ))}
                                                    </div>
                                                    <span className="text-[10px] font-bold text-gray-500 font-mono w-10 text-right">{Math.round(empTotal)}h</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </section>
                    )}

                    {/* ═══ SECTION 4: 12-MONATS-VERLAUF ═══ */}
                    {monthlyData.length > 0 && (
                        <section className="bg-white rounded-[1.5rem] border border-gray-100/80 shadow-[0_2px_10px_rgb(0,0,0,0.04)] p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <BarChart3 size={16} className="text-gray-500" />
                                <h2 className="text-sm font-bold text-gray-900">12-Monats-Verlauf</h2>
                            </div>
                            <AreaChart data={monthlyData} />
                            <div className="flex items-center justify-center gap-4 mt-2">
                                <span className="flex items-center gap-1.5 text-[9px] font-bold text-gray-500"><span className="w-3 h-1.5 rounded-full bg-blue-500 inline-block" />Arbeit</span>
                                <span className="flex items-center gap-1.5 text-[9px] font-bold text-gray-500"><span className="w-3 h-1.5 rounded-full bg-amber-400 inline-block" />Urlaub</span>
                                <span className="flex items-center gap-1.5 text-[9px] font-bold text-gray-500"><span className="w-3 h-1.5 rounded-full bg-red-400 inline-block" />Krank</span>
                                <span className="flex items-center gap-1.5 text-[9px] font-bold text-gray-500"><span className="w-3 h-0 border-t-2 border-dashed border-gray-800 inline-block" />Soll</span>
                            </div>
                        </section>
                    )}

                    {/* ═══ SECTION 5: FAIRNESS (SOLI-PUNKTE) ═══ */}
                    {fairnessData.length > 0 && (() => {
                        const maxPoints = Math.max(...fairnessData.map(f => f.index.total), 1)
                        const avg = fairnessData.reduce((s, f) => s + f.index.total, 0) / fairnessData.length
                        const avgPct = (avg / maxPoints) * 100
                        return (
                            <section className="bg-white rounded-[1.5rem] border border-gray-100/80 shadow-[0_2px_10px_rgb(0,0,0,0.04)] p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <Layers size={16} className="text-gray-500" />
                                    <h2 className="text-sm font-bold text-gray-900">Soli-Punkte</h2>
                                    <span className="ml-auto text-[10px] text-gray-400 font-medium">Ø {Math.round(avg)} SP</span>
                                </div>
                                <div className="space-y-2 relative">
                                    {/* Average line */}
                                    <div className="absolute top-0 bottom-0 z-[2]" style={{
                                        left: `calc(72px + (100% - 72px - 40px) * ${avgPct / 100})`,
                                        width: '1.5px',
                                        background: 'repeating-linear-gradient(to bottom, #6b7280 0px, #6b7280 3px, transparent 3px, transparent 6px)'
                                    }} />
                                    {fairnessData.map(f => {
                                        const pct = (f.index.total / maxPoints) * 100
                                        const isAboveAvg = f.index.total >= avg
                                        return (
                                            <div key={f.userId} className="flex items-center gap-2">
                                                <span className="text-[10px] font-medium text-gray-500 w-16 text-right truncate shrink-0">{f.name?.split(' ')[0]}</span>
                                                <div className="flex-1 relative h-6">
                                                    <div className={`h-full rounded transition-all duration-500 ${isAboveAvg ? 'bg-emerald-400' : 'bg-gray-300'}`}
                                                        style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className="text-[10px] font-bold text-gray-600 font-mono w-8 text-right">{f.index.total}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                                <div className="flex items-center justify-center gap-3 mt-3">
                                    <span className="flex items-center gap-1.5 text-[9px] font-bold text-gray-500">
                                        <span className="w-3 h-2 rounded-sm bg-emerald-400 inline-block" />≥ Durchschnitt
                                    </span>
                                    <span className="flex items-center gap-1.5 text-[9px] font-bold text-gray-500">
                                        <span className="w-3 h-2 rounded-sm bg-gray-300 inline-block" />&lt; Durchschnitt
                                    </span>
                                    <span className="flex items-center gap-1.5 text-[9px] font-bold text-gray-500">
                                        <span className="w-0 h-3 border-l-2 border-dashed border-gray-500 inline-block" />Ø
                                    </span>
                                </div>
                            </section>
                        )
                    })()}

                    {/* ═══ SECTION 6: EMPLOYEE TABLE ═══ */}
                    {employeeStats.length > 0 && (
                        <section className="bg-white rounded-[1.5rem] border border-gray-100/80 shadow-[0_2px_10px_rgb(0,0,0,0.04)] p-4">
                            <div className="flex items-center gap-2 mb-3 px-1">
                                <Users size={16} className="text-gray-500" />
                                <h2 className="text-sm font-bold text-gray-900">Mitarbeiter</h2>
                                <span className="ml-auto text-[10px] text-gray-400 font-medium">sortiert nach Puffer</span>
                            </div>

                            <div className="space-y-0">
                                {[...employeeStats].sort((a, b) => a.puffer - b.puffer).map(emp => {
                                    const empMaxVal = Math.max(emp.istHours, emp.sollHours, 1)
                                    const sparkData = monthlyData.slice(-6).map(m => {
                                        const e = m.employeeStats.find(x => x.id === emp.id)
                                        return e ? e.puffer : 0
                                    })
                                    const flags = []
                                    if (emp.puffer > 30) flags.push({ emoji: '🔥', tip: 'Überstunden >30h' })
                                    if (emp.puffer < -20) flags.push({ emoji: '⚠️', tip: 'Defizit >20h' })
                                    if (emp.sickCount >= 2) flags.push({ emoji: '🏥', tip: `${emp.sickCount}× krank` })

                                    // Badge variant
                                    let badgeClass = 'bg-gray-100 text-gray-600'
                                    if (emp.puffer > 5) badgeClass = 'bg-emerald-50 text-emerald-700'
                                    else if (emp.puffer < -5) badgeClass = 'bg-rose-50 text-rose-700'

                                    const isExpanded = expandedEmployeeIds.includes(emp.id)

                                    return (
                                        <div key={emp.id} className="border-b border-gray-50 last:border-b-0">
                                            {/* Summary Row */}
                                            <div className="flex items-center gap-2 py-3 px-1 cursor-pointer active:bg-gray-50 transition-colors" onClick={() => toggleEmployee(emp.id)}>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-sm font-bold text-gray-800 truncate">{emp.name}</span>
                                                        {flags.map((f, i) => <span key={i} className="text-[9px]" title={f.tip}>{f.emoji}</span>)}
                                                    </div>
                                                    <Sparkline data={sparkData} />
                                                </div>

                                                {/* Mini IST bar */}
                                                <div className="w-20 shrink-0">
                                                    <div className="flex h-3 rounded-md overflow-hidden" style={{ background: '#f3f4f6' }}>
                                                        <div className="bg-blue-500 h-full" style={{ width: `${(emp.workedHours / empMaxVal) * 100}%` }} />
                                                        <div className="bg-amber-400 h-full" style={{ width: `${(emp.vacationHours / empMaxVal) * 100}%` }} />
                                                        <div className="bg-red-400 h-full" style={{ width: `${(emp.sickHours / empMaxVal) * 100}%` }} />
                                                    </div>
                                                </div>

                                                {/* Puffer Badge */}
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <span className={`${badgeClass} text-[10px] font-bold px-2 py-0.5 rounded-full font-mono`}>
                                                        {emp.puffer > 0 ? '+' : emp.puffer < 0 ? '−' : ''}{Math.abs(emp.puffer).toFixed(2)}
                                                    </span>
                                                    {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                                                </div>
                                            </div>

                                            {/* Expanded Detail */}
                                            {isExpanded && (
                                                <div className="px-2 pb-3 overflow-hidden">
                                                    {/* Stunden */}
                                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 mt-1">Stunden</p>
                                                    <div className="grid grid-cols-5 gap-1 mb-3">
                                                        <div className="bg-gray-50 rounded-lg text-center py-1.5">
                                                            <p className="text-[9px] text-gray-400">Soll</p>
                                                            <p className="text-xs font-bold text-gray-700 font-mono">{emp.sollHours}</p>
                                                        </div>
                                                        <div className="bg-gray-50 rounded-lg text-center py-1.5">
                                                            <p className="text-[9px] text-gray-400">Arbeit</p>
                                                            <p className="text-xs font-bold text-blue-600 font-mono">{emp.workedHours}</p>
                                                        </div>
                                                        <div className="bg-gray-50 rounded-lg text-center py-1.5">
                                                            <p className="text-[9px] text-gray-400">Urlaub</p>
                                                            <p className="text-xs font-bold text-amber-600 font-mono">{emp.vacationHours}</p>
                                                        </div>
                                                        <div className="bg-gray-50 rounded-lg text-center py-1.5">
                                                            <p className="text-[9px] text-gray-400">Krank</p>
                                                            <p className="text-xs font-bold text-red-600 font-mono">{emp.sickHours}</p>
                                                        </div>
                                                        <div className="bg-gray-50 rounded-lg text-center py-1.5">
                                                            <p className="text-[9px] text-gray-400">Puffer</p>
                                                            <p className={`text-xs font-bold font-mono ${emp.puffer >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                                {emp.puffer > 0 ? '+' : ''}{emp.puffer.toFixed(2)}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Operativ */}
                                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Operativ</p>
                                                    <div className="grid grid-cols-5 gap-1 mb-3">
                                                        <div className="bg-gray-50 rounded-lg text-center py-1.5">
                                                            <p className="text-[9px] text-gray-400">Flex</p>
                                                            <p className="text-xs font-bold text-gray-700">{emp.flexCount}</p>
                                                        </div>
                                                        <div className="bg-gray-50 rounded-lg text-center py-1.5">
                                                            <p className="text-[9px] text-gray-400">Tausch</p>
                                                            <p className="text-xs font-bold text-gray-700">{emp.swapCount}</p>
                                                        </div>
                                                        <div className="bg-gray-50 rounded-lg text-center py-1.5">
                                                            <p className="text-[9px] text-gray-400">Nacht</p>
                                                            <p className="text-xs font-bold text-indigo-600">{emp.nightShiftCount}</p>
                                                        </div>
                                                        <div className="bg-gray-50 rounded-lg text-center py-1.5">
                                                            <p className="text-[9px] text-gray-400">WE</p>
                                                            <p className="text-xs font-bold text-cyan-600">{emp.weekendShiftCount}</p>
                                                        </div>
                                                        <div className="bg-gray-50 rounded-lg text-center py-1.5">
                                                            <p className="text-[9px] text-gray-400">DBD</p>
                                                            <p className="text-xs font-bold text-pink-600">{emp.dbdCount}</p>
                                                        </div>
                                                    </div>

                                                    {/* Urlaub */}
                                                    {emp.vacationHours > 0 && (
                                                        <>
                                                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Urlaub</p>
                                                            <div className="grid grid-cols-4 gap-1">
                                                                <div className="bg-gray-50 rounded-lg text-center py-1.5">
                                                                    <p className="text-[9px] text-gray-400">Tage</p>
                                                                    <p className="text-xs font-bold text-amber-600">{emp.vacationDaysNet}</p>
                                                                </div>
                                                                <div className="bg-gray-50 rounded-lg text-center py-1.5">
                                                                    <p className="text-[9px] text-gray-400">Ø Vorlauf</p>
                                                                    <p className="text-xs font-bold text-gray-700">{emp.avgLeadTime}d</p>
                                                                </div>
                                                                <div className="bg-gray-50 rounded-lg text-center py-1.5">
                                                                    <p className="text-[9px] text-gray-400">Längster</p>
                                                                    <p className="text-xs font-bold text-gray-700">{emp.longestVacationBlock}d</p>
                                                                </div>
                                                                <div className="bg-gray-50 rounded-lg text-center py-1.5">
                                                                    <p className="text-[9px] text-gray-400">Brücke</p>
                                                                    <p className="text-xs font-bold text-gray-700">{emp.bridgeDayRatio}%</p>
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </div>
    )
}
