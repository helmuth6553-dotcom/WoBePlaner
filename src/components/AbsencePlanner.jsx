import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import {
    format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths,
    isWithinInterval, parseISO, isWeekend, isToday
} from 'date-fns'
import { de } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Trash2, Calendar, CheckCircle, Clock, AlertCircle, List, XCircle, Download, Shield } from 'lucide-react'
import { useHolidays } from '../hooks/useHolidays'
import { logAdminAction } from '../utils/adminAudit'
import ActionSheet from './ActionSheet'
import ConfirmModal from './ConfirmModal'
import AlertModal from './AlertModal'
import SignatureModal from './SignatureModal'
import { useToast } from './Toast'
import { handleError, formatSupabaseError } from '../utils/errorHandler'

export default function AbsencePlanner({ initialDate }) {
    const { user, isAdmin } = useAuth()
    const [currentMonth, setCurrentMonth] = useState(initialDate || new Date())
    const [absences, setAbsences] = useState([])
    const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: () => { } })
    const [alertConfig, setAlertConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' })
    const [signatureConfig, setSignatureConfig] = useState({ isOpen: false, payload: null })
    const toast = useToast()

    // If initialDate changes (e.g. navigation from admin dashboard), update currentMonth
    useEffect(() => {
        if (initialDate) {
            setCurrentMonth(new Date(initialDate))
        }
    }, [initialDate])

    const { getHoliday } = useHolidays()

    // Selection State
    const [selectionStart, setSelectionStart] = useState(null)
    const [selectionEnd, setSelectionEnd] = useState(null)

    const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'

    const isAbsentOnDay = (absence, day) => {
        if (!absence.start_date || !absence.end_date) return false
        try {
            return absence.status !== 'abgelehnt' && absence.status !== 'storniert' &&
                isWithinInterval(day, { start: parseISO(absence.start_date), end: parseISO(absence.end_date) })
        } catch {
            console.error('Invalid date in absence:', absence)
            return false
        }
    }

    // Daten laden
    const fetchAbsences = async () => {
        const { data, error } = await supabase
            .from('absences')
            .select('*, profiles!user_id(email, full_name)')
            .neq('type', 'Krank') // Exclude Sick Leave

        if (error) {
            // Use new error handler with toast
            const friendlyError = handleError(error, { component: 'AbsencePlanner', action: 'fetchAbsences' })
            toast.showError(friendlyError.title, friendlyError.message)
            return
        }

        if (data) setAbsences(data)
    }

    useEffect(() => {
        fetchAbsences()

        const channel = supabase
            .channel('absences-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'absences' }, () => fetchAbsences())
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [])

    // Stats Calculation (Simplified for Mobile)
    const [myStats, setMyStats] = useState(null)

    useEffect(() => {
        if (!user) return
        const fetchMyStats = async () => {
            const { data: profile } = await supabase.from('profiles').select('vacation_days_per_year').eq('id', user.id).single()
            if (!profile) return

            const entitlement = profile.vacation_days_per_year || 25
            const myAbsences = absences.filter(a => a.user_id === user.id && a.type === 'Urlaub' && (a.status === 'beantragt' || a.status === 'genehmigt'))

            let requested = 0
            let approved = 0

            myAbsences.forEach(abs => {
                const days = eachDayOfInterval({ start: parseISO(abs.start_date), end: parseISO(abs.end_date) })
                    .filter(d => !isWeekend(d) && !getHoliday(d))
                    .length
                if (abs.status === 'beantragt') requested += days
                if (abs.status === 'genehmigt') approved += days
            })

            setMyStats({ entitlement, requested, approved, remaining: entitlement - approved - requested })
        }
        fetchMyStats()
    }, [user, absences])

    // Kalender Grid
    const calendarDays = useMemo(() => {
        const monthStart = startOfMonth(currentMonth)
        const monthEnd = endOfMonth(monthStart)
        const startDate = startOfWeek(monthStart, { locale: de })
        const endDate = endOfWeek(monthEnd, { locale: de })
        return eachDayOfInterval({ start: startDate, end: endDate })
    }, [currentMonth])

    // Click Handler
    const handleDayClick = (day) => {
        if (isAdmin) return
        if (!selectionStart || (selectionStart && selectionEnd)) {
            setSelectionStart(day)
            setSelectionEnd(null)
        } else {
            if (day < selectionStart) {
                setSelectionStart(day)
            } else {
                setSelectionEnd(day)
            }
        }
    }

    // Start Signature Flow
    const handleSave = () => {
        if (!selectionStart) return
        const start = format(selectionStart, 'yyyy-MM-dd')
        const end = selectionEnd ? format(selectionEnd, 'yyyy-MM-dd') : start

        const payload = {
            user_id: user.id,
            start_date: start,
            end_date: end,
            type: 'Urlaub',
            status: 'beantragt'
        }

        setSignatureConfig({ isOpen: true, payload })
    }

    // Execute Signed Transaction
    const handleSignatureComplete = async (payload, signatureData) => {
        // Prepare parameters matching the SQL function signature (2 JSONB args)
        const rpcParams = {
            p_absence_data: {
                user_id: payload.user_id,
                start_date: payload.start_date,
                end_date: payload.end_date,
                type: payload.type,
                status: payload.status
            },
            p_signature_data: signatureData
        }

        const { error } = await supabase.rpc('create_signed_absence', rpcParams)

        // Fallback or specific error handling
        if (error) {
            console.error("RPC Error:", error)
            // If RPC missing, try manual sequential insert (Less secure but fallback)
            // But for FES we really want the RPC. Just show error for now.
            setAlertConfig({
                isOpen: true,
                title: 'Fehler beim Speichern',
                message: 'Signatur konnte nicht gespeichert werden. (Backend RPC fehlt?) ' + error.message,
                type: 'error'
            })
            return
        }

        fetchAbsences()
        setSelectionStart(null)
        setSelectionEnd(null)
        setSignatureConfig({ isOpen: false, payload: null })
        setAlertConfig({ isOpen: true, title: 'Erfolg', message: 'Antrag erfolgreich signiert und eingereicht.', type: 'info' })
    }

    const handleDelete = (id) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Antrag stornieren?',
            message: 'Möchtest du diesen Urlaubsantrag wirklich stornieren?',
            isDestructive: true,
            confirmText: 'Stornieren',
            onConfirm: async () => {
                await supabase.from('absences').delete().eq('id', id).eq('user_id', user.id)
                fetchAbsences()
            }
        })
    }

    // --- ADMIN INTERACTIVITY ---
    const [selectedAbsence, setSelectedAbsence] = useState(null) // For Admin Modal

    const handleAdminAction = async (absence, status) => {
        if (!isAdmin) return

        const updates = { status }
        if (status === 'genehmigt') {
            updates.approved_by = user.id
            updates.approved_at = new Date().toISOString()
        }

        const { error } = await supabase.from('absences').update(updates).eq('id', absence.id)

        if (!error) {
            // Audit Log
            await logAdminAction(
                `absence_${status}`,
                absence.user_id,
                'absence_request',
                absence.id,
                { before: { status: absence.status }, after: { status: status } }
            )

            // Close modal and refresh
            setSelectedAbsence(null)
            fetchAbsences()
            setAlertConfig({ isOpen: true, title: 'Erfolg', message: `Antrag wurde ${status}.`, type: 'info' })
        } else {
            console.error(error)
            setAlertConfig({ isOpen: true, title: 'Fehler', message: error.message, type: 'error' })
        }
    }

    // PDF Download for approved vacation requests
    const handleDownloadVacationPDF = async (request, days) => {
        try {
            const { jsPDF } = await import('jspdf')
            const doc = new jsPDF()

            const userName = user?.full_name || user?.email || 'Mitarbeiter'
            const startDate = format(parseISO(request.start_date), 'dd.MM.yyyy')
            const endDate = format(parseISO(request.end_date), 'dd.MM.yyyy')
            const approvedDate = request.approved_at ? format(parseISO(request.approved_at), 'dd.MM.yyyy HH:mm') : 'N/A'

            // Header
            doc.setFontSize(20)
            doc.setFont("helvetica", "bold")
            doc.text("Urlaubsbestätigung", 20, 30)

            // Status Badge
            doc.setFillColor(220, 255, 220)
            doc.setDrawColor(0, 150, 0)
            doc.roundedRect(150, 22, 40, 10, 2, 2, 'FD')
            doc.setFontSize(10)
            doc.setTextColor(0, 100, 0)
            doc.text("GENEHMIGT", 155, 29)

            // Reset color
            doc.setTextColor(0, 0, 0)
            doc.setFontSize(12)
            doc.setFont("helvetica", "normal")

            // Content
            let y = 50
            doc.text(`Mitarbeiter: ${userName}`, 20, y); y += 10
            doc.text(`Zeitraum: ${startDate} - ${endDate}`, 20, y); y += 10
            doc.setFont("helvetica", "bold")
            doc.text(`Urlaubstage: ${days} ${days === 1 ? 'Tag' : 'Tage'}`, 20, y); y += 10
            doc.setFont("helvetica", "normal")
            doc.text(`Genehmigt am: ${approvedDate}`, 20, y); y += 20

            // Signature Section
            doc.setFillColor(245, 245, 245)
            doc.rect(20, y, 170, 35, 'F')
            doc.setFontSize(9)
            doc.setTextColor(100, 100, 100)
            y += 8
            doc.text("Digitale Signatur (FES)", 25, y); y += 8

            if (request.data_hash) {
                doc.setFont("helvetica", "bold")
                doc.text(`Hash: ${request.data_hash}`, 25, y); y += 8
                doc.setFont("helvetica", "normal")
            }
            doc.text(`Antrag-ID: ${request.id}`, 25, y)

            // Footer
            doc.setFontSize(8)
            doc.setTextColor(150, 150, 150)
            doc.text("Dieses Dokument wurde digital signiert und ist ohne Unterschrift gültig.", 20, 280)

            doc.save(`Urlaubsbestätigung_${userName.replace(/\s/g, '_')}_${startDate.replace(/\./g, '')}.pdf`)
        } catch (e) {
            console.error('PDF Error:', e)
            setAlertConfig({ isOpen: true, title: 'Fehler', message: 'PDF konnte nicht erstellt werden.', type: 'error' })
        }
    }

    const myRequests = absences.filter(a => a.user_id === user.id).sort((a, b) => new Date(b.start_date) - new Date(a.start_date))

    return (
        <div className="flex flex-col min-h-full bg-gray-50 font-sans pb-24">
            {/* Header with Month, Toggle, and Nav */}
            <div className="px-4 pt-4 pb-2 shrink-0 flex justify-between items-center bg-gray-50 z-10">
                <h3 className="text-xl font-black text-gray-900 capitalize tracking-tight">{format(currentMonth, 'MMMM yyyy', { locale: de })}</h3>
                <div className="flex items-center gap-2">
                    <div className="flex bg-gray-200 p-0.5 rounded-lg">
                        <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}><Calendar size={16} /></button>
                        <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}><List size={16} /></button>
                    </div>
                    <div className="flex gap-1">
                        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm"><ChevronLeft size={18} /></button>
                        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm"><ChevronRight size={18} /></button>
                    </div>
                </div>
            </div>

            {/* Compact Stats Card - Only for Non-Admins */}
            {!isAdmin && myStats && (
                <div className="px-4 mb-3 shrink-0">
                    <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center font-bold text-lg shadow-md">
                                {myStats.remaining}
                            </div>
                            <div className="flex flex-col leading-none gap-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Verfügbar</span>
                                <span className="text-xs font-bold text-gray-600">von {myStats.entitlement} Tagen</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Genehmigt</span>
                                <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-md">{myStats.approved}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Offen</span>
                                <span className="text-xs font-bold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-md">{myStats.requested}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 px-4 flex flex-col min-h-0">
                {viewMode === 'grid' ? (
                    <div className="flex-1 flex flex-col bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50 shrink-0">
                            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
                                <div key={d} className="py-2 text-center text-xs font-bold text-gray-500 uppercase">{d}</div>
                            ))}
                        </div>
                        <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-y-auto">
                            {calendarDays.map(day => {
                                const isCurrentMonth = isSameMonth(day, currentMonth)
                                const isWeekendDay = isWeekend(day)
                                const holiday = getHoliday(day)
                                const isWorkDay = !isWeekendDay && !holiday

                                const isStart = selectionStart && isSameDay(day, selectionStart)
                                const isEnd = selectionEnd && isSameDay(day, selectionEnd)
                                const isInRange = selectionStart && selectionEnd && isWithinInterval(day, { start: selectionStart, end: selectionEnd })
                                const isSelected = isStart || isEnd || isInRange

                                const dayAbsences = absences.filter(a => isAbsentOnDay(a, day))

                                return (
                                    <div
                                        key={day.toString()}
                                        onClick={() => handleDayClick(day)}
                                        className={`min-h-[80px] border-b border-r border-gray-100 p-1 flex flex-col gap-1 relative transition-all
                                            ${isSelected ? (isWorkDay ? 'bg-blue-50 ring-inset ring-2 ring-blue-500' : 'bg-gray-100 ring-inset ring-2 ring-black') : ''}
                                            ${!isSelected && !isCurrentMonth ? 'bg-gray-50/50 text-gray-300' : 'bg-white'}
                                            ${holiday ? 'bg-red-50/30' : ''}
                                        `}
                                    >
                                        <div className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday(day) ? 'bg-black text-white' : ''} ${holiday ? 'text-red-500' : ''}`}>
                                            {format(day, 'd')}
                                        </div>

                                        <div className="flex-1 flex flex-col gap-0.5 overflow-y-auto scrollbar-hide">
                                            {dayAbsences.map((abs, i) => (
                                                <div
                                                    key={i}
                                                    onClick={(e) => {
                                                        if (isAdmin) {
                                                            e.stopPropagation()
                                                            setSelectedAbsence(abs)
                                                        }
                                                    }}
                                                    className={`text-[10px] px-1.5 py-0.5 rounded truncate font-medium border border-white/50 shadow-sm
                                                        ${abs.status === 'genehmigt' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}
                                                        ${isAdmin ? 'cursor-pointer hover:opacity-80' : ''}
                                                    `}
                                                    title={abs.profiles?.full_name}
                                                >
                                                    {abs.profiles?.full_name?.split(' ')[0]}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 pb-4">
                        {/* List View logic remains similar, can iterate on it separately if needed */}
                        {eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })
                            .filter(day => {
                                const hasAbsence = absences.some(a => isAbsentOnDay(a, day))
                                return hasAbsence || getHoliday(day)
                            })
                            .map(day => {
                                const dayAbsences = absences.filter(a => isAbsentOnDay(a, day))
                                const holiday = getHoliday(day)

                                return (
                                    <div key={day.toString()} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center font-bold border ${isWeekend(day) || holiday ? 'bg-red-50 text-red-500 border-red-100' : 'bg-gray-50 text-gray-900 border-gray-100'}`}>
                                                <span className="text-xs uppercase">{format(day, 'EEE', { locale: de })}</span>
                                                <span className="text-lg leading-none">{format(day, 'd')}</span>
                                            </div>
                                            <div>
                                                {holiday && <p className="text-red-500 font-bold text-sm">{holiday.name}</p>}
                                            </div>
                                        </div>

                                        <div className="space-y-2 pl-13">
                                            {dayAbsences.map(abs => (
                                                <div key={abs.id} className="flex items-center gap-3">
                                                    <div className={`w-2 h-2 rounded-full ${abs.status === 'genehmigt' ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                                                    <span className="font-bold text-gray-900 text-lg">{abs.profiles?.full_name}</span>
                                                </div>
                                            ))}
                                            {dayAbsences.length === 0 && !holiday && (
                                                <p className="text-gray-400 text-sm italic">Alle anwesend</p>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        {eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) }).filter(day => {
                            const hasAbsence = absences.some(a => isAbsentOnDay(a, day))
                            return hasAbsence || getHoliday(day)
                        }).length === 0 && (
                                <div className="text-center py-12 text-gray-400">
                                    <p>Keine Abwesenheiten oder Feiertage in diesem Monat.</p>
                                </div>
                            )}
                    </div>
                )}
            </div>

            {/* Floating Action Button for Request */}
            {selectionStart && (
                <div className="mt-4 mx-4 z-40 animate-in slide-in-from-bottom-4 fade-in duration-300 shrink-0">
                    <button
                        onClick={handleSave}
                        className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg shadow-2xl flex items-center justify-center gap-2 transform transition-transform active:scale-95"
                    >
                        <Calendar size={20} />
                        {(() => {
                            if (!selectionEnd) return 'Bis wann?'
                            const days = eachDayOfInterval({ start: selectionStart, end: selectionEnd })
                            const workDays = days.filter(d => !isWeekend(d) && !getHoliday(d)).length
                            return `${workDays} Tage beantragen`
                        })()}
                    </button>
                </div>
            )}

            {/* My Requests List */}
            {!isAdmin && (
                <div className="px-4 mt-8 shrink-0">
                    <h3 className="font-bold text-lg mb-4 text-gray-900">Meine Anträge</h3>
                    <div className="space-y-3">
                        {myRequests.map(req => {
                            // Calculate work days (excluding weekends and holidays)
                            const days = eachDayOfInterval({ start: parseISO(req.start_date), end: parseISO(req.end_date) })
                                .filter(d => !isWeekend(d) && !getHoliday(d))
                                .length

                            // Check if signed (has data_hash)
                            const isSigned = !!req.data_hash

                            return (
                                <div key={req.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2.5 rounded-xl ${req.status === 'genehmigt' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
                                                {req.status === 'genehmigt' ? <CheckCircle size={20} /> : <Clock size={20} />}
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900">
                                                    {format(parseISO(req.start_date), 'dd.MM.')} - {format(parseISO(req.end_date), 'dd.MM.yyyy')}
                                                </p>
                                                <p className="text-sm text-gray-500 flex items-center gap-2">
                                                    <span className="font-bold text-gray-700">{days} {days === 1 ? 'Tag' : 'Tage'}</span>
                                                    {isSigned && (
                                                        <span className="text-green-600 flex items-center gap-1 text-xs">
                                                            <Shield size={12} /> Signiert
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {req.status === 'genehmigt' && (
                                                <button
                                                    onClick={() => handleDownloadVacationPDF(req, days)}
                                                    className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="PDF herunterladen"
                                                >
                                                    <Download size={18} />
                                                </button>
                                            )}
                                            {req.status === 'beantragt' && (
                                                <button onClick={() => handleDelete(req.id)} className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                        {myRequests.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Keine Anträge vorhanden.</p>}
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={confirmConfig.isOpen}
                onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                message={confirmConfig.message}
                isDestructive={confirmConfig.isDestructive}
                confirmText={confirmConfig.confirmText}
            />
            <AlertModal
                isOpen={alertConfig.isOpen}
                onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
            />
            <SignatureModal
                isOpen={signatureConfig.isOpen}
                onClose={() => setSignatureConfig({ ...signatureConfig, isOpen: false })}
                onConfirm={handleSignatureComplete}
                payload={signatureConfig.payload}
                title="Urlaub beantragen"
            />
            {/* ADMIN DETAIL MODAL */}
            {selectedAbsence && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 relative animate-in zoom-in-95 duration-200">
                        <button onClick={() => setSelectedAbsence(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                            <XCircle size={24} />
                        </button>

                        <h3 className="text-xl font-bold mb-4 pr-8">Antragsdetails</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Mitarbeiter</label>
                                <div className="font-bold text-lg">{selectedAbsence.profiles?.full_name || selectedAbsence.profiles?.email}</div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Von</label>
                                    <div className="font-medium">{format(new Date(selectedAbsence.start_date), 'dd.MM.yyyy')}</div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Bis</label>
                                    <div className="font-medium">{format(new Date(selectedAbsence.end_date), 'dd.MM.yyyy')}</div>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Status</label>
                                <div className={`inline-block px-2 py-1 rounded text-sm font-bold mt-1
                                    ${selectedAbsence.status === 'genehmigt' ? 'bg-green-100 text-green-800' :
                                        selectedAbsence.status === 'abgelehnt' ? 'bg-red-100 text-red-800' :
                                            'bg-yellow-100 text-yellow-800'}
                                `}>
                                    {selectedAbsence.status.toUpperCase()}
                                </div>
                            </div>

                            <hr className="border-gray-100 my-4" />

                            <div className="flex gap-3">
                                {selectedAbsence.status === 'beantragt' && (
                                    <>
                                        <button
                                            onClick={() => handleAdminAction(selectedAbsence, 'genehmigt')}
                                            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                                        >
                                            <CheckCircle size={18} /> Genehmigen
                                        </button>
                                        <button
                                            onClick={() => handleAdminAction(selectedAbsence, 'abgelehnt')}
                                            className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                                        >
                                            <XCircle size={18} /> Ablehnen
                                        </button>
                                    </>
                                )}
                                {selectedAbsence.status !== 'beantragt' && (
                                    <button
                                        onClick={() => setSelectedAbsence(null)}
                                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 rounded-xl transition-colors"
                                    >
                                        Schließen
                                    </button>
                                )}
                            </div>

                            {/* Allow cancellation of approved items if needed */}
                            {selectedAbsence.status === 'genehmigt' && (
                                <div className="pt-2 text-center">
                                    <button
                                        onClick={() => {
                                            if (confirm("Diesen genehmigten Urlaub wirklich stornieren?")) {
                                                handleAdminAction(selectedAbsence, 'storniert')
                                            }
                                        }}
                                        className="text-xs text-red-400 hover:text-red-600 underline"
                                    >
                                        Genehmigten Urlaub stornieren
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
