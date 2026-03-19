import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import { format, parseISO, startOfMonth, endOfMonth, addDays, subDays, eachDayOfInterval, areIntervalsOverlapping } from 'date-fns'
import { de } from 'date-fns/locale'
import { CheckCircle, Save, Calendar, Download, Sun, Thermometer, ChevronRight, ChevronLeft, Users, XCircle, Pencil, TrendingUp, TrendingDown, Clock } from 'lucide-react'
import { calculateWorkHours, calculateDailyAbsenceHours } from '../utils/timeCalculations'
import { calculateGenericBalance } from '../utils/balanceHelpers'
import { generateReportHash } from '../utils/security'
import { constructIso, constructInterruptionIso, isValidInterruptionTime } from '../utils/timeTrackingHelpers'
import { findSnapshotEntry, calculateCorrection } from '../utils/pdfGenerator'

// Shift types that support multiple participants (group events)
const GROUP_SHIFT_TYPES = ['FORTBILDUNG', 'EINSCHULUNG', 'MITARBEITERGESPRAECH', 'SONSTIGES', 'SUPERVISION', 'TEAM']

export default function TimeTracking() {
    const { user, isAdmin } = useAuth()

    // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
    const [items, setItems] = useState([]) // Combined Shifts + Absence Days
    const [entries, setEntries] = useState({}) // Stores time_entries by key
    const [plannedShifts, setPlannedShifts] = useState([]) // Store all planned shifts for absence calculation
    const [loading, setLoading] = useState(true)
    const [editingItem, setEditingItem] = useState(null)
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'))
    const [userProfile, setUserProfile] = useState(null) // NEW: Store user profile
    const [balanceData, setBalanceData] = useState(null)

    // Report State
    const [monthStatus, setMonthStatus] = useState(null)
    const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false)
    const [password, setPassword] = useState('')
    const [submitError, setSubmitError] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [expandedCorrections, setExpandedCorrections] = useState({})

    // Form State
    const [formData, setFormData] = useState({
        actualStart: '',
        actualEnd: '',
        interruptions: [],
        newIntStart: '',
        newIntEnd: '',
        newIntNote: ''
    })
    const [calculatedHours, setCalculatedHours] = useState(0)

    // Data loading effect - must be before any conditional returns
    // Uses function declaration for fetchData (hoisted) to avoid reference errors
    useEffect(() => {
        if (isAdmin) return // Admins don't need personal time tracking data
        if (user && selectedMonth) fetchData()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, selectedMonth, isAdmin])

    // Init Modal - must be before any conditional returns
    useEffect(() => {
        if (isAdmin) return
        if (editingItem) {
            const entry = entries[editingItem.id]

            if (entry) {
                setFormData({
                    actualStart: format(parseISO(entry.actual_start), 'HH:mm'),
                    actualEnd: format(parseISO(entry.actual_end), 'HH:mm'),
                    interruptions: (entry.interruptions || []).map(int => ({
                        start: typeof int.start === 'string' && int.start.includes('T') ? format(parseISO(int.start), 'HH:mm') : int.start,
                        end: typeof int.end === 'string' && int.end.includes('T') ? format(parseISO(int.end), 'HH:mm') : int.end,
                        note: int.note || ''
                    })),
                    newIntStart: '',
                    newIntEnd: '',
                    newIntNote: ''
                })
            } else {
                if (editingItem.itemType === 'shift') {
                    setFormData({
                        actualStart: format(parseISO(editingItem.start_time), 'HH:mm'),
                        actualEnd: format(parseISO(editingItem.end_time), 'HH:mm'),
                        interruptions: [],
                        newIntStart: '',
                        newIntEnd: '',
                        newIntNote: ''
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
                        interruptions: [],
                        newIntStart: '',
                        newIntEnd: '',
                        newIntNote: ''
                    })
                }
            }
        }
    }, [editingItem, entries, userProfile, isAdmin])

    // Live Calc - must be before any conditional returns
    useEffect(() => {
        if (isAdmin) return
        if (editingItem && formData.actualStart && formData.actualEnd) {
            let startIso, endIso
            if (editingItem.itemType === 'shift') {
                startIso = constructIso(editingItem.start_time, formData.actualStart)
                endIso = constructIso(editingItem.end_time, formData.actualEnd)
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
    }, [formData, editingItem, isAdmin])

    // Admins don't have personal time tracking - they only control employee time tracking
    // IMPORTANT: This return must come AFTER all hooks to avoid React rules violations
    if (isAdmin) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-md">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Users className="text-blue-600" size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Administrator</h2>
                    <p className="text-gray-500">
                        Als Administrator hast du keine persönliche Zeiterfassung.
                        Nutze die <strong>Admin Zeiterfassung</strong> im Menü, um die Stunden deiner Mitarbeiter zu kontrollieren.
                    </p>
                </div>
            </div>
        )
    }

    // fetchData is defined below - this is fine because JavaScript hoists function declarations
    async function fetchData(isSilent = false) {
        if (!isSilent) setLoading(true)
        const start = startOfMonth(new Date(selectedMonth))
        const end = endOfMonth(new Date(selectedMonth))
        const [year, month] = selectedMonth.split('-').map(Number)

        // Load user profile for default hours calculation and start date filtering
        let currentProfile = userProfile
        if (!currentProfile) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('weekly_hours, start_date')
                .eq('id', user.id)
                .single()
            if (profile) {
                setUserProfile(profile)
                currentProfile = profile
            }
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

            // Confirmed if: group shift type (always) OR only interested person
            confirmedShifts = monthInterests
                .filter(i => {
                    const type = i.shifts?.type?.toUpperCase()
                    if (!type) return false
                    if (GROUP_SHIFT_TYPES.includes(type)) return true
                    return interestCounts[i.shift_id] === 1
                })
                .map(i => i.shifts)
                .filter(Boolean)

        }

        // Also get shifts directly assigned (for backwards compatibility)
        const { data: assignments } = await supabase
            .from('shifts')
            .select('id, start_time, end_time, type, assigned_to')
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

        // FILTER: Remove shifts before start_date
        const effectiveStartDate = currentProfile?.start_date ? new Date(currentProfile.start_date) : null
        const filteredPersonalShifts = effectiveStartDate ? allPersonalShifts.filter(s => {
            if (!s.start_time) return false
            return new Date(s.start_time) >= effectiveStartDate
        }) : allPersonalShifts

        const shiftItems = filteredPersonalShifts.map(s => ({
            ...s,
            itemType: 'shift',
            sortDate: new Date(s.start_time)
        }))

        // Store planned shifts for absence calculation - MERGED LATER after Team Shifts

        // 1.1 Get TEAM Shifts
        // Shifts marked as 'TEAM' are mandatory for everyone and don't require individual assignment.
        const { data: teamShifts } = await supabase
            .from('shifts')
            .select('id, start_time, end_time, type')
            .eq('type', 'TEAM')
            .gte('start_time', startIso)
            .lte('start_time', endIso)

        // FILTER: Remove Team shifts before start_date
        const filteredTeamShifts = effectiveStartDate ? (teamShifts || []).filter(s => {
            if (!s.start_time) return false
            return new Date(s.start_time) >= effectiveStartDate
        }) : (teamShifts || [])

        // Store ALL planned shifts (Personal + Team) for absence calculation - Deduplicated!
        const allPlannedMap = new Map()
        filteredPersonalShifts?.forEach(s => allPlannedMap.set(s.id, s))
        filteredTeamShifts?.forEach(s => allPlannedMap.set(s.id, s))
        const allPlannedRaw = Array.from(allPlannedMap.values())
        setPlannedShifts(allPlannedRaw)

        // 2. Get Absences (Approved only)
        // Use YYYY-MM-DD string format
        const startStr = format(start, 'yyyy-MM-dd')
        const endStr = format(end, 'yyyy-MM-dd')

        const { data: absences } = await supabase
            .from('absences')
            .select('start_date, end_date, user_id, status, type, planned_hours, planned_shifts_snapshot, id')
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

                        // SINGLE SOURCE OF TRUTH INTEGRATION
                        // Calculate hours first to determine if this absence is relevant (hours > 0)
                        const hours = calculateDailyAbsenceHours(day, abs, allPlannedRaw, userProfile)

                        if (hours > 0) {
                            const dateKey = format(day, 'yyyy-MM-dd')
                            const isSick = abs.reason === 'sick' || (abs.type && abs.type.toLowerCase().includes('krank'))

                            // For SICK leave: Use saved snapshot OR fall back to live data
                            // The snapshot is saved when reporting sick, BEFORE interests are deleted
                            let plannedShiftsForDay = []

                            if (isSick && abs.planned_shifts_snapshot && abs.planned_shifts_snapshot.length > 0) {
                                // Use saved snapshot - filter to this specific day
                                plannedShiftsForDay = abs.planned_shifts_snapshot.filter(s => {
                                    if (!s.start_time) return false
                                    return format(parseISO(s.start_time), 'yyyy-MM-dd') === dateKey
                                })
                            } else {
                                // Fall back to live data (for old absences without snapshot)
                                plannedShiftsForDay = allPlannedRaw.filter(s => {
                                    if (!s.start_time) return false
                                    return format(parseISO(s.start_time), 'yyyy-MM-dd') === dateKey
                                })
                            }

                            // For SICK leave: Create one entry PER planned shift (like normal shifts)
                            // For VACATION: Create one entry per day (standard daily hours)
                            if (isSick && plannedShiftsForDay.length > 0) {
                                // Create separate entries for each planned shift
                                plannedShiftsForDay.forEach((shift, idx) => {
                                    const shiftHours = calculateWorkHours(shift.start_time, shift.end_time, shift.type)
                                    absenceItems.push({
                                        id: `abs-${abs.id}-${format(day, 'yyyy-MM-dd')}-${idx}`,
                                        absence_id: abs.id,
                                        date: format(day, 'yyyy-MM-dd'),
                                        type: abs.type,
                                        reason: abs.reason,
                                        note: abs.note,
                                        planned_hours: shiftHours,
                                        plannedShift: shift, // Single shift for this entry
                                        itemType: 'absence',
                                        sortDate: new Date(shift.start_time) // Sort by shift start time
                                    })
                                })
                            } else {
                                // Vacation or no planned shifts - single entry
                                absenceItems.push({
                                    id: `abs-${abs.id}-${format(day, 'yyyy-MM-dd')}`,
                                    absence_id: abs.id,
                                    date: format(day, 'yyyy-MM-dd'),
                                    type: abs.type,
                                    reason: abs.reason,
                                    note: abs.note,
                                    planned_hours: hours,
                                    itemType: 'absence',
                                    sortDate: day
                                })
                            }
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
        const teamItems = filteredTeamShifts?.map(s => {
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

        const sortedItems = [...filteredShiftItems, ...teamItems, ...absenceItems].sort((a, b) => a.sortDate - b.sortDate)

        // Merge TD1+TD2 on same day into single "TD" entry (no handover needed when same person)
        const mergedItems = []
        const mergedIds = new Set()
        for (const item of sortedItems) {
            if (mergedIds.has(item.id)) continue
            if (item.type === 'TD1' || item.type === 'TAGDIENST') {
                const itemDate = format(new Date(item.start_time), 'yyyy-MM-dd')
                const td2 = sortedItems.find(s => s.type === 'TD2' && format(new Date(s.start_time), 'yyyy-MM-dd') === itemDate && !mergedIds.has(s.id))
                if (td2) {
                    mergedItems.push({
                        ...item,
                        type: 'TD',
                        end_time: td2.end_time,
                        isMerged: true,
                        mergedIds: [item.id, td2.id],
                        mergedOriginals: [item, td2]
                    })
                    mergedIds.add(item.id)
                    mergedIds.add(td2.id)
                    continue
                }
            }
            mergedItems.push(item)
        }

        setItems(mergedItems)

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

            // Map merged TD items: combine hours from both original entries
            mergedItems.filter(i => i.isMerged).forEach(merged => {
                const entries = merged.mergedIds.map(id => allTimeEntries.find(e => e.shift_id === id)).filter(Boolean)
                if (entries.length > 0) {
                    // Calculate from combined shift times (not DB values which may be stale)
                    const combinedStart = entries[0].actual_start || merged.mergedOriginals[0].start_time
                    const combinedEnd = entries[entries.length - 1].actual_end || merged.mergedOriginals[1].end_time
                    const combinedHours = calculateWorkHours(combinedStart, combinedEnd, 'TD')
                    entriesMap[merged.id] = {
                        ...entries[0],
                        calculated_hours: combinedHours,
                        actual_start: combinedStart,
                        actual_end: combinedEnd,
                        isMergedEntry: true,
                        originalEntries: entries
                    }
                }
            })

            // Also map TEAM shifts
            filteredTeamShifts?.forEach(shift => {
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

        // --- 6. Calc Live Balance ---
        // Fetch remaining global data needed for accurate balance up to this month
        try {
            const { data: allMyInterests } = await supabase
                .from('shift_interests')
                .select('shift:shifts(id, start_time, end_time, assigned_to, type)')
                .eq('user_id', user.id)

            const { data: allMyDirectShifts } = await supabase
                .from('shifts')
                .select('id, start_time, end_time, assigned_to, type')
                .eq('assigned_to', user.id)

            const { data: allTeamShifts } = await supabase
                .from('shifts')
                .select('id, start_time, end_time, type')
                .eq('type', 'TEAM')

            const rawShiftsFromInterests = allMyInterests?.map(i => i.shift).filter(Boolean) || []
            const globalShifts = [...rawShiftsFromInterests]
            ;(allMyDirectShifts || []).forEach(s => {
                if (!globalShifts.some(h => h.id === s.id)) globalShifts.push(s)
            })
            ;(allTeamShifts || []).forEach(s => {
                if (!globalShifts.some(h => h.id === s.id)) globalShifts.push(s)
            })

            const { data: allMyAbsences } = await supabase
                .from('absences')
                .select('start_date, end_date, user_id, status, type, planned_hours')
                .eq('user_id', user.id).eq('status', 'genehmigt')

            const { data: allMyEntries } = await supabase
                .from('time_entries').select('*').eq('user_id', user.id)

            const { data: allMyCorrs } = await supabase
                .from('balance_corrections')
                .select('correction_hours, effective_month')
                .eq('user_id', user.id)

            // Calculate balance pretending we are in the selected month
            // We use the 15th of the month to safely avoid timezone edge cases at month boundaries
            const targetDateForBalance = new Date(`${selectedMonth}-15T12:00:00Z`)
            
            // To ensure local live edits are reflected immediately without waiting for DB replication,
            // we merge the local `allTimeEntries` (which might contain optimistic updates) into `allMyEntries`
            const mergedEntries = [...(allMyEntries || [])]
            allTimeEntries.forEach(localEntry => {
               const idx = mergedEntries.findIndex(e => e.id === localEntry.id)
               if(idx >= 0) mergedEntries[idx] = localEntry
               else mergedEntries.push(localEntry)
            })

            const b = calculateGenericBalance(
                currentProfile, 
                globalShifts, 
                allMyAbsences || [], 
                mergedEntries, 
                targetDateForBalance, 
                allMyCorrs || []
            )
            setBalanceData(b)
        } catch (err) {
            console.error('Error fetching balance data in TimeTracking:', err)
        }

        if (!isSilent) setLoading(false)
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
            if (editingItem.isMerged) {
                // Merged TD1+TD2: save entry for each original shift
                for (const origId of editingItem.mergedIds) {
                    const origPayload = { ...payload, shift_id: origId }
                    const { data: existing } = await supabase
                        .from('time_entries')
                        .select('id')
                        .eq('user_id', user.id)
                        .eq('shift_id', origId)
                        .maybeSingle()
                    if (existing) {
                        await supabase.from('time_entries').update(origPayload).eq('id', existing.id)
                    } else {
                        await supabase.from('time_entries').insert(origPayload)
                    }
                }
                // Skip the normal query flow
                setEditingItem(null)
                setFormData({ actualStart: '', actualEnd: '', interruptions: [] })
                setCalculatedHours(null)
                fetchData(true)
                return
            }

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
                // Re-fetch everything silently to update the balance calculation correctly
                // This is safer than trying to mock the complex balance calculation locally
                fetchData(true)
            }
            setEditingItem(null)
        }
    }

    const handleSubmitMonth = async () => {
        setSubmitError('')
        setIsSubmitting(true)
        const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password: password })
        if (authError) { setSubmitError('Falsches Passwort.'); setIsSubmitting(false); return }
        // Prepare Hash - month boundaries used for comprehensive entry collection
        const _monthStart = startOfMonth(new Date(selectedMonth))
        const _monthEnd = endOfMonth(new Date(selectedMonth))

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
        const { error } = await supabase.from('monthly_reports').upsert({
            user_id: user.id,
            data_hash: hash,
            hash_version: 'v1',  // Track which hash algorithm was used
            original_data_snapshot: comprehensiveEntries,
            year,
            month,
            status: 'eingereicht',
            submitted_at: new Date().toISOString()
        }, { onConflict: 'user_id,year,month' })
        if (error) setSubmitError(error.message); else { setIsSubmitModalOpen(false); setPassword(''); fetchData() }
        setIsSubmitting(false)
    }

    const handleDownloadPDF = async () => {
        // Fetch flex shift IDs for this user
        const { data: flexInterests } = await supabase
            .from('shift_interests')
            .select('shift_id')
            .eq('user_id', user.id)
            .eq('is_flex', true)
        const flexShiftIds = new Set((flexInterests || []).map(f => f.shift_id))

        const entriesList = items.map(item => {
            const entry = entries[item.id]
            const isFlex = flexShiftIds.has(item.id)

            // Case A: Real DB Entry exists
            if (entry) {
                return {
                    ...entry,
                    is_flex: isFlex,
                    shifts: item.itemType === 'shift' ? item : { start_time: item.sortDate.toISOString(), type: item.type || 'Urlaub' },
                    absences: item.itemType === 'absence' ? { type: item.type || 'Abwesend' } : null
                }
            }

            // Case B: Virtual Absence (approved but not in time_entries) - FIX for missing sick leave/vacation
            // Use pre-calculated planned_hours from item (already computed during fetch with SSOT)
            if (item.itemType === 'absence') {
                return {
                    id: item.id,
                    user_id: user.id,
                    entry_date: item.date,
                    actual_start: item.sortDate.toISOString(),
                    actual_end: null,
                    calculated_hours: item.planned_hours || 0, // Use pre-calculated hours from SSOT
                    absence_id: item.absence_id,
                    shifts: { start_time: item.sortDate.toISOString(), type: item.type || 'Abwesend' },
                    absences: { type: item.type || 'Abwesend' }
                }
            }

            return null
        }).filter(Boolean)

        // Fetch full profile to ensure we have full_name for PDF
        let pdfUser = user
        const { data: fullProfile } = await supabase.from('profiles')
            .select('id, full_name, email, weekly_hours')
            .eq('id', user.id)
            .single()
        if (fullProfile) {
            pdfUser = { ...user, ...fullProfile }
        }

        // Lazy load PDF generator only when needed (saves ~611KB on initial load)
        const { generateTimeReportPDF } = await import('../utils/timeReportPdfGenerator')
        generateTimeReportPDF({
            yearMonth: selectedMonth,
            user: pdfUser,
            entries: entriesList,
            statusData: monthStatus,
            vacationData: null, // TODO: Add vacation data if available
            balanceData: null  // TODO: Add balance data if available
        })
    }

    const isLocked = monthStatus && (monthStatus.status === 'eingereicht' || monthStatus.status === 'genehmigt')
    const allItemsDone = items.length > 0 && items.every(i => {
        if (i.itemType === 'absence') return true
        if (entries[i.id]) return true
        if (i.isTeam && i.isColliding) return true
        return false
    })

    // Compute corrections: compare current entries against original snapshot
    const corrections = useMemo(() => {
        const snapshot = monthStatus?.original_data_snapshot
        if (!snapshot) return {}
        const result = {}
        items.forEach(item => {
            const entry = entries[item.id]
            if (!entry) return
            const snapEntry = findSnapshotEntry(snapshot, entry)
            const correction = calculateCorrection(snapEntry, entry)
            if (correction) result[item.id] = correction
        })
        return result
    }, [monthStatus, entries, items])

    const correctionCount = Object.keys(corrections).length

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
                    {correctionCount > 0 && monthStatus.status === 'genehmigt' && (
                        <div className="w-full mt-2 bg-amber-50 border border-amber-200 text-amber-800 py-2 px-4 rounded-lg font-bold flex items-center justify-center gap-2 text-sm">
                            <Pencil size={16} />
                            <span>{correctionCount} von {items.length} Einträgen wurden vom Admin korrigiert</span>
                        </div>
                    )}
                </div>
            )}

            <div className="bg-white p-3 rounded-[1.5rem] shadow-[0_2px_10px_rgb(0,0,0,0.04)] border border-gray-100/80 mb-6">
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

            {/* Live Balance Card */}
            {balanceData && !loading && (
                <div className="bg-white rounded-[1.5rem] shadow-[0_2px_10px_rgb(0,0,0,0.04)] border border-gray-100/80 overflow-hidden mb-6 p-4">
                    <div className="flex items-center gap-2 mb-3 px-1">
                        <Clock size={18} className="text-gray-400" />
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Mein Stundenkonto</h3>
                        <span className="text-[10px] text-gray-400 ml-auto">{format(new Date(selectedMonth + '-01'), 'MMMM yyyy', { locale: de })}</span>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2 text-center">
                        <div className="bg-gray-50 rounded-lg p-1.5">
                            <div className="text-[9px] text-gray-400 uppercase font-bold">Soll</div>
                            <div className="font-bold text-sm text-gray-700">{balanceData.target}h</div>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-1.5">
                            <div className="text-[9px] text-blue-400 uppercase font-bold">Ist</div>
                            <div className="font-bold text-sm text-blue-700">{Math.round((balanceData.actual + balanceData.vacation) * 100) / 100}h</div>
                        </div>
                        <div className={`rounded-lg p-1.5 ${balanceData.carryover >= 0 ? 'bg-gray-50' : 'bg-red-50'}`}>
                            <div className={`text-[9px] uppercase font-bold ${balanceData.carryover >= 0 ? 'text-gray-400' : 'text-red-600'}`}>Übertrag</div>
                            <div className={`font-bold text-sm ${balanceData.carryover >= 0 ? 'text-gray-700' : 'text-red-700'}`}>
                                {balanceData.carryover > 0 ? '+' : ''}{balanceData.carryover}h
                            </div>
                        </div>
                        <div className={`rounded-lg p-1.5 ${balanceData.total >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                            <div className={`text-[9px] uppercase font-bold ${balanceData.total >= 0 ? 'text-green-600' : 'text-red-600'}`}>Gesamt</div>
                            <div className={`font-bold text-sm ${balanceData.total >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                {balanceData.total > 0 ? '+' : ''}{balanceData.total}h
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {loading ? <div className="text-center py-10 text-gray-400">Lade...</div> : (
                <div className="space-y-3 pb-24">
                    {items.map(item => {
                        const entry = entries[item.id]
                        const isDone = entry?.status === 'approved'
                        const _hasEntry = !!entry
                        const isAbsence = item.itemType === 'absence'
                        // Safe check for shift date vs today
                        const itemDate = isAbsence ? item.sortDate : new Date(item.start_time)

                        // Icon Logic
                        const isSick = isAbsence && item.type && item.type.toLowerCase().includes('krank')
                        const isTeam = item.isTeam

                        // Display Type Logic
                        let displayType = item.type
                        if (isTeam) displayType = "Teamsitzung"
                        if (item.type === 'EINSCHULUNG') displayType = "Einschulungstermin"
                        if (item.type === 'MITARBEITERGESPRAECH') displayType = "MA-Gespräch"
                        if (item.type === 'SONSTIGES') displayType = "Sonstiges"

                        return (
                            <div key={item.id} className={`p-4 rounded-[1.5rem] border shadow-[0_2px_10px_rgb(0,0,0,0.04)] transition-all ${isDone ? 'bg-gray-100' : 'bg-white border-gray-100/80 hover:shadow-[0_4px_20px_rgb(0,0,0,0.06)]'}`}>
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
                                                <>
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${isSick ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`}>
                                                        {item.type || 'Urlaub'}
                                                    </span>
                                                    {/* Show original shift type for sick leave */}
                                                    {isSick && item.plannedShift && (
                                                        <span className="text-gray-400">
                                                            (statt {item.plannedShift.type})
                                                        </span>
                                                    )}
                                                </>
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
                                    {monthStatus?.status === 'genehmigt' ? (
                                        corrections[item.id] ? (
                                            <button
                                                onClick={() => setExpandedCorrections(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                                                className="px-2.5 py-1.5 rounded-lg text-xs font-bold uppercase bg-amber-100 text-amber-700 flex items-center gap-1.5 hover:bg-amber-200 active:scale-95 transition-all cursor-pointer"
                                            >
                                                <Pencil size={12} />
                                                Korrigiert
                                                <ChevronRight size={12} className={`transition-transform duration-200 ${expandedCorrections[item.id] ? 'rotate-90' : ''}`} />
                                            </button>
                                        ) : null
                                    ) : isAbsence ? (
                                        <div className="px-2 py-1 rounded text-xs font-bold uppercase bg-green-100 text-green-700">
                                            Genehmigt
                                        </div>
                                    ) : entry ? (
                                        <div className="px-2 py-1 rounded text-xs font-bold uppercase bg-yellow-100 text-yellow-700">
                                            Erfasst
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
                                        const _dateKey = format(d, 'yyyy-MM-dd')
                                        const isSick = item.reason === 'sick' || (item.type && item.type.toLowerCase().includes('krank'))

                                        if (isSick) {
                                            // SICK: Use pre-calculated SSOT hours
                                            let sickHours = item.planned_hours || 0

                                            // Use original planned shift times if available
                                            if (item.plannedShift) {
                                                // Show original shift times (e.g., ND 19:00-08:00)
                                                displayStart = format(parseISO(item.plannedShift.start_time), 'HH:mm')
                                                displayEnd = format(parseISO(item.plannedShift.end_time), 'HH:mm')
                                            } else {
                                                // Fallback to calculated display
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
                                            {entry?.interruptions && entry.interruptions.length > 0 && (
                                                <div className="mt-2 bg-blue-50 p-2 rounded border border-blue-100">
                                                    <div className="text-xs font-bold text-blue-700 mb-1">Unterbrechungen:</div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {entry.interruptions.map((int, idx) => {
                                                            if (!int.start || !int.end) return null
                                                            try {
                                                                return (
                                                                    <span key={idx} className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono">
                                                                        {format(parseISO(int.start), 'HH:mm')} - {format(parseISO(int.end), 'HH:mm')}{int.note ? ` (${int.note})` : ''}
                                                                    </span>
                                                                )
                                                            } catch {
                                                                return null
                                                            }
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })()}
                                {expandedCorrections[item.id] && corrections[item.id] && (() => {
                                    const c = corrections[item.id]
                                    const fmtTime = (iso) => iso ? format(parseISO(iso), 'HH:mm') : '--:--'
                                    return (
                                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-sm space-y-1.5">
                                            <div className="flex justify-between text-gray-500">
                                                <span>Deine Eingabe:</span>
                                                <span className="font-mono">{fmtTime(c.originalStart)} - {fmtTime(c.originalEnd)} = {c.originalHours.toFixed(2)}h</span>
                                            </div>
                                            <div className="flex justify-between text-green-700 font-bold">
                                                <span>Korrigiert auf:</span>
                                                <span className="font-mono">{fmtTime(c.currentStart)} - {fmtTime(c.currentEnd)} = {c.currentHours.toFixed(2)}h</span>
                                            </div>
                                            <div className={`flex justify-between font-bold ${c.hoursDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                <span>Differenz:</span>
                                                <span className="font-mono">{c.hoursDiff > 0 ? '+' : ''}{c.hoursDiff.toFixed(2)}h</span>
                                            </div>
                                            {c.interruptionsChanged && (
                                                <div className="border-t border-amber-200 pt-1.5 mt-1 space-y-1">
                                                    <div className="text-xs font-bold text-amber-700">Unterbrechungen geändert:</div>
                                                    {Array.isArray(c.originalInterruptions) && c.originalInterruptions.length > 0 && (
                                                        <div className="text-gray-500 text-xs">
                                                            <span>Vorher: </span>
                                                            {c.originalInterruptions.map((int, i) => {
                                                                try {
                                                                    return <span key={i} className="font-mono">{i > 0 ? ', ' : ''}{format(parseISO(int.start), 'HH:mm')}-{format(parseISO(int.end), 'HH:mm')}</span>
                                                                } catch { return null }
                                                            })}
                                                        </div>
                                                    )}
                                                    {Array.isArray(c.currentInterruptions) && c.currentInterruptions.length > 0 && (
                                                        <div className="text-green-700 text-xs font-bold">
                                                            <span>Nachher: </span>
                                                            {c.currentInterruptions.map((int, i) => {
                                                                try {
                                                                    return <span key={i} className="font-mono">{i > 0 ? ', ' : ''}{format(parseISO(int.start), 'HH:mm')}-{format(parseISO(int.end), 'HH:mm')}</span>
                                                                } catch { return null }
                                                            })}
                                                        </div>
                                                    )}
                                                    {Array.isArray(c.currentInterruptions) && c.currentInterruptions.length === 0 && (
                                                        <div className="text-red-600 text-xs font-bold">Alle Unterbrechungen entfernt</div>
                                                    )}
                                                </div>
                                            )}
                                            {c.adminNote && (
                                                <div className="text-gray-600 italic border-t border-amber-200 pt-1.5 mt-1">
                                                    Grund: {c.adminNote}
                                                </div>
                                            )}
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
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Start</label>
                                        <input type="time" value={formData.actualStart} onChange={e => setFormData({ ...formData, actualStart: e.target.value })} readOnly={isApproved} className={`w-full border-2 p-3 rounded-xl text-lg font-bold text-center transition-all outline-none ${isApproved ? 'bg-gray-100 border-gray-200 text-gray-500' : 'bg-gray-50 border-gray-200 focus:border-black focus:ring-1 focus:ring-black hover:border-gray-300'}`} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">Ende</label>
                                        <input type="time" value={formData.actualEnd} onChange={e => setFormData({ ...formData, actualEnd: e.target.value })} readOnly={isApproved} className={`w-full border-2 p-3 rounded-xl text-lg font-bold text-center transition-all outline-none ${isApproved ? 'bg-gray-100 border-gray-200 text-gray-500' : 'bg-gray-50 border-gray-200 focus:border-black focus:ring-1 focus:ring-black hover:border-gray-300'}`} />
                                    </div>
                                </div>
                                {/* Only show interruptions for night shifts */}
                                {editingItem.type && (editingItem.type.toUpperCase() === 'ND' || editingItem.type.toLowerCase().includes('nacht')) && (
                                    <div className="bg-gray-50 border rounded-xl p-3 space-y-2">
                                        <label className="block text-xs font-bold text-gray-500 uppercase">Unterbrechung Bereitschaftszeit</label>
                                        {(formData.interruptions || []).map((int, idx) => (
                                            <div key={idx} className="bg-white p-2 rounded text-sm border shadow-sm space-y-1">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-mono font-medium">
                                                        {typeof int.start === 'string' && int.start.includes('T') ? format(parseISO(int.start), 'HH:mm') : int.start} - {typeof int.end === 'string' && int.end.includes('T') ? format(parseISO(int.end), 'HH:mm') : int.end}
                                                    </span>
                                                    {!isApproved && <button onClick={() => {
                                                        const ni = [...formData.interruptions]; ni.splice(idx, 1);
                                                        setFormData({ ...formData, interruptions: ni })
                                                    }} className="text-red-500 bg-red-50 p-1 rounded hover:bg-red-100 transition-colors"><XCircle size={16} /></button>}
                                                </div>
                                                {isApproved ? (
                                                    int.note && <div className="text-xs text-gray-500">Grund: {int.note}</div>
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={int.note || ''}
                                                        onChange={e => {
                                                            const updated = [...formData.interruptions]
                                                            updated[idx] = { ...updated[idx], note: e.target.value }
                                                            setFormData({ ...formData, interruptions: updated })
                                                        }}
                                                        placeholder="Grund der Unterbrechung"
                                                        className="w-full border p-1.5 rounded text-xs"
                                                    />
                                                )}
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
                                                <input
                                                    type="text"
                                                    value={formData.newIntNote}
                                                    onChange={e => setFormData({ ...formData, newIntNote: e.target.value })}
                                                    placeholder="Grund der Unterbrechung"
                                                    className="w-full border p-2 rounded-lg text-sm"
                                                />
                                                <button
                                                    onClick={() => {
                                                        if (formData.newIntStart && formData.newIntEnd) {
                                                            setFormData({
                                                                ...formData,
                                                                interruptions: [...formData.interruptions, { start: formData.newIntStart, end: formData.newIntEnd, note: formData.newIntNote }],
                                                                newIntStart: '', newIntEnd: '', newIntNote: ''
                                                            })
                                                        }
                                                    }}
                                                    disabled={!isValidInterruptionTime(formData.newIntStart, formData.newIntEnd)}
                                                    className={`w-full text-white px-4 py-2.5 rounded-lg font-bold transition-all ${isValidInterruptionTime(formData.newIntStart, formData.newIntEnd) ? 'bg-black hover:bg-gray-800' : 'bg-gray-300 cursor-not-allowed opacity-50'}`}
                                                >
                                                    Unterbrechung hinzufügen
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 shadow-sm mt-4">
                                    <div className="flex justify-between items-center text-blue-900 font-bold">
                                        <span className="text-sm uppercase tracking-wider">Berechnet</span>
                                        <span className="text-2xl">{Number(calculatedHours).toFixed(2)}h</span>
                                    </div>
                                    {!editingItem.absence_id && editingItem.type && (
                                        <div className="flex justify-between items-center text-xs text-blue-600/80 font-medium border-t border-blue-200/50 pt-2 mt-2">
                                            <span>Geplant laut Dienstplan</span>
                                            <span>{calculateWorkHours(editingItem.start_time, editingItem.end_time, editingItem.type).toFixed(2)}h</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button onClick={() => setEditingItem(null)} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-colors">Abbrechen</button>
                                {!isApproved && <button onClick={handleSave} className="flex-1 py-3 bg-black hover:bg-gray-900 text-white shadow-lg shadow-black/20 rounded-xl font-bold transition-all">Speichern</button>}
                            </div>
                        </div>
                    </div>
                )
            })()}

        </div>
    )
}
