import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import { useHolidays } from '../hooks/useHolidays'
import { Thermometer, AlertTriangle } from 'lucide-react'
import { eachDayOfInterval, isWeekend, parseISO, differenceInCalendarDays, format } from 'date-fns'
import { de } from 'date-fns/locale'

const SHIFT_TYPE_SHORT = {
    TD1: 'TD1',
    TD2: 'TD2',
    ND: 'ND',
    DBD: 'DBD',
    TEAM: 'Team',
    FORTBILDUNG: 'Fortbildung',
    EINSCHULUNG: 'Einschulung',
    MITARBEITERGESPRAECH: 'MA-Gespräch',
    SONSTIGES: 'Sonstiges',
    SUPERVISION: 'SV',
    AST: 'AST',
}

const SHIFT_TAG_COLORS = {
    TD1: 'bg-blue-100 text-blue-700',
    TD2: 'bg-sky-100 text-sky-700',
    ND: 'bg-indigo-100 text-indigo-700',
    DBD: 'bg-violet-100 text-violet-700',
    TEAM: 'bg-emerald-100 text-emerald-700',
    FORTBILDUNG: 'bg-orange-100 text-orange-700',
    EINSCHULUNG: 'bg-pink-100 text-pink-700',
    MITARBEITERGESPRAECH: 'bg-rose-100 text-rose-700',
    SONSTIGES: 'bg-gray-100 text-gray-600',
    SUPERVISION: 'bg-violet-100 text-violet-800',
    AST: 'bg-teal-100 text-teal-700',
}

export default function ProfileSickLeave() {
    const { user } = useAuth()
    const { getHoliday } = useHolidays()
    const [sickLeaves, setSickLeaves] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!user) return
        fetchSickLeaves()
    }, [user])

    const fetchSickLeaves = async () => {
        setLoading(true)
        try {
            const { data } = await supabase
                .from('absences')
                .select('id, start_date, end_date, type, status, planned_hours, planned_shifts_snapshot')
                .eq('user_id', user.id)
                .in('type', ['Krank', 'Krankenstand'])
                .order('start_date', { ascending: false })

            setSickLeaves(data || [])
        } catch (err) {
            console.error('ProfileSickLeave error:', err)
        } finally {
            setLoading(false)
        }
    }

    const countWorkdays = (startDate, endDate) => {
        const days = eachDayOfInterval({ start: startDate, end: endDate })
        return days.filter(d => !isWeekend(d) && !getHoliday(d)).length
    }

    const getCalendarDays = (startDate, endDate) => {
        return differenceInCalendarDays(endDate, startDate) + 1
    }

    if (loading) {
        return <div className="animate-pulse bg-gray-100 rounded-2xl h-48"></div>
    }

    const currentYear = new Date().getFullYear()
    const thisYearLeaves = sickLeaves.filter(s => parseISO(s.start_date).getFullYear() === currentYear)
    const pastLeaves = sickLeaves.filter(s => parseISO(s.start_date).getFullYear() < currentYear)

    const thisYearWorkdays = thisYearLeaves.reduce((sum, s) => {
        return sum + countWorkdays(parseISO(s.start_date), parseISO(s.end_date))
    }, 0)

    // Group past leaves by year
    const pastByYear = {}
    pastLeaves.forEach(s => {
        const year = parseISO(s.start_date).getFullYear()
        if (!pastByYear[year]) pastByYear[year] = []
        pastByYear[year].push(s)
    })
    const pastYears = Object.keys(pastByYear).sort((a, b) => b - a)

    const renderLeaveCard = (leave) => {
        const start = parseISO(leave.start_date)
        const end = parseISO(leave.end_date)
        const calDays = getCalendarDays(start, end)
        const workdays = countWorkdays(start, end)
        const needsCertificate = calDays >= 3

        return (
            <div key={leave.id} className="bg-white p-4 rounded-xl shadow-[0_2px_10px_rgb(0,0,0,0.04)] hover:shadow-[0_4px_20px_rgb(0,0,0,0.06)] transition-all">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-bold text-gray-900">
                            {format(start, 'd. MMM', { locale: de })}
                            {leave.start_date !== leave.end_date && (
                                <> — {format(end, 'd. MMM yyyy', { locale: de })}</>
                            )}
                            {leave.start_date === leave.end_date && (
                                <> {format(start, 'yyyy', { locale: de })}</>
                            )}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {calDays === 1 ? '1 Tag' : `${calDays} Tage`}
                            {calDays !== workdays && ` (${workdays} Werktage)`}
                        </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${leave.status === 'genehmigt'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}>
                            {leave.status === 'genehmigt' ? 'Bestätigt' : 'Offen'}
                        </span>
                    </div>
                </div>
                {leave.planned_shifts_snapshot?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        {leave.planned_shifts_snapshot.map((shift, idx) => {
                            const typeKey = shift.type?.toUpperCase() || ''
                            const label = SHIFT_TYPE_SHORT[typeKey] || shift.type || '?'
                            const color = SHIFT_TAG_COLORS[typeKey] || 'bg-gray-100 text-gray-600'
                            return (
                                <span key={idx} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${color}`}>
                                    {label}
                                </span>
                            )
                        })}
                    </div>
                )}
                {needsCertificate && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                        <AlertTriangle size={12} />
                        <span className="font-medium">Ärztl. Attest erforderlich (ab 3 Tagen)</span>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Stats Header */}
            <div className="bg-white p-5 rounded-xl shadow-[0_2px_10px_rgb(0,0,0,0.04)]">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Thermometer size={20} className="text-red-500" />
                        <h3 className="font-bold text-gray-900">Krankenstand {currentYear}</h3>
                    </div>
                    <span className="text-sm font-bold text-red-700 bg-red-50 px-3 py-1 rounded-full">
                        {thisYearLeaves.length} {thisYearLeaves.length === 1 ? 'Meldung' : 'Meldungen'}
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Krankmeldungen</p>
                        <p className="text-2xl font-black text-gray-900">{thisYearLeaves.length}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Werktage krank</p>
                        <p className="text-2xl font-black text-gray-900">{thisYearWorkdays}</p>
                    </div>
                </div>
            </div>

            {/* Current Year Entries */}
            {thisYearLeaves.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-sm font-bold text-gray-500 px-1">{currentYear}</h4>
                    {thisYearLeaves.map(renderLeaveCard)}
                </div>
            )}

            {/* Past Years */}
            {pastYears.map(year => (
                <PastYearSection key={year} year={year} leaves={pastByYear[year]} renderCard={renderLeaveCard} />
            ))}

            {/* Empty State */}
            {sickLeaves.length === 0 && (
                <div className="bg-white p-8 rounded-xl shadow-[0_2px_10px_rgb(0,0,0,0.04)] text-center">
                    <Thermometer size={32} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400 font-medium">Keine Krankmeldungen vorhanden</p>
                </div>
            )}
        </div>
    )
}

function PastYearSection({ year, leaves, renderCard }) {
    const [expanded, setExpanded] = useState(false)

    return (
        <div className="space-y-2">
            <button
                onClick={() => setExpanded(!expanded)}
                className="text-sm font-bold text-gray-500 px-1 hover:text-gray-700 transition-colors flex items-center gap-1"
            >
                <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
                {year} ({leaves.length} {leaves.length === 1 ? 'Meldung' : 'Meldungen'})
            </button>
            {expanded && leaves.map(renderCard)}
        </div>
    )
}
