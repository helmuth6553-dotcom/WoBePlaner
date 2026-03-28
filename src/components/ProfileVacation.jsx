import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import { useHolidays } from '../hooks/useHolidays'
import { Palmtree, CalendarCheck, CalendarClock, TrendingUp, TrendingDown } from 'lucide-react'
import { eachDayOfInterval, isWeekend, parseISO, startOfYear, endOfYear, isWithinInterval, format } from 'date-fns'
import { de } from 'date-fns/locale'

export default function ProfileVacation() {
    const { user } = useAuth()
    const { getHoliday } = useHolidays()
    const [stats, setStats] = useState({ total: 25, used: 0, planned: 0, remaining: 25 })
    const [prevYearUsed, setPrevYearUsed] = useState(null)
    const [nextVacation, setNextVacation] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!user) return
        fetchVacationData()
    }, [user, getHoliday])

    const countWorkdays = (absences, yearStart, yearEnd) => {
        let used = 0
        let planned = 0
        absences.forEach(abs => {
            const absStart = parseISO(abs.start_date)
            const absEnd = parseISO(abs.end_date)
            const days = eachDayOfInterval({ start: absStart, end: absEnd })
            const count = days.filter(day =>
                !isWeekend(day) &&
                isWithinInterval(day, { start: yearStart, end: yearEnd }) &&
                !getHoliday(day)
            ).length
            if (abs.status === 'genehmigt') used += count
            else if (abs.status === 'beantragt') planned += count
        })
        return { used, planned }
    }

    const fetchVacationData = async () => {
        setLoading(true)
        try {
            const { data: profileData } = await supabase
                .from('profiles')
                .select('vacation_days_per_year')
                .eq('id', user.id).single()
            const totalVacation = profileData?.vacation_days_per_year || 25

            // Current year
            const now = new Date()
            const yearStart = startOfYear(now)
            const yearEnd = endOfYear(now)

            const { data: absences } = await supabase
                .from('absences')
                .select('start_date, end_date, status, type')
                .eq('user_id', user.id)
                .eq('type', 'Urlaub')

            if (absences) {
                const { used, planned } = countWorkdays(absences, yearStart, yearEnd)
                setStats({
                    total: totalVacation,
                    used,
                    planned,
                    remaining: totalVacation - used - planned,
                })
            }

            // Previous year
            const prevYear = now.getFullYear() - 1
            const prevStart = new Date(prevYear, 0, 1)
            const prevEnd = new Date(prevYear, 11, 31)

            const { data: prevAbsences } = await supabase
                .from('absences')
                .select('start_date, end_date, status, type')
                .eq('user_id', user.id)
                .eq('type', 'Urlaub')
                .eq('status', 'genehmigt')
                .gte('start_date', format(prevStart, 'yyyy-MM-dd'))
                .lte('start_date', format(prevEnd, 'yyyy-MM-dd'))

            if (prevAbsences) {
                const { used: prevUsed } = countWorkdays(
                    prevAbsences.map(a => ({ ...a, status: 'genehmigt' })),
                    prevStart, prevEnd
                )
                setPrevYearUsed(prevUsed)
            }

            // Next upcoming vacation
            const today = format(now, 'yyyy-MM-dd')
            const { data: upcoming } = await supabase
                .from('absences')
                .select('start_date, end_date')
                .eq('user_id', user.id)
                .eq('type', 'Urlaub')
                .eq('status', 'genehmigt')
                .gte('start_date', today)
                .order('start_date', { ascending: true })
                .limit(1)

            setNextVacation(upcoming?.[0] || null)
        } catch (err) {
            console.error('ProfileVacation error:', err)
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return <div className="animate-pulse bg-gray-100 rounded-2xl h-48"></div>
    }

    const usedPercent = stats.total > 0 ? (stats.used / stats.total) * 100 : 0
    const plannedPercent = stats.total > 0 ? (stats.planned / stats.total) * 100 : 0
    const yearDiff = prevYearUsed !== null ? stats.used - prevYearUsed : null

    return (
        <div className="space-y-4">
            {/* Urlaubskonto Header */}
            <div className="bg-white p-5 rounded-xl shadow-[0_2px_10px_rgb(0,0,0,0.04)]">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Palmtree size={20} className="text-teal-600" />
                        <h3 className="font-bold text-gray-900">Urlaubskonto {new Date().getFullYear()}</h3>
                    </div>
                    <span className="text-sm font-bold text-teal-700 bg-teal-50 px-3 py-1 rounded-full">
                        {stats.remaining} Tage frei
                    </span>
                </div>

                {/* Progress Bar */}
                <div className="h-4 bg-gray-100 rounded-full overflow-hidden mb-3">
                    <div className="h-full flex">
                        <div
                            className="bg-teal-500 transition-all"
                            style={{ width: `${usedPercent}%` }}
                        />
                        <div
                            className="bg-amber-300 transition-all"
                            style={{ width: `${plannedPercent}%` }}
                        />
                    </div>
                </div>

                {/* Legend */}
                <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                            <div className="w-2.5 h-2.5 rounded-sm bg-teal-500"></div>
                            <span className="text-[10px] text-gray-400 font-bold uppercase">Verbraucht</span>
                        </div>
                        <p className="text-lg font-black text-gray-900">{stats.used}</p>
                    </div>
                    <div>
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                            <div className="w-2.5 h-2.5 rounded-sm bg-amber-300"></div>
                            <span className="text-[10px] text-gray-400 font-bold uppercase">Geplant</span>
                        </div>
                        <p className="text-lg font-black text-gray-900">{stats.planned}</p>
                    </div>
                    <div>
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                            <div className="w-2.5 h-2.5 rounded-sm bg-gray-200"></div>
                            <span className="text-[10px] text-gray-400 font-bold uppercase">Verfügbar</span>
                        </div>
                        <p className="text-lg font-black text-teal-700">{stats.remaining}</p>
                    </div>
                </div>
            </div>

            {/* Next Vacation + Year Comparison */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Nächster Urlaub */}
                <div className="bg-white p-5 rounded-xl shadow-[0_2px_10px_rgb(0,0,0,0.04)]">
                    <div className="flex items-center gap-2 mb-3">
                        <CalendarCheck size={18} className="text-teal-600" />
                        <h4 className="font-bold text-sm text-gray-900">Nächster Urlaub</h4>
                    </div>
                    {nextVacation ? (
                        <div>
                            <p className="font-bold text-gray-900">
                                {format(parseISO(nextVacation.start_date), 'd. MMM', { locale: de })}
                                {' — '}
                                {format(parseISO(nextVacation.end_date), 'd. MMM yyyy', { locale: de })}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                                {(() => {
                                    const days = eachDayOfInterval({
                                        start: parseISO(nextVacation.start_date),
                                        end: parseISO(nextVacation.end_date)
                                    }).filter(d => !isWeekend(d) && !getHoliday(d)).length
                                    return `${days} Werktage`
                                })()}
                            </p>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-400">Kein Urlaub geplant</p>
                    )}
                </div>

                {/* Vorjahresvergleich */}
                <div className="bg-white p-5 rounded-xl shadow-[0_2px_10px_rgb(0,0,0,0.04)]">
                    <div className="flex items-center gap-2 mb-3">
                        <CalendarClock size={18} className="text-gray-600" />
                        <h4 className="font-bold text-sm text-gray-900">Vorjahr</h4>
                    </div>
                    {prevYearUsed !== null ? (
                        <div>
                            <p className="text-sm text-gray-600">
                                {new Date().getFullYear() - 1}: <span className="font-bold">{prevYearUsed} Tage</span> verbraucht
                            </p>
                            {yearDiff !== null && yearDiff !== 0 && (
                                <div className={`flex items-center gap-1 mt-1 text-xs font-bold ${yearDiff > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                    {yearDiff > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                    {yearDiff > 0 ? '+' : ''}{yearDiff} Tage vs. Vorjahr
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-400">Keine Daten</p>
                    )}
                </div>
            </div>
        </div>
    )
}
