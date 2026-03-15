import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, subDays, addDays } from 'date-fns'
import { de } from 'date-fns/locale'
import { CheckCircle, XCircle, Download, FileText, Sun, Thermometer, ChevronLeft, ChevronRight, ShieldCheck, ShieldAlert, Eye, PenTool, Circle, RotateCcw } from 'lucide-react'
import { calculateWorkHours, calculateDailyAbsenceHours } from '../utils/timeCalculations'
import { calculateGenericBalance } from '../utils/balanceHelpers'
import { generateReportHash } from '../utils/security'
import { logAdminAction, fetchBeforeState } from '../utils/adminAudit'
import { constructIso, constructInterruptionIso, safeFormatTime, safeFormatDate, isValidInterruptionTime } from '../utils/timeTrackingHelpers'

export default function AdminTimeTracking() {
    const [users, setUsers] = useState([])
    const [selectedUserId, setSelectedUserId] = useState('')
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'))

    const [userMonthStatus, setUserMonthStatus] = useState(null)
    const [verificationStatus, setVerificationStatus] = useState('none') // 'verified', 'tampered', 'none'
    const [entries, setEntries] = useState([])
    const [showSnapshotModal, setShowSnapshotModal] = useState(false) // New Modal State
    const [loading, setLoading] = useState(false)
    const [editingEntry, setEditingEntry] = useState(null)

    // Balance Correction States
    const [corrections, setCorrections] = useState([])
    const [showCorrectionModal, setShowCorrectionModal] = useState(false)
    const [correctionData, setCorrectionData] = useState({ targetTotal: '', reason: '' })
    const [currentBalance, setCurrentBalance] = useState(null)

    const [formData, setFormData] = useState({
        actualStart: '',
        actualEnd: '',
        interruptions: [],
        adminNote: '',
        newIntStart: '',
        newIntEnd: '',
        newIntNote: ''
    })
    const [calculatedHours, setCalculatedHours] = useState(0)

    // Fetch Users with their status for current month
    const fetchUsers = async () => {
        const { data } = await supabase.from('profiles').select('*').or('is_active.eq.true,is_active.is.null').neq('role', 'admin').order('full_name')

        // Fetch status for selected month
        const [year, month] = selectedMonth.split('-').map(Number)
        const { data: reports } = await supabase.from('monthly_reports')
            .select('user_id, status')
            .eq('year', year)
            .eq('month', month)

        // Merge status into users
        const usersWithStatus = (data || []).map(u => ({
            ...u,
            monthStatus: reports?.find(r => r.user_id === u.id)?.status || null
        }))

        setUsers(usersWithStatus)
    }

    useEffect(() => {
        fetchUsers()
    }, [selectedMonth])

    // Fetch Data
    useEffect(() => {
        if (selectedUserId && selectedMonth) fetchData()
        else { setEntries([]); setUserMonthStatus(null); setVerificationStatus('none') }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedUserId, selectedMonth])

    const fetchData = async () => {
        setLoading(true)
        const start = startOfMonth(new Date(selectedMonth))
        const end = endOfMonth(new Date(selectedMonth))
        const [year, month] = selectedMonth.split('-').map(Number)

        // 0. Profile (for Hours)
        const { data: profile } = await supabase.from('profiles').select('weekly_hours, start_date').eq('id', selectedUserId).single()
        const weeklyHours = profile?.weekly_hours || 40
        // dailyHours not used directly but weeklyHours is needed for absence calculations
        const effectiveStartDate = profile?.start_date ? new Date(profile.start_date) : null

        // 1. Report Status
        const { data: report } = await supabase.from('monthly_reports')
            .select('*').eq('user_id', selectedUserId).eq('year', year).eq('month', month).single()
        setUserMonthStatus(report || null)

        // 2. Real DB Entries (optimized: fetch with buffer)
        const bufferStart = subDays(start, 7).toISOString()
        const bufferEnd = addDays(end, 7).toISOString()
        const bufferStartDate = format(subDays(start, 7), 'yyyy-MM-dd')
        const bufferEndDate = format(addDays(end, 7), 'yyyy-MM-dd')

        const [shiftEntriesRes, absenceEntriesRes] = await Promise.all([
            supabase
                .from('time_entries')
                .select('*, shifts(*), absences(*)')
                .eq('user_id', selectedUserId)
                .gte('actual_start', bufferStart)
                .lte('actual_start', bufferEnd),
            supabase
                .from('time_entries')
                .select('*, shifts(*), absences(*)')
                .eq('user_id', selectedUserId)
                .gte('entry_date', bufferStartDate)
                .lte('entry_date', bufferEndDate)
        ])

        const rawDbEntries = [
            ...(shiftEntriesRes.data || []),
            ...(absenceEntriesRes.data || [])
        ]
        // Deduplicate by ID
        const dbEntriesMap = new Map()
        rawDbEntries.forEach(e => dbEntriesMap.set(e.id, e))
        const dbEntries = Array.from(dbEntriesMap.values())

        // 3. Absences
        const { data: absences } = await supabase
            .from('absences')
            .select('start_date, end_date, user_id, status, type, planned_hours, planned_shifts_snapshot, id')
            .eq('user_id', selectedUserId)
            .eq('status', 'genehmigt')
            .lte('start_date', format(end, 'yyyy-MM-dd'))
            .gte('end_date', format(start, 'yyyy-MM-dd'))

        // 4. Fetch planned shifts for sick leave calculation 
        // Get confirmed shifts via interests (where user is the ONLY interested person)
        const startIso = start.toISOString()
        const endIso = end.toISOString()

        // Fetch all interests without date filter on joins, filter locally instead
        const { data: myInterests } = await supabase
            .from('shift_interests')
            .select('shift_id, shifts(*)')
            .eq('user_id', selectedUserId)

        // Filter to shifts within the selected month
        const monthInterests = myInterests?.filter(i => {
            if (!i.shifts?.start_time) return false
            const shiftDate = new Date(i.shifts.start_time)
            return shiftDate >= start && shiftDate <= end
        }) || []

        const shiftIds = monthInterests.map(i => i.shift_id)

        let confirmedShifts = []

        if (shiftIds.length > 0) {
            const { data: allInterests } = await supabase
                .from('shift_interests')
                .select('shift_id')
                .in('shift_id', shiftIds)

            const interestCounts = {}
            allInterests?.forEach(int => {
                interestCounts[int.shift_id] = (interestCounts[int.shift_id] || 0) + 1
            })

            confirmedShifts = monthInterests
                .filter(i => interestCounts[i.shift_id] === 1)
                .map(i => i.shifts)
                .filter(s => s)
        }

        // Also get direct assignments (backwards compatibility)
        const { data: personalShifts } = await supabase
            .from('shifts')
            .select('id, start_time, end_time, type, assigned_to')
            .eq('assigned_to', selectedUserId)
            .gte('start_time', startIso)
            .lte('start_time', endIso)

        // Merge sources
        const allPersonalShifts = [...confirmedShifts]
        personalShifts?.forEach(a => {
            if (!allPersonalShifts.some(s => s.id === a.id)) {
                allPersonalShifts.push(a)
            }
        })

        // FILTER: Remove shifts before start_date
        const filteredPersonalShifts = effectiveStartDate ? allPersonalShifts.filter(s => {
            if (!s.start_time) return false
            return new Date(s.start_time) >= effectiveStartDate
        }) : allPersonalShifts

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

        // Combine all planned shifts
        const allPlannedShifts = [...filteredPersonalShifts, ...filteredTeamShifts]

        // 5. Create absence items (virtual entries for each day of approved absence)
        const absenceItems = []
        if (absences) {
            absences.forEach(abs => {
                const rangeStart = new Date(abs.start_date) < start ? start : new Date(abs.start_date)
                const rangeEnd = new Date(abs.end_date) > end ? end : new Date(abs.end_date)

                if (rangeStart <= rangeEnd) {
                    const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd })
                    days.forEach(day => {
                        const dateKey = format(day, 'yyyy-MM-dd')
                        const isSick = abs.type === 'Krank' || abs.type === 'Krankenstand'

                        // SINGLE SOURCE OF TRUTH INTEGRATION
                        const hours = calculateDailyAbsenceHours(day, abs, allPlannedShifts, { weekly_hours: weeklyHours })

                        if (hours > 0) {
                            // For SICK leave: Use snapshot to create separate entries per shift
                            let plannedShiftsForDay = []

                            if (isSick && abs.planned_shifts_snapshot && abs.planned_shifts_snapshot.length > 0) {
                                plannedShiftsForDay = abs.planned_shifts_snapshot.filter(s => {
                                    if (!s.start_time) return false
                                    return format(parseISO(s.start_time), 'yyyy-MM-dd') === dateKey
                                })
                            } else if (isSick) {
                                // Fallback to live data
                                plannedShiftsForDay = allPlannedShifts.filter(s => {
                                    if (!s.start_time) return false
                                    return format(parseISO(s.start_time), 'yyyy-MM-dd') === dateKey
                                })
                            }

                            if (isSick && plannedShiftsForDay.length > 0) {
                                // Create separate entries for each sick shift
                                plannedShiftsForDay.forEach((shift, idx) => {
                                    const shiftHours = calculateWorkHours(shift.start_time, shift.end_time, shift.type)
                                    const activeId = `abs-${abs.id}-${dateKey}-${idx}`

                                    if (!absenceItems.some(item => item.id === activeId)) {
                                        absenceItems.push({
                                            id: activeId,
                                            absence_id: abs.id,
                                            entry_date: dateKey,
                                            actual_start: shift.start_time, // Use original shift times
                                            actual_end: shift.end_time,
                                            calculated_hours: shiftHours,
                                            absences: abs,
                                            plannedShift: shift, // Store for display
                                            itemType: 'absence'
                                        })
                                    }
                                })
                            } else {
                                // Vacation or no planned shifts - single entry
                                const activeId = `abs-${abs.id}-${dateKey}`
                                if (!absenceItems.some(item => item.id === activeId)) {
                                    absenceItems.push({
                                        id: activeId,
                                        absence_id: abs.id,
                                        entry_date: dateKey,
                                        actual_start: null,
                                        actual_end: null,
                                        calculated_hours: hours,
                                        absences: abs,
                                        itemType: 'absence'
                                    })
                                }
                            }
                        }
                    })
                }
            })
        }

        // 6. Merge DB Entries with virtual absence entries
        // Filter out DB entries that overlap with absences
        const absenceDates = new Set(absenceItems.map(a => a.entry_date))

        // Process DB entries - separate shifts from absences
        const processedDbEntries = dbEntries.filter(e => {
            // 1. ZOMBIE CHECK (Absences)
            if (e.absence_id && e.absences) {
                // Determine Date
                const dateRaw = e.entry_date || e.actual_start
                if (!dateRaw) return false
                const day = new Date(dateRaw)

                // Recalculate hours to see if this day is valid (e.g. not a Holiday for Vacation)
                // Use SSOT Logic
                const validHours = calculateDailyAbsenceHours(day, e.absences, allPlannedShifts, { weekly_hours: weeklyHours })

                // If SSOT says 0 hours, this DB entry is a "Zombie" (historical artifact) and should be hidden
                if (validHours <= 0) return false
            }

            // Keep valid absence entries
            if (e.absence_id) return true

            // Filter out shift entries on absence days
            if (e.shifts) {
                const shiftDate = format(new Date(e.shifts.start_time), 'yyyy-MM-dd')
                return !absenceDates.has(shiftDate)
            }
            return true
        }).map(e => {
            // Determine the sort date
            let sortDate
            if (e.actual_start) {
                sortDate = new Date(e.actual_start)
            } else if (e.entry_date) {
                sortDate = new Date(e.entry_date)
            } else if (e.shifts?.start_time) {
                sortDate = new Date(e.shifts.start_time)
            } else {
                sortDate = new Date()
            }
            return { ...e, sortDate }
        })

        // Add virtual absence entries that don't have DB entries yet
        // Robust check: Filter out if ANY DB entry exists for this absence on this day
        // Check both entry_date and actual_start
        const dbAbsenceDates = new Set()
        dbEntries.filter(e => e.absence_id).forEach(e => {
            if (e.entry_date) dbAbsenceDates.add(`${e.absence_id}-${e.entry_date}`)
            if (e.actual_start) {
                const dateKey = format(new Date(e.actual_start), 'yyyy-MM-dd')
                dbAbsenceDates.add(`${e.absence_id}-${dateKey}`)
            }
        })

        const virtualAbsences = absenceItems.filter(a => {
            const key = `${a.absence_id}-${a.entry_date}`
            return !dbAbsenceDates.has(key)
        }).map(a => ({
            ...a,
            sortDate: new Date(a.entry_date)
        }))

        // Combine and sort
        const allEntries = [...processedDbEntries, ...virtualAbsences]
        const sorted = allEntries
            .filter(e => {
                // Filter to only include entries within the selected month
                const entryDate = e.entry_date || (e.actual_start ? format(new Date(e.actual_start), 'yyyy-MM-dd') : null)
                if (!entryDate) return false
                return entryDate >= format(start, 'yyyy-MM-dd') && entryDate <= format(end, 'yyyy-MM-dd')
            })
            .sort((a, b) => a.sortDate - b.sortDate)

        // Merge TD1+TD2 on same day into single "TD" entry (no handover when same person)
        const merged = []
        const mergedIds = new Set()
        for (const entry of sorted) {
            if (mergedIds.has(entry.id)) continue
            const entryType = entry.shifts?.type?.toUpperCase()
            if (entryType === 'TD1' || entryType === 'TAGDIENST') {
                const entryDate = entry.entry_date || (entry.actual_start ? format(new Date(entry.actual_start), 'yyyy-MM-dd') : null)
                const td2 = sorted.find(e => {
                    if (mergedIds.has(e.id)) return false
                    if (e.shifts?.type?.toUpperCase() !== 'TD2') return false
                    const eDate = e.entry_date || (e.actual_start ? format(new Date(e.actual_start), 'yyyy-MM-dd') : null)
                    return eDate === entryDate
                })
                if (td2) {
                    // Calculate combined hours from shift times (not DB values which may be stale)
                    const combinedStart = entry.actual_start || entry.shifts?.start_time
                    const combinedEnd = td2.actual_end || td2.shifts?.end_time
                    const combinedHours = calculateWorkHours(combinedStart, combinedEnd, 'TD')
                    merged.push({
                        ...entry,
                        shifts: { ...entry.shifts, type: 'TD', start_time: entry.shifts?.start_time, end_time: td2.shifts?.end_time },
                        actual_start: entry.actual_start || entry.shifts?.start_time,
                        actual_end: td2.actual_end || td2.shifts?.end_time,
                        calculated_hours: combinedHours,
                        isMerged: true,
                        mergedIds: [entry.id, td2.id],
                        originalEntries: [entry, td2]
                    })
                    mergedIds.add(entry.id)
                    mergedIds.add(td2.id)
                    continue
                }
            }
            merged.push(entry)
        }

        setEntries(merged)

        // 7. Verify Hash if report exists
        // IMPORTANT: We hash the SNAPSHOT (what was signed), not the live data.
        if (report && report.data_hash && report.original_data_snapshot) {
            const snapshotHash = await generateReportHash(report.original_data_snapshot, selectedUserId, selectedMonth, report.hash_version || 'v1')

            if (snapshotHash === report.data_hash) {
                setVerificationStatus('verified')
            } else {
                setVerificationStatus('tampered')
                console.error('CRITICAL: Report hash mismatch! Database may be corrupted.', {
                    stored: report.data_hash,
                    calculated: snapshotHash
                })
            }
        } else {
            setVerificationStatus('none')
        }

        // 8. Check if live data differs from snapshot (for showing "View Original" button)
        if (report && report.original_data_snapshot) {
            const snapshot = report.original_data_snapshot
            const hasChanges = snapshot.some(snapEntry => {
                const liveEntry = sorted.find(e => e.id === snapEntry.id)
                if (!liveEntry) return true // Entry was deleted

                // For absences: ignore null (snapshot) vs calculated times (live display)
                const isAbsence = !!snapEntry.absence_id
                if (isAbsence) {
                    // Absence times are null in snapshot, calculated in live (just for display)
                    // Only flag as changed if BOTH have real times AND they differ
                    if (snapEntry.actual_start && liveEntry.actual_start) {
                        return snapEntry.actual_start !== liveEntry.actual_start ||
                            snapEntry.actual_end !== liveEntry.actual_end
                    }
                    // null (snapshot) vs "08:00" (live) = no change, just display logic
                    return false
                }

                // For shifts: compare times AND interruptions
                const timesChanged = snapEntry.actual_start !== liveEntry.actual_start ||
                    snapEntry.actual_end !== liveEntry.actual_end

                // Compare interruptions (stringify for deep comparison)
                const snapInts = JSON.stringify(snapEntry.interruptions || [])
                const liveInts = JSON.stringify(liveEntry.interruptions || [])
                const interruptionsChanged = snapInts !== liveInts

                return timesChanged || interruptionsChanged
            })

            if (hasChanges) {
                setVerificationStatus(prev => prev === 'verified' ? 'verified-changed' : prev)
            }
        }

        setLoading(false)

        // Fetch corrections for this month
        const monthStart = startOfMonth(new Date(selectedMonth))
        const { data: corrs } = await supabase
            .from('balance_corrections')
            .select('*, created_by_profile:profiles!balance_corrections_created_by_fkey(full_name, display_name)')
            .eq('user_id', selectedUserId)
            .eq('effective_month', format(monthStart, 'yyyy-MM-dd'))
        setCorrections(corrs || [])
    }

    // Open Correction Modal with current balance calculation
    const handleOpenCorrectionModal = async () => {
        const monthDate = new Date(selectedMonth + '-01')
        const oneYearAgo = new Date(monthDate)
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

        const selectedProfile = users.find(u => u.id === selectedUserId)
        if (!selectedProfile) {
            alert('Benutzer nicht gefunden')
            return
        }

        const GROUP_SHIFT_TYPES = ['FORTBILDUNG', 'EINSCHULUNG', 'MITARBEITERGESPRAECH', 'SONSTIGES', 'TEAM']

        // Fetch all data needed for balance: shifts, interests, TEAM shifts, absences, entries, corrections
        const [shiftsRes, interestsRes, teamShiftsRes, absencesRes, entriesRes, corrsRes] = await Promise.all([
            supabase.from('shifts').select('id, start_time, end_time, type, assigned_to').gte('start_time', oneYearAgo.toISOString()),
            supabase.from('shift_interests').select('shift_id, shifts(*)').eq('user_id', selectedUserId),
            supabase.from('shifts').select('id, start_time, end_time, type').eq('type', 'TEAM').gte('start_time', oneYearAgo.toISOString()),
            supabase.from('absences').select('user_id, start_date, end_date, type, planned_hours, status').eq('user_id', selectedUserId).eq('status', 'genehmigt'),
            supabase.from('time_entries').select('shift_id, calculated_hours, actual_start, actual_end').eq('user_id', selectedUserId),
            supabase.from('balance_corrections').select('user_id, correction_hours, effective_month').eq('user_id', selectedUserId)
        ])

        // Build confirmed shifts using same logic as TimeTracking:
        // 1. Shifts via shift_interests (group shifts always confirmed, others only if sole interested)
        const interestShiftIds = (interestsRes.data || []).map(i => i.shift_id)
        let confirmedFromInterests = []

        if (interestShiftIds.length > 0) {
            const { data: allInterests } = await supabase
                .from('shift_interests')
                .select('shift_id')
                .in('shift_id', interestShiftIds)

            const interestCounts = {}
            allInterests?.forEach(int => {
                interestCounts[int.shift_id] = (interestCounts[int.shift_id] || 0) + 1
            })

            confirmedFromInterests = (interestsRes.data || [])
                .filter(i => {
                    const type = i.shifts?.type?.toUpperCase()
                    if (!type) return false
                    if (GROUP_SHIFT_TYPES.includes(type)) return true
                    return interestCounts[i.shift_id] === 1
                })
                .map(i => i.shifts)
                .filter(Boolean)
        }

        // 2. Shifts via assigned_to (backwards compatibility)
        const assignedShifts = (shiftsRes.data || []).filter(s => s.assigned_to === selectedUserId)

        // 3. TEAM shifts (mandatory for all)
        const teamShifts = teamShiftsRes.data || []

        // Merge all, deduplicate by ID
        const shiftMap = new Map()
        confirmedFromInterests.forEach(s => shiftMap.set(s.id, s))
        assignedShifts.forEach(s => { if (!shiftMap.has(s.id)) shiftMap.set(s.id, s) })
        teamShifts.forEach(s => { if (!shiftMap.has(s.id)) shiftMap.set(s.id, s) })

        const userShifts = Array.from(shiftMap.values()).map(s => ({
            user_id: selectedUserId,
            id: s.id,
            start_time: s.start_time,
            end_time: s.end_time,
            type: s.type
        }))

        // Calculate balance
        const balance = calculateGenericBalance(
            selectedProfile,
            userShifts,
            absencesRes.data || [],
            entriesRes.data || [],
            monthDate,
            corrsRes.data || []
        )

        setCurrentBalance(balance)
        setCorrectionData({ targetTotal: '', reason: '' })
        setShowCorrectionModal(true)
    }

    // Save Balance Correction (new logic: targetTotal instead of direct hours)
    const handleSaveCorrection = async () => {
        const targetTotal = parseFloat(correctionData.targetTotal)
        if (isNaN(targetTotal)) {
            alert('Bitte gültigen Ziel-Übertrag eingeben')
            return
        }
        if (!correctionData.reason.trim()) {
            alert('Bitte Begründung angeben')
            return
        }
        if (!currentBalance) {
            alert('Balance konnte nicht berechnet werden')
            return
        }

        // Calculate the correction needed
        const currentTotal = currentBalance.total
        const correctionHours = targetTotal - currentTotal

        if (Math.abs(correctionHours) < 0.01) {
            alert('Der Ziel-Übertrag entspricht dem aktuellen Wert. Keine Korrektur nötig.')
            return
        }

        const { data: { user } } = await supabase.auth.getUser()
        const monthStart = startOfMonth(new Date(selectedMonth))

        const { error } = await supabase.from('balance_corrections').insert({
            user_id: selectedUserId,
            correction_hours: correctionHours,
            effective_month: format(monthStart, 'yyyy-MM-dd'),
            reason: correctionData.reason.trim(),
            created_by: user?.id
        })

        if (error) {
            alert('Fehler: ' + error.message)
        } else {
            // Log admin action
            await logAdminAction(
                'create_correction',
                selectedUserId,
                'balance_correction',
                null,
                {
                    previous_total: currentTotal,
                    target_total: targetTotal,
                    correction_hours: correctionHours,
                    reason: correctionData.reason
                },
                { month: selectedMonth }
            )

            setShowCorrectionModal(false)
            setCorrectionData({ targetTotal: '', reason: '' })
            setCurrentBalance(null)
            fetchData()
        }
    }

    // Delete Correction
    const handleDeleteCorrection = async (correctionId) => {
        if (!confirm('Korrektur wirklich löschen?')) return

        const before = await fetchBeforeState('balance_corrections', correctionId,
            'id, user_id, correction_hours, effective_month, reason, created_by')

        const { error } = await supabase
            .from('balance_corrections')
            .delete()
            .eq('id', correctionId)

        if (error) {
            alert('Fehler: ' + error.message)
        } else {
            await logAdminAction(
                'balance_correction_deleted',
                before?.user_id || selectedUserId,
                'balance_correction',
                correctionId,
                { before }
            )
            fetchData()
        }
    }

    // --- Actions ---
    const handleFinalizeMonth = async () => {
        if (!userMonthStatus) return
        if (!confirm(`Abschließen?`)) return

        // Get admin name for signature
        const { data: { user: adminUser } } = await supabase.auth.getUser()
        const { data: adminProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', adminUser.id)
            .single()
        const approverName = adminProfile?.full_name || 'Administrator'

        const { error } = await supabase
            .from('monthly_reports')
            .update({
                status: 'genehmigt',
                approved_at: new Date().toISOString(),
                approver_name: approverName
            })
            .eq('id', userMonthStatus.id)

        if (error) {
            alert(error.message)
        } else {
            // Log admin action
            await logAdminAction(
                'approve_report',
                selectedUserId,
                'monthly_report',
                userMonthStatus.id,
                {
                    before: { status: userMonthStatus.status },
                    after: { status: 'genehmigt' }
                },
                { year: userMonthStatus.year, month: userMonthStatus.month }
            )

            generatePDF(true, approverName)
            fetchData()
            fetchUsers()
        }
    }

    const handleReopenMonth = async () => {
        if (!confirm(`Widerrufen?`)) return

        const { error } = await supabase
            .from('monthly_reports')
            .update({ status: 'abgelehnt', rejected_at: new Date().toISOString() })
            .eq('id', userMonthStatus.id)

        if (error) {
            alert(error.message)
        } else {
            // Log admin action
            await logAdminAction(
                'reject_report',
                selectedUserId,
                'monthly_report',
                userMonthStatus.id,
                {
                    before: { status: userMonthStatus.status },
                    after: { status: 'abgelehnt' }
                },
                { year: userMonthStatus.year, month: userMonthStatus.month }
            )

            fetchData()
            fetchUsers()
        }
    }

    const generatePDF = async (official = false, approverNameOverride = null) => {
        let user = users.find(u => u.id === selectedUserId)

        // Fetch full profile data to ensure we have full_name
        if (user) {
            const { data: fullProfile } = await supabase.from('profiles')
                .select('id, full_name, email, weekly_hours')
                .eq('id', selectedUserId)
                .single()
            if (fullProfile) {
                user = { ...user, ...fullProfile }
            }
        }

        // Fetch flex shift IDs for this user
        const { data: flexInterests } = await supabase
            .from('shift_interests')
            .select('shift_id')
            .eq('user_id', selectedUserId)
            .eq('is_flex', true)
        const flexShiftIds = new Set((flexInterests || []).map(f => f.shift_id))

        // PDF Gen needs 'shifts' object usually, we simulate it for Absences to prevent crash
        const pdfEntries = entries.map(e => {
            const withFlex = { ...e, is_flex: flexShiftIds.has(e.shift_id) }
            if (withFlex.shifts) return withFlex
            // Create virtual shift object for absence entries (required by PDF generator)
            const isSick = withFlex.absences?.type === 'Krank' || withFlex.absences?.type === 'Krankenstand'
            return {
                ...withFlex,
                shifts: {
                    start_time: withFlex.actual_start,
                    type: isSick ? 'KRANK' : 'URLAUB'
                }
            }
        })
        const status = official
            ? { ...userMonthStatus, status: 'genehmigt', approved_at: new Date().toISOString(), approver_name: approverNameOverride || userMonthStatus?.approver_name }
            : userMonthStatus

        // Lazy load PDF generator only when needed (saves ~611KB on initial load)
        const { generateTimeReportPDF } = await import('../utils/timeReportPdfGenerator')
        generateTimeReportPDF({
            yearMonth: selectedMonth,
            user: user,
            entries: pdfEntries,
            statusData: status,
            vacationData: null, // TODO: Add vacation data if available
            balanceData: null  // TODO: Add balance data if available
        })
    }


    // --- Helpers (imported from timeTrackingHelpers.js) ---
    const safeFormatDay = (iso) => { try { return format(parseISO(iso), 'EEEE', { locale: de }) } catch { return '' } }


    // Modal Save
    const handleApproveEntry = async () => {
        if (!editingEntry) return

        // Ref Date: use existing actual_start
        const refDate = editingEntry.actual_start
        const startIso = constructIso(refDate, formData.actualStart)
        let endIso = constructIso(refDate, formData.actualEnd)

        // Simple overnight check
        if (startIso && endIso && endIso < startIso) {
            const d = new Date(endIso); d.setDate(d.getDate() + 1); endIso = d.toISOString()
        }

        const finalInts = formData.interruptions.map(i => ({
            start: constructInterruptionIso(refDate, i.start),
            end: constructInterruptionIso(refDate, i.end),
            note: i.note
        }))



        const beforeEntry = {
            actual_start: editingEntry.actual_start,
            actual_end: editingEntry.actual_end,
            interruptions: editingEntry.interruptions,
            calculated_hours: editingEntry.calculated_hours,
            status: editingEntry.status,
            admin_note: editingEntry.admin_note
        }

        const updatePayload = {
            actual_start: startIso, actual_end: endIso, interruptions: finalInts,
            calculated_hours: calculatedHours, status: 'approved', admin_note: formData.adminNote
        }

        const { error, data } = await supabase.from('time_entries').update(updatePayload).eq('id', editingEntry.id).select()

        if (error) {
            alert(error.message)
        } else {
            await logAdminAction(
                'time_entry_approved',
                editingEntry.user_id || selectedUserId,
                'time_entry',
                editingEntry.id,
                { before: beforeEntry, after: updatePayload }
            )
            setEditingEntry(null)
            fetchData()
        }
    }

    // Modal Init & Watch
    useEffect(() => {
        if (editingEntry) {
            setFormData({
                actualStart: safeFormatTime(editingEntry.actual_start),
                actualEnd: safeFormatTime(editingEntry.actual_end),
                interruptions: (editingEntry.interruptions || []).map(i => ({ ...i, start: safeFormatTime(i.start), end: safeFormatTime(i.end) })),
                adminNote: editingEntry.admin_note || ''
            })
        }
    }, [editingEntry])

    useEffect(() => {
        if (editingEntry && formData.actualStart && formData.actualEnd) {
            const refDate = editingEntry.actual_start
            const s = constructIso(refDate, formData.actualStart)
            const e = constructIso(refDate, formData.actualEnd)

            if (s && e) {
                let endIso = e
                if (endIso < s) {
                    const dE = new Date(endIso); dE.setDate(dE.getDate() + 1); endIso = dE.toISOString()
                }

                // Convert interruptions UI (HH:mm) to ISO for calculation
                const liveInterruptions = (formData.interruptions || []).map(int => ({
                    start: constructInterruptionIso(refDate, int.start),
                    end: constructInterruptionIso(refDate, int.end)
                })).filter(i => i.start && i.end)

                const type = editingEntry.shifts ? editingEntry.shifts.type : 'T'
                setCalculatedHours(calculateWorkHours(s, endIso, type, liveInterruptions))
            }
        }
    }, [formData, editingEntry])


    return (
        <div className="p-4 pb-24 max-w-xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Zeitenkontrolle (Admin)</h1>

            {/* Controls */}
            <div className="bg-white p-5 rounded-[1.5rem] border border-gray-100/80 shadow-[0_2px_10px_rgb(0,0,0,0.04)] mb-8">
                <div className="flex flex-col gap-4">

                    {/* 1. Month Picker (Top) */}
                    <div className="flex items-center justify-between bg-gray-50 rounded-xl p-1.5 border border-gray-200 w-full">
                        <button
                            onClick={() => setSelectedMonth(format(subMonths(parseISO(selectedMonth + '-01'), 1), 'yyyy-MM'))}
                            className="p-3 hover:bg-white hover:shadow-md hover:text-black rounded-lg text-gray-500 transition-all active:scale-95 flex-1 flex justify-center"
                        >
                            <ChevronLeft size={20} strokeWidth={2.5} />
                        </button>

                        <span className="font-black text-gray-800 text-lg px-2 capitalize tracking-wide select-none flex-[2] text-center">
                            {format(parseISO(selectedMonth + '-01'), 'MMMM yyyy', { locale: de })}
                        </span>

                        <button
                            onClick={() => setSelectedMonth(format(addMonths(parseISO(selectedMonth + '-01'), 1), 'yyyy-MM'))}
                            className="p-3 hover:bg-white hover:shadow-md hover:text-black rounded-lg text-gray-500 transition-all active:scale-95 flex-1 flex justify-center"
                        >
                            <ChevronRight size={20} strokeWidth={2.5} />
                        </button>
                    </div>

                    {/* 2. Employee List with Status */}
                    {(() => {
                        const statusCounts = users.reduce((acc, u) => {
                            const s = u.monthStatus || 'offen'
                            acc[s] = (acc[s] || 0) + 1
                            return acc
                        }, {})
                        return (
                            <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1 px-1">
                                {statusCounts.offen > 0 && <span className="flex items-center gap-1"><Circle size={10} className="text-gray-400" />{statusCounts.offen} offen</span>}
                                {statusCounts.eingereicht > 0 && <span className="flex items-center gap-1"><FileText size={10} className="text-blue-500" />{statusCounts.eingereicht} eingereicht</span>}
                                {statusCounts.genehmigt > 0 && <span className="flex items-center gap-1"><CheckCircle size={10} className="text-green-500" />{statusCounts.genehmigt} genehmigt</span>}
                                {statusCounts.abgelehnt > 0 && <span className="flex items-center gap-1"><RotateCcw size={10} className="text-red-500" />{statusCounts.abgelehnt} zurückgew.</span>}
                            </div>
                        )
                    })()}
                    <div className="w-full border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                            {users.map(u => {
                                const status = u.monthStatus || 'offen'
                                const isSelected = selectedUserId === u.id
                                return (
                                    <button
                                        key={u.id}
                                        onClick={() => setSelectedUserId(isSelected ? '' : u.id)}
                                        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${isSelected ? 'bg-gray-100 font-bold' : 'hover:bg-gray-50'
                                            }`}
                                    >
                                        <span className="text-sm text-gray-900 truncate">{u.display_name || u.full_name}</span>
                                        {status === 'genehmigt' && (
                                            <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                                <CheckCircle size={12} />genehmigt
                                            </span>
                                        )}
                                        {status === 'eingereicht' && (
                                            <span className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                                <FileText size={12} />eingereicht
                                            </span>
                                        )}
                                        {status === 'abgelehnt' && (
                                            <span className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                                                <RotateCcw size={12} />zurückgew.
                                            </span>
                                        )}
                                        {status === 'offen' && (
                                            <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                                                <Circle size={12} />offen
                                            </span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                </div>
            </div>

            {/* Status */}
            {selectedUserId && userMonthStatus && (
                <div className={`mb-6 p-4 rounded-xl border flex flex-col gap-3 ${userMonthStatus.status === 'genehmigt' ? 'bg-green-50 border-green-200' : userMonthStatus.status === 'eingereicht' ? 'bg-blue-50 border-blue-200' : ''}`}>
                    <div className="flex justify-between items-center">
                        <div className="font-bold uppercase text-xs tracking-wider flex items-center gap-2">
                            {userMonthStatus.status === 'genehmigt' && <CheckCircle className="text-green-600" size={18} />}
                            {userMonthStatus.status === 'eingereicht' && <FileText className="text-blue-600" size={18} />}
                            {userMonthStatus.status}
                        </div>
                        <div className="text-xs text-gray-400">
                            {userMonthStatus.submitted_at && format(parseISO(userMonthStatus.submitted_at), 'dd.MM. HH:mm')}
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        {verificationStatus === 'verified' && (
                            <div className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full border border-green-200">
                                <ShieldCheck size={14} />
                                <span>Signatur Gültig</span>
                            </div>
                        )}
                        {verificationStatus === 'verified-changed' && (
                            <>
                                <div className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full border border-green-200">
                                    <ShieldCheck size={14} />
                                    <span>Signatur Gültig</span>
                                </div>
                                <button
                                    onClick={() => setShowSnapshotModal(true)}
                                    className="flex items-center gap-1 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full border border-blue-200 ml-auto hover:bg-blue-200 transition-colors"
                                    title="Daten wurden nach Signierung geändert"
                                >
                                    <Eye size={14} />
                                    <span>Original anzeigen</span>
                                </button>
                            </>
                        )}
                        {verificationStatus === 'tampered' && (
                            <button
                                onClick={() => setShowSnapshotModal(true)}
                                className="flex items-center gap-1 text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full border border-orange-200 ml-auto hover:bg-orange-200 transition-colors"
                                title="Klicken um Original-Daten anzuzeigen"
                            >
                                <ShieldAlert size={14} />
                                <span>Abweichung (Original zeigen)</span>
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {userMonthStatus.status === 'eingereicht' && <button onClick={handleFinalizeMonth} className="flex-1 bg-black text-white py-2 rounded-lg font-bold">Genehmigen</button>}
                        {userMonthStatus.status === 'eingereicht' && <button onClick={handleReopenMonth} className="px-4 border border-red-200 text-red-600 rounded-lg"><XCircle /></button>}
                        {userMonthStatus.status === 'genehmigt' && <button onClick={() => generatePDF(true)} className="flex-1 border bg-white py-2 rounded-lg font-bold flex justify-center gap-2"><Download size={18} /> PDF</button>}
                    </div>
                </div>
            )}

            {/* List */}
            <div className="space-y-3">
                {entries.map(e => {
                    const isAbsence = !!e.absence_id
                    const isSick = isAbsence && (e.absences?.type === 'Krank' || e.absences?.type === 'Krankenstand')
                    const itemType = isAbsence ? (isSick ? 'Krank' : 'Urlaub') : e.shifts.type
                    const itemDate = e.actual_start || e.entry_date

                    // Get original shift type for sick leave display
                    const originalShiftType = e.plannedShift?.type || null

                    // Check for deviations (only for shifts, not absences)
                    let hasDeviation = false
                    let plannedHours = null
                    if (!isAbsence && e.shifts) {
                        plannedHours = calculateWorkHours(e.shifts.start_time, e.shifts.end_time, e.shifts.type)
                        const hasInterruptions = e.interruptions && e.interruptions.length > 0
                        const timeDifference = Math.abs(e.calculated_hours - plannedHours) > 0.01
                        hasDeviation = hasInterruptions || timeDifference
                    }

                    return (
                        <div key={e.id} className="bg-white p-4 rounded-[1.5rem] border border-gray-100/80 shadow-[0_2px_10px_rgb(0,0,0,0.04)] hover:shadow-[0_4px_20px_rgb(0,0,0,0.06)] transition-all">
                            <div className="flex justify-between items-center mb-2">
                                <div className="font-bold flex items-center gap-2 flex-wrap">
                                    {safeFormatDay(itemDate)} {safeFormatDate(itemDate)}
                                    {!isAbsence && itemType && <span className="text-[10px] uppercase px-1.5 py-0.5 rounded font-bold bg-gray-100 text-gray-600">{itemType}</span>}
                                    {isAbsence && <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded font-bold ${isSick ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{itemType}</span>}
                                    {/* Show original shift type for sick leave */}
                                    {isSick && originalShiftType && (
                                        <span className="text-[10px] text-gray-400">(statt {originalShiftType})</span>
                                    )}
                                    {hasDeviation && (
                                        <span className="text-[10px] uppercase px-1.5 py-0.5 rounded font-bold bg-yellow-100 text-yellow-700 border border-yellow-200">
                                            Abweichung
                                        </span>
                                    )}
                                    {isAbsence && e.absences?.data_hash && (
                                        <span className="flex items-center gap-1 text-[10px] uppercase px-1.5 py-0.5 rounded font-bold bg-green-100 text-green-700 border border-green-200" title={`Signatur Hash: ${e.absences.data_hash}`}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                                            Signiert
                                        </span>
                                    )}
                                </div>
                                <div className="text-gray-500 font-mono text-sm font-bold">
                                    {e.calculated_hours?.toFixed(2)}h
                                    {plannedHours && Math.abs(e.calculated_hours - plannedHours) > 0.01 && (
                                        <div className="text-[10px] text-gray-400 font-normal">
                                            Plan: {plannedHours.toFixed(2)}h
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                                <div className="text-sm font-medium">
                                    {safeFormatTime(e.actual_start)} - {safeFormatTime(e.actual_end)}
                                </div>
                                {!isAbsence && userMonthStatus?.status !== 'genehmigt' && (
                                    <button onClick={() => setEditingEntry(e)} className="text-xs font-bold bg-white border px-3 py-1.5 rounded-md hover:bg-gray-100">
                                        Edit
                                    </button>
                                )}
                            </div>
                            {/* Show interruptions */}
                            {e.interruptions && e.interruptions.length > 0 && (
                                <div className="mt-2 bg-blue-50 p-2 rounded-lg border border-blue-100">
                                    <div className="text-xs font-bold text-blue-700 mb-1">Unterbrechungen:</div>
                                    <div className="flex flex-wrap gap-1">
                                        {e.interruptions.map((int, idx) => {
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
                })}
                {entries.length === 0 && !loading && <div className="text-center text-gray-400 py-10">Keine Einträge für diesen Monat</div>}
                {loading && <div className="text-center text-gray-400 py-10">Lade Daten...</div>}

                {/* Corrections Section */}
                {selectedUserId && corrections.length > 0 && (
                    <div className="mt-4 space-y-2">
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Korrekturen</div>
                        {corrections.map(c => (
                            <div key={c.id} className="bg-purple-50 p-4 rounded-xl border border-purple-200">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <PenTool size={16} className="text-purple-600" />
                                        <span className="font-bold text-purple-800">Korrektur</span>
                                    </div>
                                    <div className={`font-bold font-mono text-lg ${c.correction_hours >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {c.correction_hours > 0 ? '+' : ''}{c.correction_hours}h
                                    </div>
                                </div>
                                <div className="text-sm text-gray-700 bg-white p-2 rounded-lg border border-purple-100 mb-2">
                                    {c.reason}
                                </div>
                                <div className="flex justify-between items-center text-xs text-gray-400">
                                    <span>
                                        {c.created_by_profile?.display_name || c.created_by_profile?.full_name || 'Admin'} • {format(parseISO(c.created_at), 'dd.MM.yyyy HH:mm')}
                                    </span>
                                    <button
                                        onClick={() => handleDeleteCorrection(c.id)}
                                        className="text-red-500 hover:text-red-700 font-bold"
                                    >
                                        Löschen
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add Correction Button - only after approval */}
                {selectedUserId && userMonthStatus?.status === 'genehmigt' && (
                    <button
                        onClick={handleOpenCorrectionModal}
                        className="mt-4 w-full py-3 bg-purple-100 text-purple-700 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-purple-200 transition-colors border border-purple-200"
                    >
                        <PenTool size={18} />
                        Korrektur erstellen
                    </button>
                )}
            </div>


            {/* Correction Modal */}
            {showCorrectionModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-purple-100 rounded-full">
                                <PenTool size={24} className="text-purple-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Übertrag korrigieren</h2>
                                <p className="text-sm text-gray-500">
                                    {format(parseISO(selectedMonth + '-01'), 'MMMM yyyy', { locale: de })}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {/* Current Balance Display */}
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <div className="text-sm text-gray-500 mb-1">Aktueller Übertrag (berechnet)</div>
                                <div className={`text-3xl font-bold ${currentBalance?.total >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {currentBalance?.total > 0 ? '+' : ''}{currentBalance?.total ?? '...'}h
                                </div>
                            </div>

                            {/* Target Input */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">
                                    Korrekter Übertrag laut Buchhaltung
                                </label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={correctionData.targetTotal}
                                    onChange={e => {
                                        const val = e.target.value
                                        if (val === '' || val === '-' || !isNaN(parseFloat(val))) {
                                            setCorrectionData({ ...correctionData, targetTotal: val })
                                        }
                                    }}
                                    className="w-full border-2 border-gray-200 p-3 rounded-xl text-center text-2xl font-bold focus:border-purple-500 focus:outline-none"
                                    placeholder="z.B. -29"
                                />
                            </div>

                            {/* Calculated Difference */}
                            {correctionData.targetTotal !== '' && !isNaN(parseFloat(correctionData.targetTotal)) && currentBalance && (
                                <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
                                    <div className="text-sm text-purple-600 mb-1">Notwendige Korrektur</div>
                                    <div className={`text-2xl font-bold ${(parseFloat(correctionData.targetTotal) - currentBalance.total) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {(parseFloat(correctionData.targetTotal) - currentBalance.total) > 0 ? '+' : ''}
                                        {(parseFloat(correctionData.targetTotal) - currentBalance.total).toFixed(2)}h
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        Wird automatisch berechnet und gespeichert
                                    </div>
                                </div>
                            )}

                            {/* Reason */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Begründung *</label>
                                <textarea
                                    value={correctionData.reason}
                                    onChange={e => setCorrectionData({ ...correctionData, reason: e.target.value })}
                                    className="w-full border-2 border-gray-200 p-3 rounded-xl focus:border-purple-500 focus:outline-none resize-none"
                                    rows={2}
                                    placeholder="z.B. Korrektur nach Buchhaltungsprüfung"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => { setShowCorrectionModal(false); setCorrectionData({ targetTotal: '', reason: '' }); setCurrentBalance(null) }}
                                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                            >
                                Abbrechen
                            </button>
                            <button
                                onClick={handleSaveCorrection}
                                className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors"
                            >
                                Korrektur speichern
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Snapshot Modal */}
            {showSnapshotModal && userMonthStatus && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl">
                        <div className="mb-4">
                            <h2 className="text-xl font-bold">Original Eingereichte Daten</h2>
                            <p className="text-sm text-gray-500">Diese Daten wurden am {format(parseISO(userMonthStatus.submitted_at), 'dd.MM.')} signiert.</p>
                            {verificationStatus === 'verified-changed' && (
                                <div className="mt-2 bg-blue-50 text-blue-800 text-xs p-3 rounded-lg border border-blue-100">
                                    <strong>Audit-Hinweis:</strong> Unten siehst du die Daten, wie sie zum Zeitpunkt der Unterschrift waren. Vergleiche sie mit der aktuellen Liste, um die Änderungen zu finden.
                                </div>
                            )}
                            {verificationStatus === 'tampered' && (
                                <div className="mt-2 bg-red-50 text-red-800 text-xs p-3 rounded-lg border border-red-100 font-bold">
                                    <strong>WARNUNG:</strong> Die Signatur stimmt nicht mit dem Snapshot überein! Die Datenbank wurde möglicherweise manipuliert.
                                </div>
                            )}
                        </div>

                        <div className="space-y-2 text-sm">
                            <div className="grid grid-cols-5 font-bold border-b pb-2 mb-2 text-xs text-gray-500 uppercase tracking-wider">
                                <div>Datum</div>
                                <div>Zeit</div>
                                <div>Std</div>
                                <div>Typ</div>
                                <div>Status</div>
                            </div>
                            {userMonthStatus?.original_data_snapshot?.map(snapEntry => {
                                const liveEntry = entries.find(e => e.id === snapEntry.id)

                                // Determine status
                                let status = 'OK'
                                let statusColor = 'text-gray-400'

                                if (!liveEntry) {
                                    status = 'GELÖSCHT'
                                    statusColor = 'text-red-600 font-bold'
                                } else {
                                    // Logic for 'CHANGED'
                                    let changed = false
                                    // If absence: times in snapshot are null, ignore unless both real
                                    if (snapEntry.absence_id) {
                                        if (snapEntry.actual_start && liveEntry.actual_start) {
                                            changed = snapEntry.actual_start !== liveEntry.actual_start || snapEntry.actual_end !== liveEntry.actual_end
                                        }
                                    } else {
                                        // Standard entry check - times AND interruptions
                                        const timesChanged = snapEntry.actual_start !== liveEntry.actual_start ||
                                            snapEntry.actual_end !== liveEntry.actual_end
                                        const snapInts = JSON.stringify(snapEntry.interruptions || [])
                                        const liveInts = JSON.stringify(liveEntry.interruptions || [])
                                        changed = timesChanged || (snapInts !== liveInts)
                                    }

                                    if (changed) {
                                        status = 'GEÄNDERT'
                                        statusColor = 'text-orange-600 font-bold'
                                    }
                                }

                                const type = snapEntry.shifts?.type || (snapEntry.absence_id ? 'Urlaub' : '?')
                                // Use null-safe formatting for snapshot times
                                const timeRange = snapEntry.actual_start ?
                                    `${safeFormatTime(snapEntry.actual_start)} - ${safeFormatTime(snapEntry.actual_end)}` :
                                    '--:-- - --:--'

                                return (
                                    <div key={snapEntry.id} className={`grid grid-cols-5 items-center py-2 border-b border-gray-50 ${status === 'OK' ? 'opacity-50' : ''}`}>
                                        <div>{safeFormatDate(snapEntry.entry_date || snapEntry.actual_start)}</div>
                                        <div>{timeRange}</div>
                                        <div>{Number(snapEntry.calculated_hours).toFixed(1)}h</div>
                                        <div className="text-xs uppercase">{type}</div>
                                        <div className={`text-[10px] uppercase ${statusColor}`}>{status}</div>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button onClick={() => setShowSnapshotModal(false)} className="bg-gray-100 hover:bg-gray-200 px-5 py-2 rounded-lg font-bold transition-colors">
                                Schließen
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal (Standard) */}
            {editingEntry && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                        <h2 className="text-xl font-bold mb-4">Zeit bearbeiten</h2>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Start</label>
                                    <input type="time" value={formData.actualStart} onChange={e => setFormData({ ...formData, actualStart: e.target.value })} className="w-full bg-gray-50 border p-3 rounded-lg text-lg font-bold text-center" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Ende</label>
                                    <input type="time" value={formData.actualEnd} onChange={e => setFormData({ ...formData, actualEnd: e.target.value })} className="w-full bg-gray-50 border p-3 rounded-lg text-lg font-bold text-center" />
                                </div>
                            </div>

                            {/* Only show interruptions for night shifts */}
                            {editingEntry.shifts?.type && (editingEntry.shifts.type.toUpperCase() === 'ND' || editingEntry.shifts.type.toLowerCase().includes('nacht')) && (
                                <div className="bg-white border rounded-lg p-3 space-y-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase">Unterbrechung Bereitschaftszeit</label>
                                    {formData.interruptions.map((int, idx) => (
                                        <div key={idx} className="bg-gray-50 p-2 rounded text-sm border space-y-1">
                                            <div className="flex gap-2 items-center">
                                                <input type="time" value={int.start} onChange={e => {
                                                    const updated = [...formData.interruptions]
                                                    updated[idx] = { ...updated[idx], start: e.target.value }
                                                    setFormData({ ...formData, interruptions: updated })
                                                }} className="border p-1.5 rounded text-sm text-center bg-white font-mono flex-1" />
                                                <span className="text-gray-300">-</span>
                                                <input type="time" value={int.end} onChange={e => {
                                                    const updated = [...formData.interruptions]
                                                    updated[idx] = { ...updated[idx], end: e.target.value }
                                                    setFormData({ ...formData, interruptions: updated })
                                                }} className="border p-1.5 rounded text-sm text-center bg-white font-mono flex-1" />
                                                <button onClick={() => {
                                                    const ni = [...formData.interruptions]; ni.splice(idx, 1);
                                                    setFormData({ ...formData, interruptions: ni })
                                                }} className="text-red-500 hover:text-red-700 bg-white border rounded p-1"><XCircle size={14} /></button>
                                            </div>
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
                                        </div>
                                    ))}
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
                                                if (formData.newIntStart && formData.newIntEnd && isValidInterruptionTime(formData.newIntStart, formData.newIntEnd)) {
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
                                </div>
                            )}

                            <div className="bg-blue-50 p-3 rounded-lg">
                                <div className="flex justify-between items-center text-blue-900 font-bold">
                                    <span>Berechnet:</span>
                                    <span>{calculatedHours.toFixed(2)}h</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Admin Notiz</label>
                                <textarea value={formData.adminNote} onChange={e => setFormData({ ...formData, adminNote: e.target.value })} className="w-full bg-gray-50 border p-3 rounded-lg text-sm h-20" placeholder="Grund für Änderung..." />
                            </div>
                        </div>

                        <div className="mt-6 flex gap-3">
                            <button onClick={() => setEditingEntry(null)} className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-50 rounded-xl">Abbrechen</button>
                            <button onClick={handleApproveEntry} className="flex-1 py-3 bg-black text-white font-bold rounded-xl shadow-lg hover:bg-gray-800">Speichern</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
