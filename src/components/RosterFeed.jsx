import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import DayCard from './DayCard'
import MonthView from './MonthView'
import MonthMinimap from './MonthMinimap'
import SwapShiftModal from './SwapShiftModal'
import RosterLogModal from './RosterLogModal'
import ConfirmModal from './ConfirmModal'
import AlertModal from './AlertModal'
import { LayoutList, Table as TableIcon, ChevronLeft, ChevronRight, Lock, Unlock, ChevronDown, ChevronUp, Thermometer, FileText, Eye, EyeOff, Settings } from 'lucide-react'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, getYear, getMonth, subDays, isSameMonth, isValid } from 'date-fns'
import { de } from 'date-fns/locale'
import { useHolidays } from '../hooks/useHolidays'
import { validateShiftRules as importedValidateShiftRules } from '../utils/rosterRules'
import { calculateGenericBalance } from '../utils/balanceHelpers'
import { calculateWorkHours } from '../utils/timeCalculations'

const SickReportModal = ({ isOpen, onClose, onSubmit }) => {
    const [start, setStart] = useState('')
    const [end, setEnd] = useState('')

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl animate-in fade-in zoom-in duration-200">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-red-600">
                    <Thermometer /> Krankmeldung
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                    Wähle den Zeitraum deiner Krankheit. Deine Dienste werden automatisch freigegeben und als dringend markiert.
                </p>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Von</label>
                        <input type="date" value={start} onChange={e => setStart(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Bis (einschließlich)</label>
                        <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none" />
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button onClick={onClose} className="flex-1 py-2 bg-gray-100 rounded-lg font-medium hover:bg-gray-200">Abbrechen</button>
                        <button
                            onClick={() => onSubmit(start, end)}
                            disabled={!start || !end}
                            className="flex-1 py-2 bg-red-600 text-white rounded-lg font-bold disabled:opacity-50 hover:bg-red-700 shadow-lg shadow-red-200"
                        >
                            Melden
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

const MonthSettingsModal = ({ isOpen, onClose, year, month, isOpenStatus, isVisibleStatus, onUpdate }) => {
    const [localOpen, setLocalOpen] = useState(isOpenStatus)
    const [localVisible, setLocalVisible] = useState(isVisibleStatus)

    useEffect(() => {
        setLocalOpen(isOpenStatus)
        setLocalVisible(isVisibleStatus)
    }, [isOpenStatus, isVisibleStatus])

    if (!isOpen) return null

    const handleSave = () => {
        onUpdate(localOpen, localVisible)
        onClose()
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl animate-in fade-in zoom-in duration-200">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <Settings className="text-gray-400" /> Einstellungen für {month}/{year}
                </h3>

                <div className="space-y-6">
                    {/* Toggle Open/Closed - Whole row clickable */}
                    <div
                        className="flex justify-between items-center p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors select-none"
                        onClick={() => setLocalOpen(!localOpen)}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg transition-colors ${localOpen ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                {localOpen ? <Unlock size={20} /> : <Lock size={20} />}
                            </div>
                            <div>
                                <div className="font-bold text-sm">Eintragung {localOpen ? 'Erlaubt' : 'Gesperrt'}</div>
                                <div className="text-xs text-gray-500 mt-0.5 max-w-[180px]">
                                    {localOpen ? 'Mitarbeiter können sich eintragen.' : 'Keine Änderungen durch Mitarbeiter.'}
                                </div>
                            </div>
                        </div>
                        <div className={`w-12 h-7 rounded-full p-1 transition-colors ${localOpen ? 'bg-green-500' : 'bg-gray-300'}`}>
                            <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${localOpen ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                    </div>

                    {/* Toggle Visible/Hidden - Whole row clickable */}
                    <div
                        className="flex justify-between items-center p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors select-none"
                        onClick={() => setLocalVisible(!localVisible)}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg transition-colors ${localVisible ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'}`}>
                                {localVisible ? <Eye size={20} /> : <EyeOff size={20} />}
                            </div>
                            <div>
                                <div className="font-bold text-sm">Dienstplan {localVisible ? 'Sichtbar' : 'Versteckt'}</div>
                                <div className="text-xs text-gray-500 mt-0.5 max-w-[180px]">
                                    {localVisible ? 'Mitarbeiter sehen Dienste.' : 'Plan ist nur für Admins sichtbar.'}
                                </div>
                            </div>
                        </div>
                        <div className={`w-12 h-7 rounded-full p-1 transition-colors ${localVisible ? 'bg-blue-500' : 'bg-gray-300'}`}>
                            <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${localVisible ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 pt-6">
                    <button onClick={onClose} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors">Abbrechen</button>
                    <button onClick={handleSave} className="flex-1 py-3 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-colors shadow-lg">Speichern</button>
                </div>
            </div>
        </div>
    )
}

export default function RosterFeed() {
    const { user, isAdmin } = useAuth()
    const [shifts, setShifts] = useState([])
    const [allAbsences, setAllAbsences] = useState([])
    const [viewMode, setViewMode] = useState('cards') // 'cards' or 'table'
    const [currentDate, setCurrentDate] = useState(new Date())
    const [isMonthOpen, setIsMonthOpen] = useState(false)
    const [isMonthVisible, setIsMonthVisible] = useState(true)
    const [isSickModalOpen, setIsSickModalOpen] = useState(false)
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)

    // Swap & Log State
    const [isSwapModalOpen, setIsSwapModalOpen] = useState(false)
    const [targetSwapShift, setTargetSwapShift] = useState(null)
    const [isLogModalOpen, setIsLogModalOpen] = useState(false)
    const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', onConfirm: () => { } })
    const [alertConfig, setAlertConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' })

    const [myProfile, setMyProfile] = useState(null)
    const [allMyShifts, setAllMyShifts] = useState([])
    const [allMyAbsences, setAllMyAbsences] = useState([])
    const [allMyTimeEntries, setAllMyTimeEntries] = useState([])
    const [allMyCorrections, setAllMyCorrections] = useState([])

    // For Transparency View & Admin Assignment
    const [isBalanceExpanded, setIsBalanceExpanded] = useState(false)
    const [allProfiles, setAllProfiles] = useState([])
    const [allShiftsHistory, setAllShiftsHistory] = useState([])
    const [allAbsencesHistory, setAllAbsencesHistory] = useState([])
    const [allTimeEntriesHistory, setAllTimeEntriesHistory] = useState([])
    const [allCorrectionsHistory, setAllCorrectionsHistory] = useState([])

    const { getHoliday } = useHolidays()

    // 1. Daten Laden
    const fetchData = async () => {
        const monthStart = startOfMonth(currentDate)
        const monthEnd = endOfMonth(currentDate)
        const queryStart = subDays(monthStart, 1).toISOString()
        const queryEnd = monthEnd.toISOString()

        const { data: profile } = await supabase.from('profiles').select('weekly_hours, start_date, initial_balance').eq('id', user?.id).single()
        if (profile) setMyProfile(profile)

        const { data: allProfs } = await supabase.from('profiles').select('id, full_name, display_name, email, role, weekly_hours, start_date, vacation_days_per_year, initial_balance').or('is_active.eq.true,is_active.is.null').order('full_name')
        if (allProfs) setAllProfiles(allProfs)

        const { data: myInterests } = await supabase
            .from('shift_interests')
            .select('shift:shifts(id, start_time, end_time, assigned_to, type)')
            .eq('user_id', user?.id)

        // Also get shifts where user is directly assigned (not just interests)
        const { data: myDirectShifts } = await supabase
            .from('shifts')
            .select('id, start_time, end_time, assigned_to, type')
            .eq('assigned_to', user?.id)

        const shiftsFromInterests = myInterests?.map(i => i.shift).filter(s => s) || []
        const shiftsFromDirect = myDirectShifts || []

        // TEAM shifts are mandatory for all employees - fetch them too
        const { data: teamShifts } = await supabase
            .from('shifts')
            .select('id, start_time, end_time, type')
            .eq('type', 'TEAM')

        const myTeamShifts = teamShifts || []

        // Merge and deduplicate
        const allMyShiftsCombined = [...shiftsFromInterests]
        shiftsFromDirect.forEach(s => {
            const exists = allMyShiftsCombined.some(h => h.id === s.id)
            if (!exists) {
                allMyShiftsCombined.push(s)
            }
        })
        // Add Team shifts (they apply to all employees)
        myTeamShifts.forEach(s => {
            const exists = allMyShiftsCombined.some(h => h.id === s.id)
            if (!exists) {
                allMyShiftsCombined.push(s)
            }
        })
        setAllMyShifts(allMyShiftsCombined)

        const { data: myEntries } = await supabase.from('time_entries').select('*').eq('user_id', user?.id)
        if (myEntries) setAllMyTimeEntries(myEntries)

        const { data: myHistoryAbsences } = await supabase.from('absences').select('start_date, end_date, user_id, status, type, planned_hours').eq('user_id', user?.id).eq('status', 'genehmigt')
        if (myHistoryAbsences) setAllMyAbsences(myHistoryAbsences)

        const { data: myCorrs } = await supabase.from('balance_corrections').select('correction_hours, effective_month').eq('user_id', user?.id)
        if (myCorrs) setAllMyCorrections(myCorrs)

        const { data: shiftData } = await supabase
            .from('shifts')
            .select(`
                *, 
                interests:shift_interests(*, profiles(email, full_name, display_name)), 
                assigned_profile:profiles!shifts_assigned_to_fkey(email, full_name, display_name)
            `)
            .gte('start_time', queryStart)
            .lte('start_time', queryEnd)
            .order('start_time', { ascending: true })

        if (shiftData) setShifts(shiftData)

        const monthStartStr = format(monthStart, 'yyyy-MM-dd')
        const monthEndStr = format(monthEnd, 'yyyy-MM-dd')

        const { data: absData } = await supabase
            .from('absences')
            .select('*, profiles!user_id(email, full_name, display_name)')
            .eq('status', 'genehmigt')
            .lte('start_date', monthEndStr)
            .gte('end_date', monthStartStr)

        if (absData) setAllAbsences(absData)

        const year = getYear(currentDate)
        const month = getMonth(currentDate) + 1
        const { data: statusData } = await supabase
            .from('roster_months')
            .select('is_open, is_visible')
            .eq('year', year)
            .eq('month', month)
            .single()

        setIsMonthOpen(statusData ? statusData.is_open : false)
        if (statusData) {
            setIsMonthVisible(statusData.is_visible !== false)
        } else {
            setIsMonthVisible(false)
        }
    }

    useEffect(() => {
        if (!user) return
        fetchData()

        // Unique channel name per user session to avoid conflicts
        const channelName = `roster-updates-${user.id}-${Date.now()}`

        const channel = supabase
            .channel(channelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_interests' }, () => {
                fetchData()
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
                fetchData()
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'roster_months' }, () => fetchData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'absences' }, () => fetchData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries' }, () => fetchData())
            .subscribe()

        // Backup polling every 3 seconds (in case realtime fails on mobile)
        const pollInterval = setInterval(() => {
            fetchData()
        }, 3000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(pollInterval)
        }
    }, [currentDate, user])

    const shiftsByDate = useMemo(() => {
        const groups = {}
        shifts.forEach(shift => {
            if (!shift.start_time) return
            const dateStr = shift.start_time.split('T')[0]
            if (!groups[dateStr]) groups[dateStr] = []
            groups[dateStr].push(shift)
        })
        return groups
    }, [shifts])

    const visibleShiftsByDate = useMemo(() => {
        if (!isAdmin && isMonthVisible === false) return {}
        const filtered = {}
        Object.keys(shiftsByDate).forEach(date => {
            const d = new Date(date)
            if (isValid(d) && isSameMonth(d, currentDate)) {
                filtered[date] = shiftsByDate[date]
            }
        })
        return filtered
    }, [shiftsByDate, currentDate, isAdmin, isMonthVisible])

    if (!user) return <div className="p-4 text-center">Benutzer wird geladen...</div>

    const checkMyAbsence = (dateStr) => {
        return allAbsences.find(abs => {
            return abs.user_id === user.id &&
                dateStr >= abs.start_date &&
                dateStr <= abs.end_date
        })
    }

    const getAbsencesForDate = (dateStr) => {
        return allAbsences.filter(abs =>
            abs.status === 'genehmigt' &&
            dateStr >= abs.start_date && dateStr <= abs.end_date
        )
    }

    const validateShiftRules = (targetShift) => {
        return importedValidateShiftRules(targetShift, allAbsences, user, shifts)
    }

    const updateMonthSettings = async (newOpen, newVisible) => {
        const year = getYear(currentDate)
        const month = getMonth(currentDate) + 1

        const { error } = await supabase
            .from('roster_months')
            .upsert({
                year,
                month,
                is_open: newOpen,
                is_visible: newVisible
            }, { onConflict: 'year, month' })

        if (error) setAlertConfig({ isOpen: true, title: 'Fehler', message: error.message, type: 'error' })
        else fetchData()
    }

    const handleSwapRequest = async (shiftId, newUserId) => {
        const { error } = await supabase.rpc('perform_shift_swap', {
            p_shift_id: shiftId,
            p_new_user_id: newUserId
        })
        if (error) setAlertConfig({ isOpen: true, title: 'Fehler', message: error.message, type: 'error' })
        else {
            setAlertConfig({ isOpen: true, title: 'Erfolg', message: 'Dienst erfolgreich getauscht!', type: 'success' })
            fetchData()
        }
    }

    const toggleInterest = async (shiftId, currentlyInterested, targetUserId = null) => {
        const actingUserId = (isAdmin && targetUserId) ? targetUserId : user.id
        const shift = shifts.find(s => s.id === shiftId)

        if (!isMonthOpen && !isAdmin) {
            if (currentlyInterested && actingUserId === user.id) {
                setTargetSwapShift(shift)
                setIsSwapModalOpen(true)
                return
            }
            if (!currentlyInterested && actingUserId === user.id) {
                const isTaken = shift.assigned_to || (shift.interests && shift.interests.length > 0)
                if (isTaken) {
                    setAlertConfig({ isOpen: true, title: 'Gesperrt', message: 'Dieser Monat ist geschlossen. Dieser Dienst ist bereits besetzt.', type: 'info' })
                    return
                }
            } else {
                setAlertConfig({ isOpen: true, title: 'Gesperrt', message: 'Dieser Monat ist geschlossen.', type: 'info' })
                return
            }
        }

        if (!currentlyInterested && actingUserId === user.id) {
            const targetShift = shifts.find(s => s.id === shiftId)
            if (targetShift) {
                const errorMsg = validateShiftRules(targetShift)
                if (errorMsg) {
                    setAlertConfig({ isOpen: true, title: 'Regelverstoß', message: errorMsg, type: 'error' })
                    return
                }
            }
        }

        // OPTIMISTIC UI: Update local state immediately for instant feedback
        const optimisticUpdate = () => {
            setShifts(prevShifts => prevShifts.map(s => {
                if (s.id !== shiftId) return s

                let newInterests = [...(s.interests || [])]
                if (currentlyInterested) {
                    // Remove interest
                    newInterests = newInterests.filter(i => i.user_id !== actingUserId)
                } else {
                    // Add interest
                    newInterests.push({
                        user_id: actingUserId,
                        profiles: allProfiles.find(p => p.id === actingUserId)
                    })
                }
                return { ...s, interests: newInterests }
            }))
        }

        // Apply optimistic update immediately
        optimisticUpdate()

        // Now perform the actual database operation
        let error = null
        if (currentlyInterested) {
            const { error: delError } = await supabase.from('shift_interests').delete().match({ shift_id: shiftId, user_id: actingUserId })
            error = delError
        } else {
            const { error: insError } = await supabase.from('shift_interests').upsert(
                { shift_id: shiftId, user_id: actingUserId },
                { onConflict: 'shift_id, user_id', ignoreDuplicates: true }
            )
            error = insError
        }

        if (error) {
            console.error('Fehler beim Speichern:', error)
            setAlertConfig({ isOpen: true, title: 'Fehler', message: error.message, type: 'error' })
            // Revert optimistic update on error
            fetchData()
        } else {
            // Delayed refresh to update balance without blocking UI
            setTimeout(() => fetchData(), 500)
        }
    }

    const handleSickReport = async (startDate, endDate) => {
        setIsSickModalOpen(false)

        // 1. First, find all shifts the user is assigned to in this date range
        const startISO = new Date(startDate).toISOString()
        const endDateObj = new Date(endDate)
        endDateObj.setDate(endDateObj.getDate() + 1)
        const endISO = endDateObj.toISOString()

        const { data: shiftsInRange } = await supabase
            .from('shifts')
            .select('*, interests:shift_interests(*)')
            .gte('start_time', startISO)
            .lt('start_time', endISO)

        // 2. Calculate total planned hours for shifts the user was assigned to
        let totalPlannedHours = 0
        const myShifts = shiftsInRange?.filter(shift =>
            shift.assigned_to === user.id ||
            shift.interests?.some(i => i.user_id === user.id)
        ) || []

        myShifts.forEach(shift => {
            // Use the proper calculation function that handles ND readiness time
            const hours = calculateWorkHours(shift.start_time, shift.end_time, shift.type)
            totalPlannedHours += hours
        })

        // Round to 2 decimal places
        totalPlannedHours = Math.round(totalPlannedHours * 100) / 100

        // 3. Create absence record with planned_hours
        const { error: absError } = await supabase.from('absences').insert({
            user_id: user.id,
            start_date: startDate,
            end_date: endDate,
            type: 'Krank',
            status: 'genehmigt',
            planned_hours: totalPlannedHours > 0 ? totalPlannedHours : null
        })

        if (absError) {
            setAlertConfig({ isOpen: true, title: 'Fehler', message: absError.message, type: 'error' })
            return
        }

        // 4. Now remove user from shifts and mark as urgent via RPC (bypasses RLS)
        if (shiftsInRange) {
            const shiftIdsToMarkUrgent = []

            for (const shift of shiftsInRange) {
                const myInterest = shift.interests.find(i => i.user_id === user.id)
                if (myInterest || shift.assigned_to === user.id) {
                    // Delete interest first
                    if (myInterest) await supabase.from('shift_interests').delete().eq('id', myInterest.id)
                    shiftIdsToMarkUrgent.push(shift.id)
                }
            }

            // Use RPC to mark shifts as urgent (bypasses RLS)
            if (shiftIdsToMarkUrgent.length > 0) {
                const { error: rpcError } = await supabase.rpc('mark_shifts_urgent', {
                    p_shift_ids: shiftIdsToMarkUrgent,
                    p_user_id: user.id
                })
                if (rpcError) {
                    console.error('Error marking shifts urgent:', rpcError)
                }
            }
        }

        const hoursMsg = totalPlannedHours > 0
            ? ` (${totalPlannedHours}h geplante Arbeitszeit gespeichert)`
            : ''
        setAlertConfig({ isOpen: true, title: 'Gute Besserung', message: `Krankmeldung erfolgreich. Deine Dienste wurden freigegeben.${hoursMsg}`, type: 'success' })
        fetchData()
    }

    const toggleBalanceExpand = async () => {
        if (!isBalanceExpanded) {
            if (allShiftsHistory.length === 0) {
                try {
                    // 1. Get Shifts with Interests
                    const { data: interests, error: intError } = await supabase.from('shift_interests').select('user_id, shift:shifts(id, start_time, end_time, type)')
                    if (intError) throw new Error('Interests Error: ' + intError.message)

                    // 2. Get Shifts with Direct Assignments
                    // Fetch ALL and filter client-side to avoid UUID syntax errors with 'is null' filters
                    const { data: directAssignments, error: dirError } = await supabase.from('shifts').select('id, start_time, end_time, type, assigned_to')
                    if (dirError) throw new Error('Direct Error: ' + dirError.message)

                    const historyFromInterests = interests?.map(i => ({
                        user_id: i.user_id,
                        id: i.shift?.id,
                        start_time: i.shift?.start_time,
                        end_time: i.shift?.end_time,
                        type: i.shift?.type
                    })).filter(s => s.start_time) || []

                    const historyFromDirect = directAssignments?.filter(s => s.assigned_to).map(s => ({
                        user_id: s.assigned_to,
                        id: s.id,
                        start_time: s.start_time,
                        end_time: s.end_time,
                        type: s.type
                    })) || []

                    // Merge and deduplicate
                    const combinedHistory = [...historyFromInterests]
                    historyFromDirect.forEach(s => {
                        const exists = combinedHistory.some(h => h.id === s.id && h.user_id === s.user_id)
                        if (!exists) {
                            combinedHistory.push(s)
                        }
                    })

                    setAllShiftsHistory(combinedHistory)

                    // 3. Absences
                    const { data: absences, error: absError } = await supabase.from('absences').select('start_date, end_date, user_id, status, type, planned_hours').eq('status', 'genehmigt')
                    if (absError) throw new Error('Absences Error: ' + absError.message)
                    setAllAbsencesHistory(absences || [])

                    // 4. Entries
                    const { data: allEntries, error: entError } = await supabase.from('time_entries').select('user_id, shift_id, calculated_hours, status')
                    if (entError) throw new Error('Entries Error: ' + entError.message)
                    setAllTimeEntriesHistory(allEntries || [])

                    // 5. Corrections
                    const { data: allCorrs } = await supabase.from('balance_corrections').select('user_id, correction_hours, effective_month')
                    setAllCorrectionsHistory(allCorrs || [])

                } catch (err) {
                    console.error('Balance Load Error', err)
                    setAlertConfig({ isOpen: true, title: 'Ladefehler', message: err.message, type: 'error' })
                }
            }
        }
        setIsBalanceExpanded(!isBalanceExpanded)
    }

    let balance = null
    try {
        balance = calculateGenericBalance(myProfile, allMyShifts, allMyAbsences, allMyTimeEntries, currentDate, allMyCorrections)
    } catch (err) {
        console.error("Error calculating balance:", err)
    }

    return (
        <div className="pb-20">
            <div className="sticky top-0 bg-white z-10 border-b shadow-sm">
                <div className="p-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                            <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-1 hover:bg-white rounded-md transition-colors"><ChevronLeft size={20} /></button>
                            <span className="px-3 font-bold text-sm min-w-[100px] text-center capitalize">{format(currentDate, 'MMMM yyyy', { locale: de })}</span>
                            <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-1 hover:bg-white rounded-md transition-colors"><ChevronRight size={20} /></button>
                        </div>
                        <div className="flex bg-gray-100 rounded-lg p-1 hidden sm:flex">
                            <button onClick={() => setViewMode('cards')} className={`p-1.5 rounded-md transition-all ${viewMode === 'cards' ? 'bg-white shadow text-black' : 'text-gray-400'}`}><LayoutList size={16} /></button>
                            <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-white shadow text-black' : 'text-gray-400'}`}><TableIcon size={16} /></button>
                        </div>
                    </div>

                    <div className="flex gap-2 items-center">
                        {!isAdmin && (
                            <button
                                onClick={() => setIsSickModalOpen(true)}
                                className="p-2 bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition-colors border border-red-100"
                                title="Krankmelden"
                            >
                                <Thermometer size={20} />
                            </button>
                        )}

                        {!isAdmin && (
                            <div
                                className={`p-2 rounded-full border transition-colors ${isMonthOpen ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}
                                title={isMonthOpen ? "Dienstplan offen" : "Dienstplan geschlossen"}
                            >
                                {isMonthOpen ? <Unlock size={20} /> : <Lock size={20} />}
                            </div>
                        )}

                        {isAdmin && (
                            <>
                                {!isMonthOpen && (
                                    <button
                                        onClick={() => setIsLogModalOpen(true)}
                                        className="p-2 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors border border-gray-200"
                                        title="Änderungsprotokoll"
                                    >
                                        <FileText size={20} />
                                    </button>
                                )}
                                <button
                                    onClick={() => setIsSettingsModalOpen(true)}
                                    className={`p-2 rounded-full border transition-colors ${isMonthVisible && isMonthOpen
                                        ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'
                                        : isMonthVisible && !isMonthOpen
                                            ? 'bg-yellow-50 text-yellow-600 border-yellow-200 hover:bg-yellow-100'
                                            : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                                        }`}
                                    title={
                                        isMonthVisible && isMonthOpen
                                            ? "Freigegeben (Sichtbar & Offen)"
                                            : isMonthVisible && !isMonthOpen
                                                ? "Gesperrt (Sichtbar, nur Lesen)"
                                                : "Versteckt (Nicht sichtbar)"
                                    }
                                >
                                    <Settings size={20} />
                                </button>
                            </>
                        )}
                    </div>
                </div >

                <div className="sm:hidden px-4 pb-2 flex justify-center">
                    <div className="flex bg-gray-100 rounded-lg p-1 w-full max-w-[200px]">
                        <button onClick={() => setViewMode('cards')} className={`flex-1 p-1.5 rounded-md transition-all text-center text-xs font-bold ${viewMode === 'cards' ? 'bg-white shadow text-black' : 'text-gray-400'}`}>Karten</button>
                        <button onClick={() => setViewMode('table')} className={`flex-1 p-1.5 rounded-md transition-all text-center text-xs font-bold ${viewMode === 'table' ? 'bg-white shadow text-black' : 'text-gray-400'}`}>Tabelle</button>
                    </div>
                </div>

                {balance && viewMode === 'cards' && !isAdmin && (
                    <div className="px-4 pb-2 max-w-md mx-auto">
                        <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
                            <div className="flex justify-between items-center mb-2 cursor-pointer" onClick={toggleBalanceExpand}>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Mein Stundenkonto</h3>
                                    {isBalanceExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                                </div>
                                <span className="text-[10px] text-gray-400">{format(currentDate, 'MMMM', { locale: de })}</span>
                            </div>

                            <div className="grid grid-cols-4 gap-2 text-center">
                                <div className="bg-gray-50 rounded-lg p-1.5">
                                    <div className="text-[9px] text-gray-400 uppercase font-bold">Soll</div>
                                    <div className="font-bold text-sm text-gray-700">{balance.target}h</div>
                                </div>
                                <div className="bg-blue-50 rounded-lg p-1.5">
                                    <div className="text-[9px] text-blue-400 uppercase font-bold">Ist</div>
                                    <div className="font-bold text-sm text-blue-700">{balance.actual + balance.vacation}h</div>
                                </div>
                                <div className={`rounded-lg p-1.5 ${balance.carryover >= 0 ? 'bg-gray-50' : 'bg-red-50'}`}>
                                    <div className={`text-[9px] uppercase font-bold ${balance.carryover >= 0 ? 'text-gray-400' : 'text-red-600'}`}>Übertrag</div>
                                    <div className={`font-bold text-sm ${balance.carryover >= 0 ? 'text-gray-700' : 'text-red-700'}`}>
                                        {balance.carryover > 0 ? '+' : ''}{balance.carryover}h
                                    </div>
                                </div>
                                <div className={`rounded-lg p-1.5 ${balance.total >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                                    <div className={`text-[9px] uppercase font-bold ${balance.total >= 0 ? 'text-green-600' : 'text-red-600'}`}>Gesamt</div>
                                    <div className={`font-bold text-sm ${balance.total >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                        {balance.total > 0 ? '+' : ''}{balance.total}h
                                    </div>
                                </div>
                            </div>

                            {isBalanceExpanded && (
                                <div className="mt-4 pt-4 border-t border-gray-100">
                                    <h4 className="text-xs font-bold text-gray-500 mb-2 uppercase">Kollegen Übersicht</h4>
                                    <div className="space-y-2">
                                        {allProfiles.filter(p => p.id !== user.id && p.role !== 'admin').map(profile => {
                                            const userShifts = allShiftsHistory.filter(s => s.user_id === profile.id)
                                            const userAbsences = allAbsencesHistory.filter(a => a.user_id === profile.id)
                                            const userEntries = allTimeEntriesHistory.filter(e => e.user_id === profile.id)
                                            const userCorrections = allCorrectionsHistory.filter(c => c.user_id === profile.id)
                                            const b = calculateGenericBalance(profile, userShifts, userAbsences, userEntries, currentDate, userCorrections)

                                            if (!b) return null

                                            return (
                                                <div key={profile.id} className="flex justify-between items-center text-xs p-2 bg-gray-50 rounded-lg">
                                                    <span className="font-medium text-gray-700">{profile.display_name || profile.full_name || profile.email}</span>
                                                    <div className="flex gap-3">
                                                        <span className="text-gray-500">Soll: {b.target}h</span>
                                                        <span className={`font-bold ${b.total >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                            {b.total > 0 ? '+' : ''}{b.total}h
                                                        </span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className={viewMode === 'table' ? 'p-4' : 'p-4 max-w-md mx-auto'}>
                {!isAdmin && isMonthVisible === false ? (
                    <div className="text-center py-20 bg-gray-50 rounded-3xl border border-dashed border-gray-200 mt-4">
                        <Lock className="mx-auto text-gray-300 mb-4" size={48} />
                        <h3 className="text-lg font-bold text-gray-500">Dienstplan noch nicht veröffentlicht</h3>
                        <p className="text-sm text-gray-400 max-w-xs mx-auto mt-2">
                            Der Dienstplan für {format(currentDate, 'MMMM yyyy', { locale: de })} wird derzeit erstellt und ist noch nicht sichtbar.
                        </p>
                    </div>
                ) : (
                    <>
                        {viewMode === 'table' ? (
                            <MonthView
                                shiftsByDate={visibleShiftsByDate}
                                userId={user.id}
                                isAdmin={isAdmin}
                                onToggleInterest={toggleInterest}
                                getAbsencesForDate={getAbsencesForDate}
                            />
                        ) : (
                            <>
                                <MonthMinimap shifts={shifts} currentDate={currentDate} userId={user.id} />
                                {Object.keys(visibleShiftsByDate).length === 0 && (
                                    <div className="text-center mt-10">
                                        <p className="text-gray-400 mb-4">Keine Dienste für {format(currentDate, 'MMMM', { locale: de })} gefunden.</p>
                                    </div>
                                )}
                                {Object.keys(visibleShiftsByDate).sort().map(dateStr => {
                                    const myAbsence = checkMyAbsence(dateStr)
                                    const dayAbsences = getAbsencesForDate(dateStr)
                                    const holiday = getHoliday(new Date(dateStr))

                                    return (
                                        <DayCard
                                            key={dateStr}
                                            dateStr={dateStr}
                                            shifts={visibleShiftsByDate[dateStr]}
                                            userId={user.id}
                                            isAdmin={isAdmin}
                                            onToggleInterest={toggleInterest}
                                            onUpdateShift={async (shiftId, newStart, newEnd, newTitle) => {
                                                if (!isAdmin) return

                                                const updatePayload = {
                                                    start_time: newStart,
                                                    end_time: newEnd
                                                }
                                                if (newTitle !== undefined) {
                                                    updatePayload.title = newTitle
                                                }

                                                const { error } = await supabase.from('shifts').update(updatePayload).eq('id', shiftId)

                                                if (error) {
                                                    setAlertConfig({ isOpen: true, title: 'Fehler', message: error.message, type: 'error' })
                                                } else {
                                                    setAlertConfig({ isOpen: true, title: 'Erfolg', message: 'Dienst aktualisiert', type: 'success' })
                                                    fetchData()
                                                }
                                            }}
                                            onDeleteShift={async (shiftId) => {
                                                if (!isAdmin) return
                                                if (!window.confirm("Möchtest du diesen Dienst wirklich löschen?")) return
                                                await supabase.from('shift_interests').delete().eq('shift_id', shiftId)
                                                const { error } = await supabase.from('shifts').delete().eq('id', shiftId).select()
                                                if (error) {
                                                    setAlertConfig({ isOpen: true, title: 'Fehler', message: error.message, type: 'error' })
                                                } else {
                                                    setAlertConfig({ isOpen: true, title: 'Erfolg', message: 'Dienst gelöscht', type: 'success' })
                                                    fetchData()
                                                }
                                            }}
                                            onCreateShift={async (dateStr, type) => {
                                                if (!isAdmin) return

                                                let start = '07:30'
                                                let end = '16:00'
                                                let endDateStr = dateStr

                                                if (type === 'TD1') { start = '07:30'; end = '16:00'; }
                                                if (type === 'TD2') { start = '12:00'; end = '20:30'; }
                                                if (type === 'ND') { start = '20:15'; end = '07:15'; }
                                                if (type === 'DBD') { start = '08:00'; end = '16:00'; }
                                                if (type === 'TEAM') { start = '09:30'; end = '11:30'; }
                                                if (type === 'FORTBILDUNG') { start = '09:00'; end = '17:00'; }

                                                if (end < start) {
                                                    const d = new Date(dateStr)
                                                    d.setDate(d.getDate() + 1)
                                                    endDateStr = d.toISOString().split('T')[0]
                                                }

                                                const { error } = await supabase.from('shifts').insert({
                                                    start_time: `${dateStr}T${start}:00`,
                                                    end_time: `${endDateStr}T${end}:00`,
                                                    type: type
                                                })

                                                if (error) {
                                                    setAlertConfig({ isOpen: true, title: 'Fehler', message: error.message, type: 'error' })
                                                } else {
                                                    setAlertConfig({ isOpen: true, title: 'Erfolg', message: 'Dienst erstellt', type: 'success' })
                                                    fetchData()
                                                }
                                            }}
                                            absenceReason={myAbsence}
                                            absences={dayAbsences}
                                            holiday={holiday}
                                            allProfiles={allProfiles}
                                        />
                                    )
                                })}
                            </>
                        )}
                        {shifts.length === 0 && Object.keys(visibleShiftsByDate).length === 0 && (
                            <div className="text-center mt-20">
                                {/* Empty state already handled above mostly, but redundant check ok */}
                            </div>
                        )}
                    </>
                )}
            </div>

            <MonthSettingsModal
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
                year={getYear(currentDate)}
                month={getMonth(currentDate) + 1}
                isOpenStatus={isMonthOpen}
                isVisibleStatus={isMonthVisible}
                onUpdate={updateMonthSettings}
            />

            <SickReportModal
                isOpen={isSickModalOpen}
                onClose={() => setIsSickModalOpen(false)}
                onSubmit={handleSickReport}
            />

            <SwapShiftModal
                isOpen={isSwapModalOpen}
                onClose={() => setIsSwapModalOpen(false)}
                shift={targetSwapShift}
                onSwap={handleSwapRequest}
                currentUser={user}
            />

            <RosterLogModal
                isOpen={isLogModalOpen}
                onClose={() => setIsLogModalOpen(false)}
            />
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
        </div>
    )
}
