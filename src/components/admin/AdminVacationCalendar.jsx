import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabase'
import {
    format, startOfYear, endOfYear, startOfMonth, endOfMonth,
    eachMonthOfInterval, eachDayOfInterval, isWeekend, isSameMonth,
    getYear, startOfWeek, endOfWeek
} from 'date-fns'
import { de } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Calendar, Users } from 'lucide-react'
import { useHolidays } from '../../hooks/useHolidays'

/**
 * AdminVacationCalendar - Yearly vacation overview for Admin
 * Shows all approved/requested vacations in a 12-month grid
 */
export default function AdminVacationCalendar() {
    const [selectedYear, setSelectedYear] = useState(getYear(new Date()))
    const [absences, setAbsences] = useState([])
    const [profiles, setProfiles] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedMonth, setSelectedMonth] = useState(null) // For detail view
    const { getHoliday } = useHolidays()

    useEffect(() => {
        fetchData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedYear])

    const fetchData = async () => {
        setLoading(true)
        const yearStart = startOfYear(new Date(selectedYear, 0, 1))
        const yearEnd = endOfYear(yearStart)

        // Fetch all vacation absences for the year
        const { data: absData } = await supabase
            .from('absences')
            .select('*, profiles!user_id(full_name, display_name)')
            .eq('type', 'Urlaub')
            .in('status', ['genehmigt', 'beantragt'])
            .gte('start_date', format(yearStart, 'yyyy-MM-dd'))
            .lte('end_date', format(yearEnd, 'yyyy-MM-dd'))

        // Fetch all employees
        const { data: profileData } = await supabase
            .from('profiles')
            .select('id, full_name, display_name, role')
            .or('is_active.eq.true,is_active.is.null')
            .neq('role', 'admin')

        setAbsences(absData || [])
        setProfiles(profileData || [])
        setLoading(false)
    }

    const months = useMemo(() => {
        return eachMonthOfInterval({
            start: new Date(selectedYear, 0, 1),
            end: new Date(selectedYear, 11, 31)
        })
    }, [selectedYear])

    // Get absences for a specific day
    const getAbsencesForDay = (day) => {
        const dayStr = format(day, 'yyyy-MM-dd')
        return absences.filter(abs => {
            return dayStr >= abs.start_date && dayStr <= abs.end_date
        })
    }

    // Mini calendar for each month
    const MiniMonth = ({ month }) => {
        const monthStart = startOfMonth(month)
        const monthEnd = endOfMonth(month)
        const calStart = startOfWeek(monthStart, { locale: de })
        const calEnd = endOfWeek(monthEnd, { locale: de })
        const days = eachDayOfInterval({ start: calStart, end: calEnd })

        // Count unique employees with vacation in this month
        let uniqueEmployees = new Set()
        eachDayOfInterval({ start: monthStart, end: monthEnd }).forEach(day => {
            const dayAbsences = getAbsencesForDay(day)
            if (dayAbsences.length > 0 && !isWeekend(day) && !getHoliday(day)) {
                dayAbsences.forEach(a => uniqueEmployees.add(a.user_id))
            }
        })

        return (
            <div
                className="bg-white rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedMonth(month)}
            >
                <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-gray-800 capitalize">
                        {format(month, 'MMM', { locale: de })}
                    </span>
                    <div className="flex items-center gap-1">
                        {uniqueEmployees.size > 0 && (
                            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                                {uniqueEmployees.size} MA
                            </span>
                        )}
                    </div>
                </div>

                {/* Mini Grid */}
                <div className="grid grid-cols-7 gap-px text-[8px]">
                    {['M', 'D', 'M', 'D', 'F', 'S', 'S'].map((d, i) => (
                        <div key={i} className="text-center text-gray-400 font-medium">{d}</div>
                    ))}
                    {days.map((day, i) => {
                        const inMonth = isSameMonth(day, month)
                        const dayAbsences = getAbsencesForDay(day)
                        const isWeekendDay = isWeekend(day)
                        const holiday = getHoliday(day)

                        let bgColor = ''
                        if (!inMonth) bgColor = 'bg-transparent text-transparent'
                        else if (holiday) bgColor = 'bg-red-50 text-red-400'
                        else if (isWeekendDay) bgColor = 'bg-gray-50 text-gray-300'
                        else if (dayAbsences.length >= 3) bgColor = 'bg-red-200 text-red-800'
                        else if (dayAbsences.some(a => a.status === 'genehmigt')) bgColor = 'bg-green-200 text-green-800'
                        else if (dayAbsences.some(a => a.status === 'beantragt')) bgColor = 'bg-yellow-200 text-yellow-800'
                        else bgColor = 'text-gray-600'

                        return (
                            <div
                                key={i}
                                className={`aspect-square flex items-center justify-center rounded ${bgColor} font-medium`}
                                title={dayAbsences.map(a => a.profiles?.full_name || a.profiles?.display_name).join(', ')}
                            >
                                {inMonth ? format(day, 'd') : ''}
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }

    // Detailed month view modal
    const DetailedMonthView = ({ month, onClose }) => {
        const monthStart = startOfMonth(month)
        const monthEnd = endOfMonth(month)
        const calStart = startOfWeek(monthStart, { locale: de })
        const calEnd = endOfWeek(monthEnd, { locale: de })
        const days = eachDayOfInterval({ start: calStart, end: calEnd })

        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto shadow-2xl">
                    <div className="sticky top-0 bg-white p-4 border-b flex justify-between items-center">
                        <h3 className="text-xl font-bold capitalize">
                            {format(month, 'MMMM yyyy', { locale: de })}
                        </h3>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
                    </div>

                    <div className="p-4">
                        {/* Header */}
                        <div className="grid grid-cols-7 mb-2">
                            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
                                <div key={d} className="text-center text-xs font-bold text-gray-500">{d}</div>
                            ))}
                        </div>

                        {/* Calendar Grid */}
                        <div className="grid grid-cols-7 gap-1">
                            {days.map((day, i) => {
                                const inMonth = isSameMonth(day, month)
                                const dayAbsences = getAbsencesForDay(day)
                                const isWeekendDay = isWeekend(day)
                                const holiday = getHoliday(day)

                                return (
                                    <div
                                        key={i}
                                        className={`min-h-[60px] rounded-lg p-1 border ${inMonth ? 'bg-white border-gray-100' : 'bg-gray-50 border-transparent'
                                            } ${holiday ? 'bg-red-50' : ''} ${isWeekendDay && inMonth ? 'bg-gray-50' : ''}`}
                                    >
                                        <div className={`text-xs font-bold mb-1 ${inMonth ? '' : 'text-gray-300'} ${holiday ? 'text-red-500' : ''}`}>
                                            {format(day, 'd')}
                                        </div>
                                        <div className="space-y-0.5">
                                            {dayAbsences.slice(0, 3).map((abs, j) => (
                                                <div
                                                    key={j}
                                                    className={`text-[9px] px-1 rounded truncate ${abs.status === 'genehmigt'
                                                        ? 'bg-green-100 text-green-700'
                                                        : 'bg-yellow-100 text-yellow-700'
                                                        }`}
                                                >
                                                    {abs.profiles?.display_name || abs.profiles?.full_name?.split(' ')[0]}
                                                </div>
                                            ))}
                                            {dayAbsences.length > 5 && (
                                                <div className="text-[8px] text-gray-400">+{dayAbsences.length - 5}</div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="p-4 border-t flex gap-4 text-xs">
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded bg-green-200"></div>
                            <span>Genehmigt</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded bg-yellow-200"></div>
                            <span>Beantragt</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded bg-red-200"></div>
                            <span>≥3 gleichzeitig</span>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center gap-2">
                    <Calendar className="text-blue-600" size={20} />
                    Jahres-Urlaubskalender
                </h2>
                <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                    <button
                        onClick={() => setSelectedYear(y => y - 1)}
                        className="p-1.5 hover:bg-white rounded-md"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="font-bold px-2">{selectedYear}</span>
                    <button
                        onClick={() => setSelectedYear(y => y + 1)}
                        className="p-1.5 hover:bg-white rounded-md"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {/* Employee Count */}
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <Users size={14} />
                <span>{profiles.length} Mitarbeiter</span>
            </div>

            {loading ? (
                <div className="animate-pulse grid grid-cols-3 md:grid-cols-4 gap-4">
                    {[...Array(12)].map((_, i) => (
                        <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
                    ))}
                </div>
            ) : (
                /* 12-Month Grid */
                <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                    {months.map(month => (
                        <MiniMonth key={month.toString()} month={month} />
                    ))}
                </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-xs text-gray-500 pt-2">
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-green-200"></div>
                    <span>Genehmigt</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-yellow-200"></div>
                    <span>Beantragt</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-red-200"></div>
                    <span>≥3 gleichzeitig</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-red-50 border border-red-200"></div>
                    <span>Feiertag</span>
                </div>
            </div>

            {/* Detail Modal */}
            {selectedMonth && (
                <DetailedMonthView month={selectedMonth} onClose={() => setSelectedMonth(null)} />
            )}
        </div>
    )
}
