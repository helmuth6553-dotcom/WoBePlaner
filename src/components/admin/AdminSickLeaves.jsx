import { useState, useEffect } from 'react'
import { Thermometer, Trash2, HeartPulse } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { supabase } from '../../supabase'
import ConfirmModal from '../ConfirmModal'
import { useToast } from '../Toast'
import { logAdminAction, fetchBeforeState } from '../../utils/adminAudit'

/**
 * =========================================================================
 * AdminSickLeaves
 * Displays current and historical sick leave records.
 * Admins can delete or shorten (end_date) any sick leave.
 * =========================================================================
 */
export default function AdminSickLeaves() {
    const toast = useToast()
    const [sickLeaves, setSickLeaves] = useState([])
    const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, id: null, targetUserId: null })
    const [shortenerModal, setShortenerModal] = useState({ isOpen: false, leave: null, newEndDate: '' })

    const fetchSick = async () => {
        const { data } = await supabase
            .from('absences')
            .select('*, profiles!user_id(full_name, email)')
            .in('type', ['Krank', 'Krankenstand'])
            .order('start_date', { ascending: false })
        setSickLeaves(data || [])
    }

    useEffect(() => { fetchSick() }, [])

    const handleDeleteConfirmed = async () => {
        const { id, targetUserId } = confirmDelete
        const before = await fetchBeforeState('absences', id, 'start_date, end_date, type, user_id')

        const { error } = await supabase
            .from('absences')
            .delete()
            .eq('id', id)

        if (error) {
            toast.showError('Fehler beim Löschen', 'Die Krankmeldung konnte nicht gelöscht werden.')
            return
        }

        await logAdminAction(
            'sick_leave_deleted',
            targetUserId,
            'absence',
            id,
            { before, after: null },
            { reason: 'Admin-Löschung über AdminSickLeaves' }
        )

        toast.showSuccess('Gelöscht', 'Krankmeldung wurde entfernt.')
        fetchSick()
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

        const before = await fetchBeforeState('absences', leave.id, 'start_date, end_date')

        const { error } = await supabase
            .from('absences')
            .update({ end_date: newEndDate })
            .eq('id', leave.id)

        if (error) {
            toast.showError('Fehler', 'Das Enddatum konnte nicht angepasst werden.')
            return
        }

        await logAdminAction(
            'sick_leave_shortened',
            leave.user_id,
            'absence',
            leave.id,
            { before, after: { end_date: newEndDate } },
            { reason: 'Admin hat Krankmeldung gekürzt' }
        )

        toast.showSuccess('Gesund gemeldet', 'Bitte prüfe im Dienstplan ob Dienste neu eingetragen werden müssen.')
        setShortenerModal({ isOpen: false, leave: null, newEndDate: '' })
        fetchSick()
    }

    const today = new Date().toISOString().split('T')[0]
    const activeSick = sickLeaves.filter(s => s.end_date >= today)
    const pastSick = sickLeaves.filter(s => s.end_date < today)

    return (
        <div>
            <h2 className="text-xl font-bold mb-6 text-red-600 flex items-center gap-2">
                <Thermometer /> Aktuell Krank ({activeSick.length})
            </h2>

            <div className="space-y-3 mb-12">
                {activeSick.map(req => (
                    <div key={req.id} className="bg-red-50/50 border border-red-100/80 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center shadow-[0_2px_10px_rgb(0,0,0,0.04)] gap-4">
                        <div>
                            <span className="font-bold text-red-900 text-lg">
                                {req.profiles?.full_name || req.profiles?.email}
                            </span>
                            <span className="text-red-700 text-sm block">
                                {format(parseISO(req.start_date), 'dd.MM.yyyy', { locale: de })} – {format(parseISO(req.end_date), 'dd.MM.yyyy', { locale: de })}
                            </span>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <button
                                onClick={() => handleShortenerOpen(req)}
                                className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-2.5 py-1.5 transition-colors"
                            >
                                <HeartPulse size={12} /> Gesund melden
                            </button>
                            <button
                                onClick={() => setConfirmDelete({ isOpen: true, id: req.id, targetUserId: req.user_id })}
                                className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg px-2.5 py-1.5 transition-colors"
                            >
                                <Trash2 size={12} /> Löschen
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <h2 className="text-xl font-bold mb-6 pt-8 border-t border-gray-200">Historie</h2>

            <div className="space-y-3">
                {pastSick.map(req => (
                    <div key={req.id} className="bg-gray-50 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center shadow-[0_2px_10px_rgb(0,0,0,0.04)] gap-4 opacity-75">
                        <div>
                            <span className="font-bold text-lg text-gray-700">
                                {req.profiles?.full_name || req.profiles?.email}
                            </span>
                            <span className="text-gray-500 text-sm block">
                                {format(parseISO(req.start_date), 'dd.MM.yyyy', { locale: de })} – {format(parseISO(req.end_date), 'dd.MM.yyyy', { locale: de })}
                            </span>
                        </div>
                        <button
                            onClick={() => setConfirmDelete({ isOpen: true, id: req.id, targetUserId: req.user_id })}
                            className="flex items-center gap-1 text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg px-2.5 py-1.5 transition-colors"
                        >
                            <Trash2 size={12} /> Löschen
                        </button>
                    </div>
                ))}
            </div>

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={confirmDelete.isOpen}
                onClose={() => setConfirmDelete({ isOpen: false, id: null, targetUserId: null })}
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
                        <p className="text-gray-500 mb-1 font-bold">
                            {shortenerModal.leave.profiles?.full_name || shortenerModal.leave.profiles?.email}
                        </p>
                        <p className="text-gray-500 mb-4">
                            Krank seit {format(parseISO(shortenerModal.leave.start_date), 'd. MMMM', { locale: de })}.
                            Bis wann war die Person krank?
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
