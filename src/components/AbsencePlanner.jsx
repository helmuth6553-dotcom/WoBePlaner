import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { debounce } from '../utils/debounce'
import { useAuth } from '../AuthContext'
import {
    format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    eachDayOfInterval, eachMonthOfInterval, isSameMonth, isSameDay, addMonths, subMonths,
    isWithinInterval, parseISO, isWeekend, isToday, getYear
} from 'date-fns'
import { de } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Trash2, Calendar, CheckCircle, Clock, AlertCircle, LayoutGrid, XCircle, Download, Shield } from 'lucide-react'
import { useHolidays } from '../hooks/useHolidays'
import { logAdminAction } from '../utils/adminAudit'
import ActionSheet from './ActionSheet'
import ConfirmModal from './ConfirmModal'
import AlertModal from './AlertModal'
import SignatureModal from './SignatureModal'
import { useToast } from './Toast'
import { handleError } from '../utils/errorHandler'

export default function AbsencePlanner({ initialDate }) {
    const { user, isAdmin, isViewer } = useAuth()
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

    const [viewMode, setViewMode] = useState('grid') // 'grid' | 'year'
    const [selectedYear, setSelectedYear] = useState(getYear(new Date()))
    const [selectedMonth, setSelectedMonth] = useState(null) // For year-view detail modal

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

        let wasConnected = false
        const debouncedAbsenceFetch = debounce(fetchAbsences, 500)
        const channel = supabase
            .channel('absences-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'absences' }, debouncedAbsenceFetch)
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    if (wasConnected) fetchAbsences()
                    wasConnected = true
                }
            })

        return () => { supabase.removeChannel(channel) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        if (isAdmin || isViewer) return
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
    const handleSave = async () => {
        if (!selectionStart) return
        const start = selectionStart
        const end = selectionEnd || selectionStart

        // Check if user already has vacation overlapping this range
        const startStr = format(start, 'yyyy-MM-dd')
        const endStr = format(end, 'yyyy-MM-dd')
        const hasOverlap = absences.some(a =>
            a.user_id === user.id &&
            a.type === 'Urlaub' &&
            (a.status === 'beantragt' || a.status === 'genehmigt') &&
            a.start_date <= endStr && a.end_date >= startStr
        )
        if (hasOverlap) {
            setAlertConfig({
                isOpen: true,
                title: 'Urlaub bereits beantragt',
                message: 'Du hast für diesen Zeitraum bereits einen Urlaubsantrag eingereicht.',
                type: 'error'
            })
            return
        }

        // Check vacation limit (hard block at 5, warning at 3-4)
        const MAX_VACATION_PER_DAY = 5
        const VACATION_WARNING_THRESHOLD = 3
        const days = eachDayOfInterval({ start, end })
        const workDays = days.filter(d => !isWeekend(d) && !getHoliday(d))

        for (const day of workDays) {
            const dayStr = format(day, 'yyyy-MM-dd')
            const count = absences.filter(a =>
                a.type === 'Urlaub' &&
                (a.status === 'genehmigt' || a.status === 'beantragt') &&
                a.user_id !== user.id && // Don't count own requests
                dayStr >= a.start_date && dayStr <= a.end_date
            ).length

            if (count >= MAX_VACATION_PER_DAY) {
                setAlertConfig({
                    isOpen: true,
                    title: 'Urlaubsantrag nicht möglich',
                    message: `Am ${format(day, 'dd.MM.yyyy')} haben bereits ${count} Mitarbeiter Urlaub beantragt oder genehmigt. Ein weiterer Antrag ist für diesen Zeitraum nicht möglich.`,
                    type: 'error'
                })
                return
            }

            if (count >= VACATION_WARNING_THRESHOLD) {
                const payload = {
                    user_id: user.id,
                    start_date: format(start, 'yyyy-MM-dd'),
                    end_date: format(end, 'yyyy-MM-dd'),
                    type: 'Urlaub',
                    status: 'beantragt'
                }
                setConfirmConfig({
                    isOpen: true,
                    title: 'Hohe Urlaubsüberschneidung',
                    message: `Am ${format(day, 'dd.MM.yyyy')} haben bereits ${count} Mitarbeiter Urlaub beantragt oder genehmigt. Laut interner Vereinbarung sollten maximal 3 Mitarbeiter gleichzeitig abwesend sein. Du kannst den Antrag trotzdem einreichen — die Genehmigung liegt im Ermessen der Team-Koordination.`,
                    confirmText: 'Trotzdem beantragen',
                    isDestructive: false,
                    onConfirm: () => setSignatureConfig({ isOpen: true, payload })
                })
                return
            }
        }

        // All checks passed - proceed with signature
        const payload = {
            user_id: user.id,
            start_date: format(start, 'yyyy-MM-dd'),
            end_date: format(end, 'yyyy-MM-dd'),
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

        // Notify admins about the new vacation request
        try {
            await supabase.functions.invoke('notify-admin-vacation', {
                body: {
                    userName: user.full_name || user.email,
                    startDate: payload.start_date,
                    endDate: payload.end_date
                }
            })
        } catch (notifyError) {
            console.log('Admin notification skipped:', notifyError)
            // Don't fail the request if notification fails
        }
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
                {
                    before: { status: absence.status },
                    after: { status: status },
                    context: {
                        type: absence.type,
                        start_date: absence.start_date,
                        end_date: absence.end_date
                    }
                }
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

    // PDF Download for approved vacation requests — uses same generator as Admin
    const handleDownloadVacationPDF = async (request, _days) => {
        try {
            const { generateVacationRequestPDF } = await import('../utils/vacationPdfGenerator')
            // Fetch signature
            const { data: signature } = await supabase
                .from('signatures')
                .select('*')
                .eq('request_id', request.id)
                .eq('role', 'applicant')
                .single()

            // Fetch approver name
            let approverName = 'Administrator'
            if (request.approved_by) {
                const { data: approver } = await supabase
                    .from('profiles')
                    .select('full_name, email')
                    .eq('id', request.approved_by)
                    .single()
                if (approver) approverName = approver.full_name || approver.email
            }

            // Fetch profile for name and facility
            const { data: profile } = await supabase
                .from('profiles')
                .select('full_name, email, facility, department')
                .eq('id', user.id)
                .single()

            const employeeName = profile?.full_name || request.profiles?.full_name || user?.email || 'Mitarbeiter'
            const facilityName = profile?.facility || profile?.department || 'Chill Out'

            // Use already-loaded myStats for vacation account (avoids re-query issues)
            const yearlyEntitlement = myStats?.entitlement || 25
            const remaining = myStats?.remaining ?? 0

            generateVacationRequestPDF({
                request,
                employeeName,
                facilityName,
                vacationAccount: {
                    entitlement: yearlyEntitlement,
                    remaining
                },
                signature: signature || null,
                approval: {
                    approverName,
                    approvedAt: request.approved_at
                }
            })
        } catch (e) {
            console.error('PDF Error:', e)
            setAlertConfig({ isOpen: true, title: 'Fehler', message: 'PDF konnte nicht erstellt werden.', type: 'error' })
        }
    }

    const MiniMonth = ({ month }) => {
        const monthStart = startOfMonth(month)
        const monthEnd = endOfMonth(month)
        const calStart = startOfWeek(monthStart, { locale: de })
        const calEnd = endOfWeek(monthEnd, { locale: de })
        const days = eachDayOfInterval({ start: calStart, end: calEnd })

        const uniqueEmployees = new Set()
        eachDayOfInterval({ start: monthStart, end: monthEnd }).forEach(day => {
            if (isWeekend(day) || getHoliday(day)) return
            absences.forEach(a => { if (isAbsentOnDay(a, day)) uniqueEmployees.add(a.user_id) })
        })

        return (
            <div
                className="bg-white rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedMonth(month)}
            >
                <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-gray-800 capitalize text-sm">
                        {format(month, 'MMM', { locale: de })}
                    </span>
                    {uniqueEmployees.size > 0 && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                            {uniqueEmployees.size} MA
                        </span>
                    )}
                </div>
                <div className="grid grid-cols-7 gap-px text-[8px]">
                    {['M', 'D', 'M', 'D', 'F', 'S', 'S'].map((d, i) => (
                        <div key={i} className="text-center text-gray-400 font-medium">{d}</div>
                    ))}
                    {days.map((day, i) => {
                        const inMonth = isSameMonth(day, month)
                        const isWeekendDay = isWeekend(day)
                        const holiday = getHoliday(day)
                        const dayAbsences = inMonth ? absences.filter(a => isAbsentOnDay(a, day)) : []
                        const isWorkDay = inMonth && !isWeekendDay && !holiday

                        // Sort: genehmigt first, then beantragt — fill 3 slots
                        const sorted = [...dayAbsences].sort((a, b) =>
                            a.status === 'genehmigt' && b.status !== 'genehmigt' ? -1 :
                            b.status === 'genehmigt' && a.status !== 'genehmigt' ? 1 : 0
                        )
                        const slots = [0, 1, 2].map(j => sorted[j]?.status ?? null)
                        const slotColor = s => s === 'genehmigt' ? 'bg-green-400' : s === 'beantragt' ? 'bg-yellow-300' : 'bg-gray-100'

                        const numColor = !inMonth ? 'text-transparent' : holiday ? 'text-red-400' : isWeekendDay ? 'text-gray-300' : 'text-gray-600'
                        const cellBg = !inMonth ? '' : holiday ? 'bg-red-50' : isWeekendDay ? 'bg-gray-50' : 'bg-white'

                        return (
                            <div
                                key={i}
                                className={`rounded overflow-hidden flex flex-col ${cellBg}`}
                                title={dayAbsences.map(a => a.profiles?.full_name?.split(' ')[0]).filter(Boolean).join(', ')}
                            >
                                <div className={`text-center text-[8px] font-medium py-px leading-none ${numColor}`}>
                                    {inMonth ? format(day, 'd') : '\u00A0'}
                                </div>
                                {inMonth ? (
                                    <div className="flex flex-col gap-px px-px pb-px h-4">
                                        {slots.map((status, j) => (
                                            <div key={j} className={`flex-1 rounded-sm ${slotColor(status)}`} />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-4" />
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }

    const DetailedMonthView = ({ month, onClose }) => {
        const monthStart = startOfMonth(month)
        const monthEnd = endOfMonth(month)
        const calStart = startOfWeek(monthStart, { locale: de })
        const calEnd = endOfWeek(monthEnd, { locale: de })
        const days = eachDayOfInterval({ start: calStart, end: calEnd })

        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                <div
                    className="bg-white rounded-[1.5rem] w-full max-w-lg max-h-[90vh] flex flex-col shadow-[0_8px_30px_rgb(0,0,0,0.12)] cursor-pointer"
                    onClick={() => { setCurrentMonth(month); setViewMode('grid'); onClose() }}
                >
                    <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex justify-between items-center rounded-t-[1.5rem]">
                        <div>
                            <h3 className="text-lg font-bold capitalize">
                                {format(month, 'MMMM yyyy', { locale: de })}
                            </h3>
                            <p className="text-xs text-gray-400 mt-0.5">Tippen zum Eintragen</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); onClose() }} className="text-gray-400 hover:text-gray-600 p-1">
                            <XCircle size={22} />
                        </button>
                    </div>

                    <div className="overflow-y-auto p-4">
                        {/* Weekday header */}
                        <div className="grid grid-cols-7 mb-1">
                            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
                                <div key={d} className="text-center text-xs font-bold text-gray-400">{d}</div>
                            ))}
                        </div>

                        {/* Calendar grid */}
                        <div className="grid grid-cols-7 gap-1">
                            {days.map((day, i) => {
                                const inMonth = isSameMonth(day, month)
                                const dayAbsences = inMonth ? absences.filter(a => isAbsentOnDay(a, day)) : []
                                const isWeekendDay = isWeekend(day)
                                const holiday = getHoliday(day)

                                return (
                                    <div
                                        key={i}
                                        className={`min-h-[56px] rounded-lg p-1 border ${inMonth ? 'bg-white border-gray-100' : 'bg-gray-50 border-transparent'} ${holiday ? 'bg-red-50' : ''} ${isWeekendDay && inMonth ? 'bg-gray-50' : ''}`}
                                    >
                                        <div className={`text-xs font-bold mb-0.5 ${inMonth ? '' : 'text-gray-300'} ${holiday ? 'text-red-500' : ''}`}>
                                            {format(day, 'd')}
                                        </div>
                                        <div className="space-y-px">
                                            {dayAbsences.slice(0, 3).map((abs, j) => (
                                                <div
                                                    key={j}
                                                    className={`text-[9px] px-1 rounded truncate font-medium ${abs.status === 'genehmigt' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}
                                                >
                                                    {abs.profiles?.full_name?.split(' ')[0]}
                                                </div>
                                            ))}
                                            {dayAbsences.length > 3 && (
                                                <div className="text-[8px] text-gray-400">+{dayAbsences.length - 3}</div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="px-5 py-3 border-t border-gray-100 flex gap-4 text-xs text-gray-500 rounded-b-[1.5rem]">
                        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-200"></div><span>Genehmigt</span></div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-200"></div><span>Beantragt</span></div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-50 border border-red-200"></div><span>Feiertag</span></div>
                    </div>
                </div>
            </div>
        )
    }

    const myRequests = absences.filter(a => a.user_id === user.id).sort((a, b) => new Date(b.start_date) - new Date(a.start_date))

    return (
        <div className="flex flex-col min-h-full bg-gray-50 font-sans pb-24">
            {/* Header with Month/Year, Toggle, and Nav */}
            <div className="px-4 pt-4 pb-2 shrink-0 flex justify-between items-center bg-gray-50 z-10">
                {viewMode === 'year'
                    ? <h3 className="text-xl font-black text-gray-900 tracking-tight">{selectedYear}</h3>
                    : <h3 className="text-xl font-black text-gray-900 capitalize tracking-tight">{format(currentMonth, 'MMMM yyyy', { locale: de })}</h3>
                }
                <div className="flex items-center gap-2">
                    <div className="flex bg-gray-200 p-0.5 rounded-lg">
                        <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}><Calendar size={16} /></button>
                        <button onClick={() => { setSelectedYear(getYear(currentMonth)); setViewMode('year') }} className={`p-1.5 rounded-md transition-all ${viewMode === 'year' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}><LayoutGrid size={16} /></button>
                    </div>
                    <div className="flex gap-1">
                        {viewMode === 'year' ? (
                            <>
                                <button onClick={() => setSelectedYear(y => y - 1)} className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm"><ChevronLeft size={18} /></button>
                                <button onClick={() => setSelectedYear(y => y + 1)} className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm"><ChevronRight size={18} /></button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm"><ChevronLeft size={18} /></button>
                                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm"><ChevronRight size={18} /></button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Compact Stats Card - Only for Non-Admins */}
            {!isAdmin && !isViewer && myStats && (
                <div className="px-4 mb-3 shrink-0">
                    <div className="bg-white p-3 rounded-xl shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-teal-500 text-white flex items-center justify-center font-bold text-lg shadow-md">
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
                    <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm overflow-hidden">
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
                    /* Year View — 12 mini-month cards */
                    <div className="flex-1 overflow-y-auto">
                        <div className="grid grid-cols-3 gap-3 pb-4">
                            {eachMonthOfInterval({
                                start: new Date(selectedYear, 0, 1),
                                end: new Date(selectedYear, 11, 1)
                            }).map(month => (
                                <MiniMonth key={month.toString()} month={month} />
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-gray-500 pt-2 pb-4">
                            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-400"></div><span>Genehmigt</span></div>
                            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-300"></div><span>Beantragt</span></div>
                            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-50 border border-red-200"></div><span>Feiertag</span></div>
                        </div>
                    </div>
                )}
            </div>

            {/* Floating Action Button for Request */}
            {selectionStart && !isViewer && (
                <div className="mt-4 mx-4 z-40 animate-in slide-in-from-bottom-4 fade-in duration-300 shrink-0">
                    <button
                        onClick={handleSave}
                        className="w-full bg-teal-500 hover:bg-teal-600 text-white py-4 rounded-2xl font-bold text-lg shadow-2xl flex items-center justify-center gap-2 transform transition-transform active:scale-95"
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
            {!isAdmin && !isViewer && (
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
                                <div key={req.id} className="bg-white p-4 rounded-xl shadow-sm">
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
                                                {req.created_at && (
                                                    <p className="text-xs text-gray-400 mt-0.5">
                                                        Eingereicht am {format(new Date(req.created_at), 'dd.MM.yyyy')}
                                                    </p>
                                                )}
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
                                            {req.status === 'beantragt' && !isViewer && (
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
            {/* YEAR VIEW MONTH DETAIL MODAL */}
            {selectedMonth && (
                <DetailedMonthView month={selectedMonth} onClose={() => setSelectedMonth(null)} />
            )}

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
                                            setConfirmConfig({
                                                isOpen: true,
                                                title: 'Urlaub stornieren',
                                                message: 'Diesen genehmigten Urlaub wirklich stornieren?',
                                                confirmText: 'Stornieren',
                                                isDestructive: true,
                                                onConfirm: () => handleAdminAction(selectedAbsence, 'storniert')
                                            })
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
