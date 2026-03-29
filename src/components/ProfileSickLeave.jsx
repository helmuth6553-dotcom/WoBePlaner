import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import { useHolidays } from '../hooks/useHolidays'
import { Thermometer, AlertTriangle, Trash2, HeartPulse } from 'lucide-react'
import { eachDayOfInterval, isWeekend, parseISO, differenceInCalendarDays, format } from 'date-fns'
import { de } from 'date-fns/locale'
import ConfirmModal from './ConfirmModal'
import { useToast } from './Toast'

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
    const toast = useToast()
    const [sickLeaves, setSickLeaves] = useState([])
    const [loading, setLoading] = useState(true)
    const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null })
    const [shortenerModal, setShortenerModal] = useState({ isOpen: false, leave: null, newEndDate: '' })

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

    const handleDeleteConfirmed = async () => {
        const { error } = await supabase
            .from('absences')
            .delete()
            .eq('id', confirmDelete.id)
            .eq('user_id', user.id)

        if (error) {
            toast.showError('Fehler beim Löschen', 'Die Krankmeldung konnte nicht gelöscht werden.')
            return
        }
        toast.showSuccess('Gelöscht', 'Krankmeldung wurde entfernt.')
        fetchSickLeaves()
    }

    const handleShortenerOpen = (leave) => {
        const today = new Date().toISOString().split('T')[0]
        const clamped = today < leave.start_date ? leave.start_date
                      : today > leave.end_date   ? leave.end_date : today
        setShortenerModal({ isOpen: true, leave, newEndDate: clamped })
    }

    const handleShortenerConfirm = async () => {
        const { leave, newEndDate } = shortenerModal
        if (!newEndDate || newEndDate < leave.start_date) {
            toast.showError('Ungültiges Datum', 'Das neue Enddatum muss nach dem Startdatum liegen.')
            return
        }
        const { error } = await supabase
            .from('absences')
            .update({ end_date: newEndDate })
            .eq('id', leave.id)
            .eq('user_id', user.id)

        if (error) {
            toast.showError('Fehler', 'Das Enddatum konnte nicht angepasst werden.')
            return
        }
        toast.showSuccess('Gesund gemeldet', 'Bitte prüfe im Dienstplan ob Dienste neu eingetragen werden müssen.')
        setShortenerModal({ isOpen: false, leave: null, newEndDate: '' })
        fetchSickLeaves()
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
    const today = new Date().toISOString().split('T')[0]
    const thisYearLeaves = sickLeaves.filter(s => parseISO(s.start_date).getFullYear() === currentYear)
    const pastLeaves = sickLeaves.filter(s => parseISO(s.start_date).getFullYear() < currentYear)

    const thisYearCalDays = thisYearLeaves.reduce((sum, s) => {
        return sum + getCalendarDays(parseISO(s.start_date), parseISO(s.end_date))
    }, 0)

    const thisYearMissedShifts = thisYearLeaves.reduce((sum, s) => {
        return sum + (s.planned_shifts_snapshot?.length || 0)
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
        const isActive = leave.end_date >= today

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
                    <div className="flex flex-col items-end gap-2">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${leave.status === 'genehmigt'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}>
                            {leave.status === 'genehmigt' ? 'Bestätigt' : 'Offen'}
                        </span>
                        <div className="flex gap-1.5">
                            {isActive && (
                                <button
                                    onClick={() => handleShortenerOpen(leave)}
                                    className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-2 py-1 transition-colors"
                                >
                                    <HeartPulse size={11} /> Gesund melden
                                </button>
                            )}
                            <button
                                onClick={() => setConfirmDelete({ isOpen: true, id: leave.id })}
                                className="flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg px-2 py-1 transition-colors"
                            >
                                <Trash2 size={11} /> Löschen
                            </button>
                        </div>
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

                <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Krankmeldungen</p>
                        <p className="text-2xl font-black text-gray-900">{thisYearLeaves.length}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Krankentage</p>
                        <p className="text-2xl font-black text-gray-900">{thisYearCalDays}</p>
                    </div>
                    <div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase mb-1">Ausgefallene Dienste</p>
                        <p className="text-2xl font-black text-gray-900">{thisYearMissedShifts}</p>
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

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={confirmDelete.isOpen}
                onClose={() => setConfirmDelete({ isOpen: false, id: null })}
                onConfirm={handleDeleteConfirmed}
                title="Krankmeldung löschen?"
                message="Die Krankmeldung wird dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden."
                confirmText="Löschen"
                cancelText="Abbrechen"
                isDestructive={true}
            />

            {/* Gesund-melden Modal */}
            {shortenerModal.isOpen && shortenerModal.leave && (
                <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 rounded-full bg-emerald-100 text-emerald-600">
                                <HeartPulse size={24} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">Wieder gesund?</h3>
                        </div>
                        <p className="text-gray-500 mb-4">
                            Krank seit {format(parseISO(shortenerModal.leave.start_date), 'd. MMMM', { locale: de })}.
                            Bis wann warst du krank?
                        </p>
                        <input
                            type="date"
                            value={shortenerModal.newEndDate}
                            min={shortenerModal.leave.start_date}
                            max={shortenerModal.leave.end_date}
                            onChange={(e) => setShortenerModal(prev => ({ ...prev, newEndDate: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-4 py-3 mb-6 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShortenerModal({ isOpen: false, leave: null, newEndDate: '' })}
                                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                            >
                                Abbrechen
                            </button>
                            <button
                                onClick={handleShortenerConfirm}
                                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-transform active:scale-95"
                            >
                                Bestätigen
                            </button>
                        </div>
                    </div>
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
