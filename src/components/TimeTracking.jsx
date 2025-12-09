import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import { format, parseISO, startOfMonth, endOfMonth, addDays, subDays, eachDayOfInterval, areIntervalsOverlapping } from 'date-fns'
import { de } from 'date-fns/locale'
import { CheckCircle, Save, Calendar, Download, Sun, Thermometer, ChevronRight, ChevronLeft, Users, XCircle } from 'lucide-react'
import { calculateWorkHours, calculateDailyAbsenceHours } from '../utils/timeCalculations'
import { generateTimeReportPDF } from '../utils/pdfGenerator'
import { generateReportHash } from '../utils/security'
import { getHolidays, isHoliday } from '../utils/holidays'
import { getYear, isWeekend } from 'date-fns'

export default function TimeTracking() {
    const { user } = useAuth()
    const [items, setItems] = useState([]) // Combined Shifts + Absence Days
    const [entries, setEntries] = useState({}) // Stores time_entries by key
    const [plannedShifts, setPlannedShifts] = useState([]) // Store all planned shifts for absence calculation
    const [loading, setLoading] = useState(true)
    const [editingItem, setEditingItem] = useState(null)
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'))
    const [userProfile, setUserProfile] = useState(null) // NEW: Store user profile

    // Report State
    const [monthStatus, setMonthStatus] = useState(null)
    const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false)
    const [password, setPassword] = useState('')
    const [submitError, setSubmitError] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Form State
    const [formData, setFormData] = useState({
        actualStart: '',
        actualEnd: '',
        interruptions: [],
        newIntStart: '',
        newIntEnd: ''
    })
    const [calculatedHours, setCalculatedHours] = useState(0)

    useEffect(() => {
        if (user && selectedMonth) fetchData()
    }, [user, selectedMonth])

    const fetchData = async () => {
        setLoading(true)
        const start = startOfMonth(new Date(selectedMonth))
        const end = endOfMonth(new Date(selectedMonth))
        const [year, month] = selectedMonth.split('-').map(Number)

        // Load user profile for default hours calculation
        if (!userProfile) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('weekly_hours')
                .eq('id', user.id)
                .single()
            if (profile) setUserProfile(profile)
        }

        // 0. Get Month Status
        const { data: report } = await supabase
            .from('monthly_reports')
            .select('*')
            .eq('user_id', user.id)
            .eq('year', year)
            .eq('month', month)
            .maybeSingle()

        setMonthStatus(report || null)

        // 1. Get Personal Shifts via Interests
        // In this workflow, shifts are confirmed when only ONE person remains interested
        // We fetch all shifts where the user has an interest
        const startIso = start.toISOString()
        const endIso = end.toISOString()

        // First, get all shifts where the user has an interest
        // Fetch without date filter on joins, filter locally instead
        const { data: myInterests } = await supabase
            .from('shift_interests')
            .select('shift_id, shifts(*)')
            .eq('user_id', user.id)

        // Filter to shifts within the selected month
        const monthInterests = myInterests?.filter(i => {
            if (!i.shifts?.start_time) return false
            const shiftDate = new Date(i.shifts.start_time)
            return shiftDate >= start && shiftDate <= end
        }) || []

        // Get all shifts with their interest counts to filter
        const shiftIds = monthInterests.map(i => i.shift_id)

        let confirmedShifts = []

        if (shiftIds.length > 0) {
            // Get interest counts for these shifts
            const { data: allInterests } = await supabase
                .from('shift_interests')
                .select('shift_id')
                .in('shift_id', shiftIds)

            // Count interests per shift
            const interestCounts = {}
            allInterests?.forEach(i => {
                interestCounts[i.shift_id] = (interestCounts[i.shift_id] || 0) + 1
            })

            // Filter to only shifts where user is the ONLY interested person (confirmed)
            confirmedShifts = monthInterests
                .filter(i => interestCounts[i.shift_id] === 1)
                .map(i => i.shifts)
                .filter(s => s)
        }

        // Also get shifts directly assigned (for backwards compatibility)
        const { data: assignments } = await supabase
            .from('shifts')
            .select('*')
            .eq('assigned_to', user.id)
            .gte('start_time', startIso)
            .lte('start_time', endIso)

        // Merge both sources, avoiding duplicates
        const allPersonalShifts = [...confirmedShifts]
        assignments?.forEach(a => {
            if (!allPersonalShifts.some(s => s.id === a.id)) {
                allPersonalShifts.push(a)
            }
        })

        const shiftItems = allPersonalShifts.map(s => ({
            ...s,
            itemType: 'shift',
            sortDate: new Date(s.start_time)
        }))

        // Store planned shifts for absence calculation - MERGED LATER after Team Shifts

        // 1.1 Get TEAM Shifts
        // Shifts marked as 'TEAM' are mandatory for everyone and don't require individual assignment.
        const { data: teamShifts } = await supabase
            .from('shifts')
            .select('*')
            .eq('type', 'TEAM')
            .gte('start_time', startIso)
            .lte('start_time', endIso)

        // Store ALL planned shifts (Personal + Team) for absence calculation
        const allPlannedRaw = [...allPersonalShifts, ...(teamShifts || [])]
        setPlannedShifts(allPlannedRaw)

        // 2. Get Absences (Approved only)
        // Use YYYY-MM-DD string format
        const startStr = format(start, 'yyyy-MM-dd')
        const endStr = format(end, 'yyyy-MM-dd')

        const { data: absences } = await supabase
            .from('absences')
            .select('start_date, end_date, user_id, status, type, planned_hours, id')
            .eq('user_id', user.id)
            .eq('status', 'genehmigt')
            .lte('start_date', endStr)
            .gte('end_date', startStr)

        const absenceItems = []
        if (absences) {
            absences.forEach(abs => {
                const rangeStart = new Date(abs.start_date) < start ? start : new Date(abs.start_date)
                const rangeEnd = new Date(abs.end_date) > end ? end : new Date(abs.end_date)

                if (rangeStart <= rangeEnd) {
                    const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd })
                    days.forEach(day => {
                        const dateKey = format(day, 'yyyy-MM-dd')

                        // SINGLE SOURCE OF TRUTH INTEGRATION
                        // Calculate hours first to determine if this absence is relevant (hours > 0)
                        const hours = calculateDailyAbsenceHours(day, abs, allPlannedRaw, userProfile)

                        if (hours > 0) {
                            absenceItems.push({
                                id: `abs-${abs.id}-${format(day, 'yyyy-MM-dd')}`,
                                absence_id: abs.id,
                                date: format(day, 'yyyy-MM-dd'),
                                type: abs.type,
                                reason: abs.reason,
                                note: abs.note,
                                planned_hours: hours, // Now using calculated hours from SSOT
                                itemType: 'absence',
                                sortDate: day
                            })
                        }
                    })
                }
            })
        }

        // 3. Merge & Sort
        // Prioritize Absences: Filter out shifts that fall on an approved absence day
        const absenceDates = new Set(absenceItems.map(a => a.date))

        const filteredShiftItems = shiftItems.filter(s => {
            const shiftDate = format(new Date(s.start_time), 'yyyy-MM-dd')
            return !absenceDates.has(shiftDate)
        })

        // Process Team Shifts
        const teamItems = teamShifts?.map(s => {
            // Collision Check
            const sStart = new Date(s.start_time)
            const sEnd = new Date(s.end_time)

            // Find overlapping personal shift
            const collision = shiftItems.find(personalShift => {
                const pStart = new Date(personalShift.start_time)
                const pEnd = new Date(personalShift.end_time)
                return areIntervalsOverlapping({ start: sStart, end: sEnd }, { start: pStart, end: pEnd })
            })

            return {
                ...s,
                itemType: 'shift',
                sortDate: new Date(s.start_time),
                isTeam: true,
                isColliding: !!collision
            }
        }).filter(s => {
            const shiftDate = format(new Date(s.start_time), 'yyyy-MM-dd')
            return !absenceDates.has(shiftDate) // Hide if absent
        }) || []

        const allItems = [...filteredShiftItems, ...teamItems, ...absenceItems].sort((a, b) => a.sortDate - b.sortDate)
        setItems(allItems)

        // 4. Get Actual Time Entries (Optimized with Date Range)
        // We fetch entries slightly outside the month (buffer) to handle edge cases (night shifts spanning months).
        // Strategy: We fetch ALL entries for the period and map them to the items in memory.
        const bufferStart = subDays(start, 7).toISOString()
        const bufferEnd = addDays(end, 7).toISOString()
        const bufferStartDate = format(subDays(start, 7), 'yyyy-MM-dd')
        const bufferEndDate = format(addDays(end, 7), 'yyyy-MM-dd')

        // Parallel query for performance: 
        // A) Entries linked to shifts (filter by actual_start)
        // B) Entries linked to absences (filter by entry_date)
        const [shiftEntriesRes, absenceEntriesRes] = await Promise.all([
            supabase
                .from('time_entries')
                .select('*')
                .eq('user_id', user.id)
                .gte('actual_start', bufferStart)
                .lte('actual_start', bufferEnd),
            supabase
                .from('time_entries')
                .select('*')
                .eq('user_id', user.id)
                .gte('entry_date', bufferStartDate)
                .lte('entry_date', bufferEndDate)
        ])

        const allTimeEntries = [
            ...(shiftEntriesRes.data || []),
            ...(absenceEntriesRes.data || [])
        ]

        // 5. Map entries to items (filter in JS)
        const entriesMap = {}

        if (allTimeEntries) {
            // Add shift entries
            shiftItems.forEach(shift => {
                const entry = allTimeEntries.find(e => e.shift_id === shift.id)
                if (entry) entriesMap[shift.id] = entry
            })

            // Also map TEAM shifts
            teamShifts?.forEach(shift => {
                const entry = allTimeEntries.find(e => e.shift_id === shift.id)
                if (entry) entriesMap[shift.id] = entry
            })

            // Add absence entries (filter by absence_id AND entry_date)
            absenceItems.forEach(absItem => {
                const entry = allTimeEntries.find(e =>
                    e.absence_id === absItem.absence_id &&
                    e.entry_date === absItem.date
                )
                if (entry) entriesMap[absItem.id] = entry
            })
        }

        setEntries(entriesMap)
        setLoading(false)
    }

    // Init Modal
    useEffect(() => {
        if (editingItem) {
            const entry = entries[editingItem.id]

            if (entry) {
                setFormData({
                    actualStart: format(parseISO(entry.actual_start), 'HH:mm'),
                    actualEnd: format(parseISO(entry.actual_end), 'HH:mm'),
                    interruptions: entry.interruptions || []
                })
            } else {
                if (editingItem.itemType === 'shift') {
                    setFormData({
                        actualStart: format(parseISO(editingItem.start_time), 'HH:mm'),
                        actualEnd: format(parseISO(editingItem.end_time), 'HH:mm'),
                        interruptions: []
                    })
                } else {
                    // Absence Default: Use weekly_hours / 5 for daily hours
                    const weeklyHours = Number(userProfile?.weekly_hours) || 40
                    const dailyHours = weeklyHours / 5
                    const endHour = 8 + Math.floor(dailyHours)
                    const endMinute = Math.round((dailyHours % 1) * 60)

                    setFormData({
                        actualStart: '08:00',
                        actualEnd: `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`,
                        interruptions: []
                    })
                }
            }
        }
    }, [editingItem, entries, userProfile])

    // Live Calc
    useEffect(() => {
        if (editingItem && formData.actualStart && formData.actualEnd) {
            let startIso, endIso
            if (editingItem.itemType === 'shift') {
                startIso = constructIso(editingItem.start_time, formData.actualStart)
                endIso = constructIso(editingItem.end_time, formData.actualEnd, true)
            } else {
                const baseDate = editingItem.sortDate.toISOString()
                startIso = constructIso(baseDate, formData.actualStart)
                endIso = constructIso(baseDate, formData.actualEnd)
            }

            const processedInterruptions = formData.interruptions.map(int => ({
                start: constructInterruptionIso(editingItem.itemType === 'shift' ? editingItem.start_time : editingItem.sortDate.toISOString(), int.start),
                end: constructInterruptionIso(editingItem.itemType === 'shift' ? editingItem.start_time : editingItem.sortDate.toISOString(), int.end)
            }))

            if (editingItem.isTeam && editingItem.isColliding) {
                setCalculatedHours(0)
            } else {
                const type = editingItem.itemType === 'shift' ? editingItem.type : 'T'
                setCalculatedHours(calculateWorkHours(startIso, endIso, type, processedInterruptions))
            }
        }
    }, [formData, editingItem])


    const constructIso = (referenceIso, timeStr, isEnd = false) => {
        if (!referenceIso || !timeStr) return null
        try {
            const [hours, minutes] = timeStr.split(':').map(Number)
            const date = parseISO(referenceIso)
            const newDate = new Date(date)
            newDate.setHours(hours, minutes, 0, 0)
            return newDate.toISOString()
        } catch (e) { return null }
    }
    const constructInterruptionIso = (shiftStartIso, timeStr) => {
        try {
            const [hours, minutes] = timeStr.split(':').map(Number)
            const startDate = parseISO(shiftStartIso)
            let targetDate = new Date(startDate)
            if (hours < 12 && startDate.getHours() >= 12) targetDate = addDays(targetDate, 1)
            targetDate.setHours(hours, minutes, 0, 0)
            return targetDate.toISOString()
        } catch (e) { return null }
    }

    const handleSave = async () => {
        if (!editingItem) return

        let startIso, endIso
        if (editingItem.itemType === 'shift') {
            startIso = constructIso(editingItem.start_time, formData.actualStart)
            endIso = constructIso(editingItem.end_time, formData.actualEnd)
        } else {
            const baseDate = editingItem.sortDate.toISOString()
            startIso = constructIso(baseDate, formData.actualStart)
            endIso = constructIso(baseDate, formData.actualEnd)
        }

        const finalInterruptions = formData.interruptions.map(int => ({
            start: constructInterruptionIso(editingItem.itemType === 'shift' ? editingItem.start_time : editingItem.sortDate.toISOString(), int.start),
            end: constructInterruptionIso(editingItem.itemType === 'shift' ? editingItem.start_time : editingItem.sortDate.toISOString(), int.end),
            note: int.note
        }))

        // Allow save even if colliding (0 hours)
        const payload = {
            user_id: user.id,
            actual_start: startIso,
            actual_end: endIso,
            interruptions: finalInterruptions,
            calculated_hours: calculatedHours,
            status: 'submitted',
            original_data: { start: startIso, end: endIso, interruptions: finalInterruptions }
        }

        let query = supabase.from('time_entries')

        if (editingItem.itemType === 'shift') {
            payload.shift_id = editingItem.id

            // Check Live DB state to avoid duplicates if onConflict fails
            const { data: existingEntry } = await supabase
                .from('time_entries')
                .select('id')
                .eq('user_id', user.id)
                .eq('shift_id', editingItem.id)
                .maybeSingle()

            if (existingEntry) {
                query = query.update(payload).eq('id', existingEntry.id)
            } else {
                query = query.insert(payload)
            }
        } else {
            payload.absence_id = editingItem.absence_id
            payload.entry_date = editingItem.date
            if (entries[editingItem.id]) {
                query = query.update(payload).eq('id', entries[editingItem.id].id)
            } else {
                query = query.insert(payload)
            }
        }

        const { data, error } = await query.select()

        if (error) {
            alert('Fehler: ' + error.message)
        } else {
            // OPTIMISTIC UPDATE: Update local state immediately
            const newEntry = data?.[0]
            if (newEntry) {
                setEntries(prevEntries => ({
                    ...prevEntries,
                    [editingItem.id]: newEntry
                }))
            }
            setEditingItem(null)
            // No fetchData() - keeps scroll position and feels instant!
        }
    }

    const handleSubmitMonth = async () => {
        setSubmitError('')
        setIsSubmitting(true)
        const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password: password })
        if (authError) { setSubmitError('Falsches Passwort.'); setIsSubmitting(false); return }

        // Prepare Hash
        const start = startOfMonth(new Date(selectedMonth))
        const end = endOfMonth(new Date(selectedMonth))

        // 1. Reconstruct the COMPLETE list of entries (Real DB Entries + Virtual Absences)
        const comprehensiveEntries = items.map(item => {
            // Case A: Real DB Entry exists
            if (entries[item.id]) {
                const type = item.type || (item.itemType === 'absence' ? 'Urlaub' : 'Schicht')
                return { ...entries[item.id], shifts: { type } }
            }

            // Case B: Virtual Absence (approved but not in time_entries)
            // Case B: Virtual Absence (approved but not in time_entries)
            if (item.itemType === 'absence') {
                // Use stored planned_hours which already come from SSOT during fetch
                // OR recalculate to be double safe (we choose recalculate for hash consistency)
                const d = new Date(item.date)
                const calculatedHoursForEntry = calculateDailyAbsenceHours(d, { type: item.type, reason: item.reason }, plannedShifts, userProfile)

                return {
                    id: item.id,
                    user_id: user.id,
                    entry_date: item.date,
                    actual_start: null,
                    actual_end: null,
                    calculated_hours: calculatedHoursForEntry,
                    absence_id: item.absence_id,
                    shifts: { type: item.type || 'Abwesend' }
                }
            }
            return null
        }).filter(Boolean)

        const hash = await generateReportHash(comprehensiveEntries, user.id, selectedMonth)

        const [year, month] = selectedMonth.split('-').map(Number)
        const { error } = await supabase.from('monthly_reports').insert({
            user_id: user.id,
            data_hash: hash,
            hash_version: 'v1',  // Track which hash algorithm was used
            original_data_snapshot: comprehensiveEntries,
            year,
            month,
            status: 'eingereicht',
            submitted_at: new Date().toISOString()
        })
        if (error) setSubmitError(error.message); else { setIsSubmitModalOpen(false); setPassword(''); fetchData() }
        setIsSubmitting(false)
    }

    const handleDownloadPDF = () => {
        const entriesList = items.map(item => {
            const entry = entries[item.id]
            if (!entry) return null
            return { ...entry, shifts: item.itemType === 'shift' ? item : { start_time: item.sortDate.toISOString(), type: item.type || 'Urlaub' } }
        }).filter(Boolean)
        generateTimeReportPDF(selectedMonth, user, entriesList, monthStatus)
    }

    const isLocked = monthStatus && (monthStatus.status === 'eingereicht' || monthStatus.status === 'genehmigt')
    const allItemsDone = items.length > 0 && items.every(i => {
        if (i.itemType === 'absence') return true
        if (entries[i.id]) return true
        if (i.isTeam && i.isColliding) return true
        return false
    })

    return (
        <div className="p-4 pb-24 max-w-xl mx-auto">
            <h1 className="text-2xl font-bold mb-2 px-2">Zeiterfassung</h1>

            {/* Status Card */}
            {monthStatus && (
                <div className={`mb-6 p-4 rounded-xl border flex flex-col gap-3 ${monthStatus.status === 'genehmigt' ? 'bg-green-50 border-green-200 text-green-900' :
                    monthStatus.status === 'eingereicht' ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-gray-50 border-gray-200'
                    }`}>
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-full ${monthStatus.status === 'genehmigt' ? 'bg-green-100' : monthStatus.status === 'eingereicht' ? 'bg-blue-100 text-blue-600' : 'bg-white'}`}>
                            {monthStatus.status === 'genehmigt' ? <CheckCircle size={24} /> : <Save size={24} />}
                        </div>
                        <div>
                            <div className="font-bold text-lg capitalize">{monthStatus.status}</div>
                            <div className="text-sm opacity-80">
                                {monthStatus.status === 'eingereicht' ? 'Wartet auf Admin-Freigabe.' : monthStatus.status === 'genehmigt' ? 'Abgeschlossen.' : 'In Bearbeitung'}
                            </div>
                        </div>
                    </div>
                    {monthStatus.status === 'genehmigt' && (
                        <button onClick={handleDownloadPDF} className="w-full bg-white border border-green-200 text-green-800 py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-green-100">
                            <Download size={18} /> Arbeitsnachweis herunterladen (PDF)
                        </button>
                    )}
                </div>
            )}

            <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 mb-6">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2 text-center">Monat</label>
                <div className="flex items-center justify-between bg-gray-50 rounded-xl p-1.5 border border-gray-200">
                    <button
                        onClick={() => {
                            const current = new Date(selectedMonth + '-01')
                            const prev = new Date(current.setMonth(current.getMonth() - 1))
                            setSelectedMonth(format(prev, 'yyyy-MM'))
                        }}
                        className="p-3 hover:bg-white hover:shadow-md hover:text-black rounded-lg text-gray-500 transition-all active:scale-95 flex-1 flex justify-center"
                    >
                        <ChevronLeft size={20} strokeWidth={2.5} />
                    </button>

                    <span className="font-black text-gray-800 text-lg px-2 capitalize tracking-wide select-none flex-[2] text-center">
                        {format(new Date(selectedMonth + '-01'), 'MMMM yyyy', { locale: de })}
                    </span>

                    <button
                        onClick={() => {
                            const current = new Date(selectedMonth + '-01')
                            const next = new Date(current.setMonth(current.getMonth() + 1))
                            setSelectedMonth(format(next, 'yyyy-MM'))
                        }}
                        className="p-3 hover:bg-white hover:shadow-md hover:text-black rounded-lg text-gray-500 transition-all active:scale-95 flex-1 flex justify-center"
                    >
                        <ChevronRight size={20} strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            {loading ? <div className="text-center py-10 text-gray-400">Lade...</div> : (
                <div className="space-y-3 pb-24">
                    {items.map(item => {
                        const entry = entries[item.id]
                        const isDone = entry?.status === 'approved'
                        const isSubmitted = !!entry
                        const isAbsence = item.itemType === 'absence'
                        // Safe check for shift date vs today
                        const itemDate = isAbsence ? item.sortDate : new Date(item.start_time)

                        // Icon Logic
                        const isSick = isAbsence && item.type && item.type.toLowerCase().includes('krank')
                        const isTeam = item.isTeam

                        // Display Type Logic
                        let displayType = item.type
                        if (isTeam) displayType = "Teamsitzung"

                        return (
                            <div key={item.id} className={`p-4 rounded-xl border shadow-sm transition-all ${isDone ? 'bg-gray-100' : 'bg-white border-gray-200'}`}>
                                <div className="flex justify-between items-center mb-2">
                                    <div>
                                        <div className="font-bold text-lg flex items-center gap-2">
                                            {format(itemDate, 'EEEE, dd.MM.', { locale: de })}
                                            {isAbsence ? (
                                                isSick ? <Thermometer size={16} className="text-red-500" /> : <Sun size={16} className="text-orange-500" />
                                            ) : isTeam ? (
                                                <Users size={16} className="text-purple-500" />
                                            ) : null}
                                        </div>
                                        <div className="text-sm text-gray-500 flex items-center gap-2">
                                            {isAbsence ? (
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${isSick ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`}>
                                                    {item.type || 'Urlaub'}
                                                </span>
                                            ) : (
                                                <>
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${isTeam ? 'bg-purple-100 text-purple-700' : 'bg-gray-100'}`}>
                                                        {displayType}
                                                    </span>
                                                    {format(parseISO(item.start_time), 'HH:mm')} - {format(parseISO(item.end_time), 'HH:mm')}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    {isAbsence ? (
                                        <div className="px-2 py-1 rounded text-xs font-bold uppercase bg-green-100 text-green-700">
                                            Genehmigt
                                        </div>
                                    ) : entry ? (
                                        <div className="flex items-center gap-1">
                                            <div className={`px-2 py-1 rounded text-xs font-bold uppercase ${isDone ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {isDone ? 'Genehmigt' : 'Erfasst'}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="px-2 py-1 rounded text-xs font-bold uppercase bg-gray-100 text-gray-500">Offen</div>
                                    )}
                                </div>
                                {(() => {
                                    // Helper to determine what to show
                                    let showDetails = false
                                    let displayStart = ''
                                    let displayEnd = ''
                                    let displayHours = ''

                                    // Special case: Colliding Team Shift without entry -> Show 0 hours
                                    if (item.isTeam && item.isColliding && !entry) {
                                        showDetails = true
                                        displayStart = format(parseISO(item.start_time), 'HH:mm')
                                        displayEnd = format(parseISO(item.end_time), 'HH:mm')
                                        displayHours = "0.00 (Inkludiert)"
                                    } else if (entry) {
                                        showDetails = true
                                        displayStart = format(parseISO(entry.actual_start), 'HH:mm')
                                        displayEnd = format(parseISO(entry.actual_end), 'HH:mm')
                                        displayHours = Number(entry.calculated_hours).toFixed(2)
                                        if (Number(entry.calculated_hours) === 0 && item.isTeam && item.isColliding) {
                                            displayHours = "0.00 (Inkludiert)"
                                        }
                                    } else if (isAbsence) {
                                        showDetails = true
                                        const weeklyHours = Number(userProfile?.weekly_hours) || 40
                                        const dailyHours = weeklyHours / 5

                                        const d = item.sortDate
                                        const dateKey = format(d, 'yyyy-MM-dd')
                                        const isSick = item.reason === 'sick' || (item.type && item.type.toLowerCase().includes('krank'))

                                        if (isSick) {
                                            // SICK: Use pre-calculated SSOT hours
                                            let sickHours = item.planned_hours || 0

                                            // Set display values
                                            if (!displayStart) {
                                                const endHour = 8 + Math.floor(sickHours)
                                                const endMinute = Math.round((sickHours % 1) * 60)
                                                displayStart = '08:00'
                                                displayEnd = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`
                                            }
                                            displayHours = sickHours.toFixed(2)
                                        } else {
                                            // VACATION: Use standard hours (08:00 - X)
                                            const endHour = 8 + Math.floor(dailyHours)
                                            const endMinute = Math.round((dailyHours % 1) * 60)

                                            displayStart = '08:00'
                                            displayEnd = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`
                                            displayHours = dailyHours.toFixed(2)
                                        }
                                    }

                                    if (!showDetails) return null

                                    return (
                                        <div className="mb-3 p-2 bg-gray-50 rounded-lg text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Erfasst:</span>
                                                <span className="font-mono font-bold">
                                                    {displayStart} - {displayEnd}
                                                </span>
                                            </div>
                                            <div className="flex justify-between mt-1">
                                                <span className="text-gray-600">Stunden:</span>
                                                <span className="font-mono font-bold text-blue-600">{isNaN(displayHours) ? displayHours : `${displayHours}h`}</span>
                                            </div>
                                        </div>
                                    )
                                })()}
                                {!isLocked && !isAbsence && (
                                    <button onClick={() => setEditingItem(item)} className={`w-full py-3 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${isDone ? 'bg-gray-800 text-white hover:bg-black' : entry ? 'bg-gray-800 text-white hover:bg-black' : 'bg-[#00c2cb] text-white hover:bg-[#00b3bb] shadow-lg'}`}>
                                        {isDone ? 'Bearbeiten' : <>{entry ? 'Bearbeiten' : 'Zeit Bestätigen'} <ChevronRight size={16} /></>}
                                    </button>
                                )}
                            </div>
                        )
                    })}
                    {items.length === 0 && <div className="text-center py-10 text-gray-400">Keine Einträge für diesen Monat.</div>}
                </div>
            )}

            {!loading && !isLocked && items.length > 0 && (
                <div className="fixed bottom-20 left-0 right-0 p-4 flex justify-center pointer-events-none z-[80]">
                    <button
                        disabled={!allItemsDone}
                        onClick={() => setIsSubmitModalOpen(true)}
                        className={`pointer-events-auto shadow-2xl px-8 py-4 rounded-2xl font-bold text-lg flex items-center gap-3 transition-all transform active:scale-95 ${allItemsDone ? 'bg-black text-white hover:bg-gray-900 border-2 border-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                    >
                        <Save size={20} /> {allItemsDone ? 'Monat abschließen & Signieren' : 'Erst alle Tage erfassen'}
                    </button>
                </div>
            )}

            {isSubmitModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
                        <h3 className="text-xl font-bold mb-4">Monat abschließen?</h3>
                        <p className="text-gray-500 mb-6 text-sm">Bestätige die Richtigkeit deiner Angaben.</p>
                        <div className="mb-4">
                            <label className="block text-sm font-bold mb-1">Passwort</label>
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full border-2 border-gray-200 p-3 rounded-xl" placeholder="Login Passwort" />
                            {submitError && <p className="text-red-500 text-xs mt-2 font-bold">{submitError}</p>}
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setIsSubmitModalOpen(false)} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold">Abbrechen</button>
                            <button onClick={handleSubmitMonth} disabled={!password || isSubmitting} className="flex-1 py-3 bg-black text-white rounded-xl font-bold">{isSubmitting ? '...' : 'Signieren'}</button>
                        </div>
                    </div>
                </div>
            )}

            {editingItem && (() => {
                const entry = entries[editingItem.id]
                const isApproved = entry?.status === 'approved'
                return (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                            <h3 className="text-xl font-bold mb-4">{isApproved ? 'Details' : 'Erfassen'}</h3>
                            <div className="space-y-4 mb-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-sm font-bold">Start</label><input type="time" value={formData.actualStart} onChange={e => setFormData({ ...formData, actualStart: e.target.value })} readOnly={isApproved} className="w-full border p-3 rounded-xl text-center" /></div>
                                    <div><label className="text-sm font-bold">Ende</label><input type="time" value={formData.actualEnd} onChange={e => setFormData({ ...formData, actualEnd: e.target.value })} readOnly={isApproved} className="w-full border p-3 rounded-xl text-center" /></div>
                                </div>
                                {/* Only show interruptions for night shifts */}
                                {editingItem.type && (editingItem.type.toUpperCase() === 'ND' || editingItem.type.toLowerCase().includes('nacht')) && (
                                    <div className="bg-gray-50 border rounded-xl p-3 space-y-2">
                                        <label className="block text-xs font-bold text-gray-500 uppercase">Unterbrechung Bereitschaftszeit</label>
                                        {(formData.interruptions || []).map((int, idx) => (
                                            <div key={idx} className="flex justify-between items-center bg-white p-2 rounded text-sm border shadow-sm">
                                                <span className="font-mono font-medium">{int.start} - {int.end}</span>
                                                {!isApproved && <button onClick={() => {
                                                    const ni = [...formData.interruptions]; ni.splice(idx, 1);
                                                    setFormData({ ...formData, interruptions: ni })
                                                }} className="text-red-500 bg-red-50 p-1 rounded hover:bg-red-100 transition-colors"><XCircle size={16} /></button>}
                                            </div>
                                        ))}
                                        {!isApproved && (
                                            <div className="space-y-2 mt-3">
                                                <div className="flex gap-2 items-center">
                                                    <div className="flex-1">
                                                        <label className="text-xs font-bold text-gray-500 block mb-1">Start</label>
                                                        <div className="flex gap-1">
                                                            <select
                                                                value={formData.newIntStart?.split(':')[0] || ''}
                                                                onChange={e => {
                                                                    const minutes = formData.newIntStart?.split(':')[1] || '00'
                                                                    setFormData({ ...formData, newIntStart: `${e.target.value}:${minutes}` })
                                                                }}
                                                                className="border p-2 rounded-lg text-sm flex-1 text-center bg-white"
                                                            >
                                                                <option value="">--</option>
                                                                <option value="00">00</option>
                                                                <option value="01">01</option>
                                                                <option value="02">02</option>
                                                                <option value="03">03</option>
                                                                <option value="04">04</option>
                                                                <option value="05">05</option>
                                                            </select>
                                                            <span className="self-center font-bold">:</span>
                                                            <select
                                                                value={formData.newIntStart?.split(':')[1] || ''}
                                                                onChange={e => {
                                                                    const hours = formData.newIntStart?.split(':')[0] || '00'
                                                                    setFormData({ ...formData, newIntStart: `${hours}:${e.target.value}` })
                                                                }}
                                                                className="border p-2 rounded-lg text-sm flex-1 text-center bg-white"
                                                            >
                                                                <option value="">--</option>
                                                                <option value="00">00</option>
                                                                <option value="15">15</option>
                                                                <option value="30">30</option>
                                                                <option value="45">45</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                    <span className="text-gray-300 self-end pb-2">-</span>
                                                    <div className="flex-1">
                                                        <label className="text-xs font-bold text-gray-500 block mb-1">Ende</label>
                                                        <div className="flex gap-1">
                                                            <select
                                                                value={formData.newIntEnd?.split(':')[0] || ''}
                                                                onChange={e => {
                                                                    const minutes = formData.newIntEnd?.split(':')[1] || '00'
                                                                    setFormData({ ...formData, newIntEnd: `${e.target.value}:${minutes}` })
                                                                }}
                                                                className="border p-2 rounded-lg text-sm flex-1 text-center bg-white"
                                                            >
                                                                <option value="">--</option>
                                                                <option value="00">00</option>
                                                                <option value="01">01</option>
                                                                <option value="02">02</option>
                                                                <option value="03">03</option>
                                                                <option value="04">04</option>
                                                                <option value="05">05</option>
                                                                <option value="06">06</option>
                                                            </select>
                                                            <span className="self-center font-bold">:</span>
                                                            <select
                                                                value={formData.newIntEnd?.split(':')[1] || ''}
                                                                onChange={e => {
                                                                    const hours = formData.newIntEnd?.split(':')[0] || '00'
                                                                    setFormData({ ...formData, newIntEnd: `${hours}:${e.target.value}` })
                                                                }}
                                                                className="border p-2 rounded-lg text-sm flex-1 text-center bg-white"
                                                            >
                                                                <option value="">--</option>
                                                                <option value="00">00</option>
                                                                <option value="15">15</option>
                                                                <option value="30">30</option>
                                                                <option value="45">45</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        if (formData.newIntStart && formData.newIntEnd) {
                                                            setFormData({
                                                                ...formData,
                                                                interruptions: [...formData.interruptions, { start: formData.newIntStart, end: formData.newIntEnd, note: '' }],
                                                                newIntStart: '', newIntEnd: ''
                                                            })
                                                        }
                                                    }}
                                                    disabled={!formData.newIntStart || !formData.newIntEnd}
                                                    className="w-full bg-black text-white px-4 py-2.5 rounded-lg font-bold hover:bg-gray-800 disabled:opacity-50"
                                                >
                                                    Unterbrechung hinzufügen
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="bg-blue-50 p-4 rounded-xl flex justify-between font-bold text-blue-800"><span>Stunden:</span><span>{Number(calculatedHours).toFixed(2)}h</span></div>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setEditingItem(null)} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold">Abbrechen</button>
                                {!isApproved && <button onClick={handleSave} className="flex-1 py-3 bg-black text-white rounded-xl font-bold">Speichern</button>}
                            </div>
                        </div>
                    </div>
                )
            })()}
        </div>
    )
}
