import { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import DayCard from './DayCard'
import MonthView from './MonthView'
import MonthMinimap from './MonthMinimap'
import TeamPanel from './TeamPanel'
import SwapShiftModal from './SwapShiftModal'
import RosterLogModal from './RosterLogModal'
import ConfirmModal from './ConfirmModal'
import AlertModal from './AlertModal'
import SickReportModal from './SickReportModal'
import ActionSheet from './ActionSheet'
import MonthSettingsModal from './MonthSettingsModal'
import { LayoutList, Table as TableIcon, ChevronLeft, ChevronRight, Lock, Unlock, ChevronDown, ChevronUp, Thermometer, FileText, Settings, Calendar } from 'lucide-react'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, getYear, getMonth, subDays, isSameMonth, isValid } from 'date-fns'
import { de } from 'date-fns/locale'
import { useHolidays } from '../hooks/useHolidays'
import { validateShiftRules as importedValidateShiftRules } from '../utils/rosterRules'
import { calculateGenericBalance } from '../utils/balanceHelpers'
import { calculateWorkHours } from '../utils/timeCalculations'
import { getDefaultTimes } from '../utils/shiftDefaults'
import PullToRefresh from './PullToRefresh'
import { downloadICalFile } from '../utils/calendarExport'
import { calculateAllFairnessIndices } from '../utils/fairnessIndex'
import { logAdminAction, fetchBeforeState } from '../utils/adminAudit'
import { debounce } from '../utils/debounce'

export default function RosterFeed({ onCoverageVoteChanged }) {

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
    const allProfilesRef = useRef([])
    const shiftsRef = useRef([])
    const [allShiftsHistory, setAllShiftsHistory] = useState([])
    const [allTeamShiftsHistory, setAllTeamShiftsHistory] = useState([]) // TEAM shifts apply to all employees
    const [allAbsencesHistory, setAllAbsencesHistory] = useState([])
    const [allTimeEntriesHistory, setAllTimeEntriesHistory] = useState([])
    const [allCorrectionsHistory, setAllCorrectionsHistory] = useState([])

    // Coverage system state
    const [coverageRequests, setCoverageRequests] = useState([])
    const [coverageVotes, setCoverageVotes] = useState([])
    const [allFlexHistory, setAllFlexHistory] = useState([])
    const [allCoverageVoteHistory, setAllCoverageVoteHistory] = useState([])

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
        if (allProfs) { setAllProfiles(allProfs); allProfilesRef.current = allProfs }

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

        const { data: myEntries } = await supabase.from('time_entries').select('shift_id, calculated_hours, actual_start, actual_end').eq('user_id', user?.id)
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

        if (shiftData) { setShifts(shiftData); shiftsRef.current = shiftData }

        // Fetch coverage data
        const { data: coverageReqs } = await supabase
            .from('coverage_requests')
            .select('id, shift_id, status, created_at')
            .eq('status', 'open')
        setCoverageRequests(coverageReqs || [])

        const { data: covVotes } = await supabase
            .from('coverage_votes')
            .select('id, shift_id, user_id, was_eligible, responded, availability_preference')
        setCoverageVotes(covVotes || [])

        // Fetch flex history (is_flex interests) for Fairness-Index
        const { data: flexData } = await supabase
            .from('shift_interests')
            .select('user_id, is_flex, shift:shifts(start_time)')
            .eq('is_flex', true)
        setAllFlexHistory(flexData || [])

        // Fetch all coverage vote history for penalty calculation
        const { data: voteHistoryData } = await supabase
            .from('coverage_votes')
            .select('user_id, was_eligible, responded')
        setAllCoverageVoteHistory(voteHistoryData || [])

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

        // === ADMIN ONLY: Fetch all team data for TeamPanel ===
        if (isAdmin) {
            // Fetch all shift interests (to map user_id to shifts)
            const { data: allInterests } = await supabase
                .from('shift_interests')
                .select('user_id, shift:shifts(id, start_time, end_time, type)')

            const shiftsFromInterests = allInterests?.map(i => ({
                user_id: i.user_id,
                id: i.shift?.id,
                start_time: i.shift?.start_time,
                end_time: i.shift?.end_time,
                type: i.shift?.type
            })).filter(s => s.id) || []

            // Fetch shifts with direct assignment
            const { data: directShifts } = await supabase
                .from('shifts')
                .select('id, start_time, end_time, type, assigned_to')
                .not('assigned_to', 'is', null)

            const shiftsFromDirect = directShifts?.map(s => ({
                user_id: s.assigned_to,
                id: s.id,
                start_time: s.start_time,
                end_time: s.end_time,
                type: s.type
            })) || []

            // Merge both sources
            const allHistoryShifts = [...shiftsFromInterests]
            shiftsFromDirect.forEach(s => {
                const exists = allHistoryShifts.some(h => h.id === s.id && h.user_id === s.user_id)
                if (!exists) allHistoryShifts.push(s)
            })
            setAllShiftsHistory(allHistoryShifts)

            // Fetch TEAM shifts (apply to all employees)
            const { data: teamShiftsData } = await supabase
                .from('shifts')
                .select('id, start_time, end_time, type')
                .eq('type', 'TEAM')
            setAllTeamShiftsHistory(teamShiftsData || [])

            // Fetch all absences for team
            const { data: teamAbsences } = await supabase
                .from('absences')
                .select('start_date, end_date, user_id, status, type, planned_hours')
                .eq('status', 'genehmigt')
            setAllAbsencesHistory(teamAbsences || [])

            // Fetch all time entries for team
            const { data: teamEntries } = await supabase
                .from('time_entries')
                .select('user_id, shift_id, calculated_hours, status, actual_start, actual_end')
            setAllTimeEntriesHistory(teamEntries || [])

            // Fetch all corrections for team
            const { data: teamCorrs } = await supabase
                .from('balance_corrections')
                .select('user_id, correction_hours, effective_month')
            setAllCorrectionsHistory(teamCorrs || [])
        }
    }

    useEffect(() => {
        if (!user) return
        fetchData()

        // Unique channel name per user session to avoid conflicts
        const channelName = `roster-updates-${user.id}-${Date.now()}`

        const debouncedFetch = debounce(fetchData, 2000)
        let wasConnected = false

        const channel = supabase
            .channel(channelName)
            // shift_interests: Direct state update for instant UI + instant balance recalc
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_interests' }, (payload) => {
                console.log('[Realtime] shift_interests:', payload.eventType, payload.new || payload.old)
                if (payload.eventType === 'INSERT' && payload.new) {
                    const { shift_id, user_id } = payload.new
                    // Update roster UI
                    setShifts(prev => prev.map(s => {
                        if (s.id !== shift_id) return s
                        if (s.interests?.some(i => i.user_id === user_id)) return s
                        const profile = allProfilesRef.current.find(p => p.id === user_id)
                        return { ...s, interests: [...(s.interests || []), { ...payload.new, user_id, profiles: profile }] }
                    }))
                    // Update balance history (triggers useMemo recalc)
                    setAllShiftsHistory(prev => {
                        if (prev.some(s => s.id === shift_id && s.user_id === user_id)) return prev
                        const shift = shiftsRef.current.find(s => s.id === shift_id)
                        if (!shift) return prev
                        return [...prev, { user_id, id: shift.id, start_time: shift.start_time, end_time: shift.end_time, type: shift.type }]
                    })
                } else if (payload.eventType === 'DELETE' && payload.old) {
                    const { shift_id, user_id, id: interestId } = payload.old
                    console.log('[Realtime] shift_interests DELETE:', { shift_id, user_id, interestId })
                    // Update roster UI
                    setShifts(prev => prev.map(s => {
                        if (shift_id && s.id !== shift_id) return s
                        return { ...s, interests: (s.interests || []).filter(i => {
                            if (user_id && i.user_id === user_id && (!shift_id || s.id === shift_id)) return false
                            if (interestId && i.id === interestId) return false
                            return true
                        })}
                    }))
                    // Update balance history
                    if (shift_id && user_id) {
                        setAllShiftsHistory(prev => prev.filter(s => !(s.id === shift_id && s.user_id === user_id)))
                    }
                }
                // Fallback refetch for edge cases
                debouncedFetch()
            })
            // shifts: Direct state update for instant UI + instant balance recalc
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, (payload) => {
                console.log('[Realtime] shifts:', payload.eventType, payload.new || payload.old)
                if (payload.eventType === 'INSERT' && payload.new) {
                    const newShift = { ...payload.new, interests: [], assigned_profile: null }
                    setShifts(prev => [...prev, newShift].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')))
                    // Add to balance history if directly assigned
                    if (payload.new.assigned_to) {
                        setAllShiftsHistory(prev => [...prev, {
                            user_id: payload.new.assigned_to, id: payload.new.id,
                            start_time: payload.new.start_time, end_time: payload.new.end_time, type: payload.new.type
                        }])
                    }
                    // Add to team shifts history if TEAM type
                    if (payload.new.type === 'TEAM') {
                        setAllTeamShiftsHistory(prev => [...prev, {
                            id: payload.new.id, start_time: payload.new.start_time,
                            end_time: payload.new.end_time, type: payload.new.type
                        }])
                    }
                } else if (payload.eventType === 'UPDATE' && payload.new) {
                    const { interests, assigned_profile, ...tableColumns } = payload.new
                    setShifts(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...tableColumns } : s))
                    // Update in balance history
                    setAllShiftsHistory(prev => prev.map(s => s.id === payload.new.id
                        ? { ...s, start_time: payload.new.start_time, end_time: payload.new.end_time, type: payload.new.type }
                        : s
                    ))
                    setAllTeamShiftsHistory(prev => prev.map(s => s.id === payload.new.id
                        ? { ...s, start_time: payload.new.start_time, end_time: payload.new.end_time, type: payload.new.type }
                        : s
                    ))
                } else if (payload.eventType === 'DELETE' && payload.old) {
                    setShifts(prev => prev.filter(s => s.id !== payload.old.id))
                    setAllShiftsHistory(prev => prev.filter(s => s.id !== payload.old.id))
                    setAllTeamShiftsHistory(prev => prev.filter(s => s.id !== payload.old.id))
                }
                // Fallback refetch for edge cases
                debouncedFetch()
            })
            // Other tables: debounced refetch (change infrequently, complex calculations)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'roster_months' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'absences' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries' }, debouncedFetch)
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    console.log('[Realtime] ✓ Connected to', channelName)
                    if (wasConnected) { console.log('[Realtime] Reconnected — catching up'); fetchData() }
                    wasConnected = true
                }
                if (status === 'CHANNEL_ERROR') console.error('[Realtime] ✗ Channel error:', err)
                if (status === 'TIMED_OUT') console.warn('[Realtime] ⚠ Timed out')
                if (status === 'CLOSED') console.warn('[Realtime] Channel closed')
            })

        // Fallback polling every 30s (Realtime delivers instant updates; this catches missed events)
        const pollInterval = setInterval(debouncedFetch, 30000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(pollInterval)
        }
    }, [currentDate, user, isAdmin])

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

    // Scroll to today's DayCard when the current month is loaded
    useEffect(() => {
        if (!isSameMonth(currentDate, new Date())) return
        const todayStr = format(new Date(), 'yyyy-MM-dd')
        if (!visibleShiftsByDate[todayStr]) return
        requestAnimationFrame(() => {
            const container = document.getElementById('roster-scroll-container')
            const todayEl = document.getElementById(`day-${todayStr}`)
            if (container && todayEl) {
                container.scrollTop = todayEl.offsetTop - 16
            }
        })
    }, [visibleShiftsByDate, currentDate])

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
                        profiles: allProfilesRef.current.find(p => p.id === actingUserId)
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

    // Toggle FLEX status for a shift interest (admin only)
    const toggleFlex = async (shiftId, userId, isFlexValue) => {
        if (!isAdmin) return

        const { error } = await supabase
            .from('shift_interests')
            .update({ is_flex: isFlexValue })
            .eq('shift_id', shiftId)
            .eq('user_id', userId)

        if (error) {
            console.error('Error toggling FLEX:', error)
            setAlertConfig({ isOpen: true, title: 'Fehler', message: error.message, type: 'error' })
        } else {
            // Refresh data to show updated FLEX status
            fetchData()
        }
    }

    // Coverage System: Submit a vote (available/reluctant/emergency_only)
    // NOTE: We only write to coverage_votes here. shift_interests is NOT touched until resolve,
    // so the shift does NOT appear "assigned" while voting is in progress.
    const submitCoverageVote = async (shiftId, preference) => {
        if (!user) return

        if (preference === null) {
            // Remove vote ("Ändern" clicked) - clear preference + responded flag
            await supabase.from('coverage_votes').update({
                responded: false,
                availability_preference: null
            }).match({ shift_id: shiftId, user_id: user.id })
        } else {
            // Record preference in coverage_votes only
            await supabase.from('coverage_votes').update({
                responded: true,
                availability_preference: preference
            }).match({ shift_id: shiftId, user_id: user.id })
        }

        fetchData()
        onCoverageVoteChanged?.()
    }

    // Coverage System: Resolve all open coverage requests greedily
    // Optimizes assignments by prioritizing hardest-to-fill shifts first and distributing shifts among users.
    const resolveAllCoverageRequests = async () => {
        // 1. Get all open coverage requests
        const openRequests = coverageRequests.filter(req => req.status === 'open')
        if (openRequests.length === 0) return

        // 2. Build a list of valid votes
        const validVotes = coverageVotes.filter(v =>
            openRequests.some(req => req.shift_id === v.shift_id) &&
            v.responded &&
            v.availability_preference
        )

        const PREF_ORDER = { available: 0, reluctant: 1, emergency_only: 2 }

        // 3. Evaluate candidate quality for each shift
        const shiftsWithCandidates = openRequests.map(req => {
            const shiftVotes = validVotes.filter(v => v.shift_id === req.shift_id)
            const candidates = shiftVotes.map(v => {
                const fi = fairnessIndices.find(f => f.userId === v.user_id)
                return {
                    userId: v.user_id,
                    preference: v.availability_preference,
                    prefOrder: PREF_ORDER[v.availability_preference] ?? 99,
                    indexTotal: fi?.index?.total || 0,
                }
            }).sort((a, b) => {
                // Best preference first, then lowest Soli-Punkte (least contributed = covers next)
                if (a.prefOrder !== b.prefOrder) return a.prefOrder - b.prefOrder
                return a.indexTotal - b.indexTotal
            })

            // Hardness to fill: worst "best candidate" first. (e.g. reluctant=1 is harder than available=0)
            const bestPref = candidates.length > 0 ? candidates[0].prefOrder : 99
            const numCandidates = candidates.length

            return {
                shiftId: req.shift_id,
                candidates,
                bestPref,
                numCandidates
            }
        })

        // Sort shifts: Hardest to fill first. 
        // 1. Worst bestPref first
        // 2. Fewest number of candidates first
        shiftsWithCandidates.sort((a, b) => {
            if (a.bestPref !== b.bestPref) return b.bestPref - a.bestPref
            return a.numCandidates - b.numCandidates
        })

        // 4. Assign shifts greedily
        const assignedUsersThisBatch = new Set()
        const assignmentsToSave = []

        for (const shiftData of shiftsWithCandidates) {
            let winner = null

            // Try to find the best candidate who hasn't been assigned a shift yet
            for (const candidate of shiftData.candidates) {
                if (!assignedUsersThisBatch.has(candidate.userId)) {
                    winner = candidate
                    break
                }
            }

            // Fallback: if all voted candidates already have a shift, pick the overall best anyway
            if (!winner && shiftData.candidates.length > 0) {
                winner = shiftData.candidates[0]
            }

            if (winner) {
                assignedUsersThisBatch.add(winner.userId)
                assignmentsToSave.push({
                    shiftId: shiftData.shiftId,
                    userId: winner.userId
                })
            }
        }

        if (assignmentsToSave.length === 0) {
            setAlertConfig({ isOpen: true, title: 'Keine Antworten', message: 'Es hat noch niemand abgestimmt.', type: 'info' })
            return
        }

        // 5. Save all assignments to DB via RPC (bypasses RLS so any user can assign others)
        for (const assignment of assignmentsToSave) {
            const { error } = await supabase.rpc('assign_coverage', {
                p_shift_id: assignment.shiftId,
                p_user_id: assignment.userId,
                p_resolved_by: user.id,
            })
            if (error) {
                console.error('assign_coverage RPC failed:', error)
                setAlertConfig({ isOpen: true, title: 'Fehler', message: `Zuweisung fehlgeschlagen: ${error.message}`, type: 'error' })
                return
            }
        }

        setAlertConfig({
            isOpen: true,
            title: 'Dienste besetzt!',
            message: `${assignmentsToSave.length} Dienst(e) ${assignmentsToSave.length > 1 ? 'wurden' : 'wurde'} optimal zugewiesen.`,
            type: 'success'
        })

        fetchData()
        onCoverageVoteChanged?.()
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
            shift.interests?.some(i => i.user_id === user.id) ||
            shift.type === 'TEAM' || // TEAM is mandatory for all employees
            shift.type === 'FORTBILDUNG' // Include FORTBILDUNG if user was participating
        ) || []

        myShifts.forEach(shift => {
            // Use the proper calculation function that handles ND readiness time
            const hours = calculateWorkHours(shift.start_time, shift.end_time, shift.type)
            totalPlannedHours += hours
        })

        // Round to 2 decimal places
        totalPlannedHours = Math.round(totalPlannedHours * 100) / 100

        // Create snapshot of planned shifts (before interests are deleted)
        // This preserves the original shift data for display in TimeTracking
        const plannedShiftsSnapshot = myShifts.map(shift => ({
            id: shift.id,
            type: shift.type,
            start_time: shift.start_time,
            end_time: shift.end_time,
            title: shift.title
        }))

        // 3. Create absence record with planned_hours AND shift snapshot
        const { error: absError } = await supabase.from('absences').insert({
            user_id: user.id,
            start_date: startDate,
            end_date: endDate,
            type: 'Krank',
            status: 'genehmigt',
            planned_hours: totalPlannedHours > 0 ? totalPlannedHours : null,
            planned_shifts_snapshot: plannedShiftsSnapshot.length > 0 ? plannedShiftsSnapshot : null
        })

        if (absError) {
            setAlertConfig({ isOpen: true, title: 'Fehler', message: absError.message, type: 'error' })
            return
        }

        // 4. Now remove user from shifts and mark as urgent via RPC (bypasses RLS)
        const shiftIdsToMarkUrgent = []
        if (shiftsInRange) {

            for (const shift of shiftsInRange) {
                const myInterest = (shift.interests || []).find(i => i.user_id === user.id)
                if (myInterest || shift.assigned_to === user.id) {
                    // Delete interest first
                    if (myInterest) await supabase.from('shift_interests').delete().eq('id', myInterest.id)

                    // Only mark REAL shifts as urgent (TD1, TD2, ND, DBD)
                    // TEAM and FORTBILDUNG don't need coverage - no push notification needed
                    if (shift.type !== 'TEAM' && shift.type !== 'FORTBILDUNG') {
                        shiftIdsToMarkUrgent.push(shift.id)
                    }
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

        // Audit Log: Krankmeldung
        await logAdminAction(
            'sick_report_created',
            user.id,
            'absence',
            null,
            {
                after: {
                    start_date: startDate,
                    end_date: endDate,
                    type: 'Krank',
                    planned_hours: totalPlannedHours,
                    affected_shifts: plannedShiftsSnapshot,
                    shifts_marked_urgent: shiftIdsToMarkUrgent || []
                }
            }
        )

        const hoursMsg = totalPlannedHours > 0
            ? ` (${totalPlannedHours}h geplante Arbeitszeit gespeichert)`
            : ''
        setAlertConfig({ isOpen: true, title: 'Gute Besserung', message: `Krankmeldung erfolgreich. Deine Dienste wurden freigegeben.${hoursMsg}`, type: 'success' })
        fetchData()
    }

    const loadBalanceHistory = async () => {
        if (allShiftsHistory.length > 0) return // already cached
        try {
            const { data: interests, error: intError } = await supabase.from('shift_interests').select('user_id, shift:shifts(id, start_time, end_time, type)')
            if (intError) throw new Error('Interests Error: ' + intError.message)

            const { data: directAssignments, error: dirError } = await supabase.from('shifts').select('id, start_time, end_time, type, assigned_to')
            if (dirError) throw new Error('Direct Error: ' + dirError.message)

            const historyFromInterests = interests?.map(i => ({
                user_id: i.user_id, id: i.shift?.id, start_time: i.shift?.start_time, end_time: i.shift?.end_time, type: i.shift?.type
            })).filter(s => s.start_time) || []

            const historyFromDirect = directAssignments?.filter(s => s.assigned_to).map(s => ({
                user_id: s.assigned_to, id: s.id, start_time: s.start_time, end_time: s.end_time, type: s.type
            })) || []

            const combinedHistory = [...historyFromInterests]
            historyFromDirect.forEach(s => {
                if (!combinedHistory.some(h => h.id === s.id && h.user_id === s.user_id)) combinedHistory.push(s)
            })
            setAllShiftsHistory(combinedHistory)

            const { data: teamShifts } = await supabase.from('shifts').select('id, start_time, end_time, type').eq('type', 'TEAM')
            setAllTeamShiftsHistory(teamShifts || [])

            const { data: absences, error: absError } = await supabase.from('absences').select('start_date, end_date, user_id, status, type, planned_hours').eq('status', 'genehmigt')
            if (absError) throw new Error('Absences Error: ' + absError.message)
            setAllAbsencesHistory(absences || [])

            const { data: allEntries, error: entError } = await supabase.from('time_entries').select('user_id, shift_id, calculated_hours, status, actual_start, actual_end')
            if (entError) throw new Error('Entries Error: ' + entError.message)
            setAllTimeEntriesHistory(allEntries || [])

            const { data: allCorrs } = await supabase.from('balance_corrections').select('user_id, correction_hours, effective_month')
            setAllCorrectionsHistory(allCorrs || [])
        } catch (err) {
            console.error('Balance Load Error', err)
            setAlertConfig({ isOpen: true, title: 'Ladefehler', message: err.message, type: 'error' })
        }
    }

    const toggleBalanceExpand = async () => {
        if (!isBalanceExpanded) await loadBalanceHistory()
        setIsBalanceExpanded(!isBalanceExpanded)
    }

    // Handler for calendar export
    const handleCalendarExport = () => {
        // Get all shifts where user is assigned or has interest (for current month view)
        const myShiftsForMonth = shifts.filter(shift => {
            const isMyInterest = shift.interests?.some(i => i.user_id === user.id)
            const isMyAssignment = shift.assigned_to === user.id
            const isTeamShift = shift.type === 'TEAM'
            return isMyInterest || isMyAssignment || isTeamShift
        })

        if (myShiftsForMonth.length === 0) {
            setAlertConfig({
                isOpen: true,
                title: 'Keine Dienste',
                message: 'Du hast in diesem Monat keine Dienste zum Exportieren.',
                type: 'info'
            })
            return
        }

        const monthName = format(currentDate, 'MMMM-yyyy', { locale: de })
        const userName = allProfiles.find(p => p.id === user.id)?.display_name ||
            allProfiles.find(p => p.id === user.id)?.full_name || ''

        downloadICalFile(myShiftsForMonth, `dienste-${monthName}`, userName)

        setAlertConfig({
            isOpen: true,
            title: 'Kalender exportiert',
            message: `${myShiftsForMonth.length} Dienst${myShiftsForMonth.length > 1 ? 'e' : ''} für ${format(currentDate, 'MMMM yyyy', { locale: de })} exportiert. Öffne die .ics Datei um sie zu deinem Kalender hinzuzufügen.`,
            type: 'success'
        })
    }

    let balance = null
    try {
        balance = calculateGenericBalance(myProfile, allMyShifts, allMyAbsences, allMyTimeEntries, currentDate, allMyCorrections)
    } catch (err) {
        console.error("Error calculating balance:", err)
    }

    // Calculate Fairness-Index for all non-admin users
    const fairnessIndices = useMemo(() => {
        const nonAdminIds = allProfiles.filter(p => p.role !== 'admin').map(p => p.id)
        if (nonAdminIds.length === 0) return []

        // Build balances map
        const balancesMap = {}
        allProfiles.filter(p => p.role !== 'admin').forEach(profile => {
            try {
                const personalShifts = allShiftsHistory.filter(s => s.user_id === profile.id)
                const teamShiftsForUser = allTeamShiftsHistory.map(s => ({ ...s, user_id: profile.id }))
                const userShifts = [...personalShifts]
                teamShiftsForUser.forEach(ts => {
                    if (!userShifts.some(s => s.id === ts.id)) userShifts.push(ts)
                })
                const userAbsences = allAbsencesHistory.filter(a => a.user_id === profile.id)
                const userEntries = allTimeEntriesHistory.filter(e => e.user_id === profile.id)
                const userCorrections = allCorrectionsHistory.filter(c => c.user_id === profile.id)
                const b = calculateGenericBalance(profile, userShifts, userAbsences, userEntries, currentDate, userCorrections)
                if (b) balancesMap[profile.id] = b
            } catch (e) {
                // Skip if balance calc fails
            }
        })

        return calculateAllFairnessIndices(nonAdminIds, allFlexHistory, allCoverageVoteHistory)
    }, [allProfiles, allFlexHistory, allCoverageVoteHistory, allShiftsHistory, allTeamShiftsHistory, allAbsencesHistory, allTimeEntriesHistory, allCorrectionsHistory, currentDate])

    // Year-month key for reliable useMemo dependency comparison
    const yearMonth = format(currentDate, 'yyyy-MM')

    // Calculate team balances for TeamPanel (same logic as mobile "Kollegen Übersicht")
    const teamBalances = useMemo(() => {
        if (!isAdmin) return []

        const results = []
        allProfiles.filter(p => p.role !== 'admin').forEach(profile => {
            // Personal shifts from interests/assignments
            const personalShifts = allShiftsHistory.filter(s => s.user_id === profile.id)
            // Add TEAM shifts for this user (they apply to everyone)
            const teamShiftsForUser = allTeamShiftsHistory.map(s => ({ ...s, user_id: profile.id }))
            // Merge personal + team, avoiding duplicates
            const userShifts = [...personalShifts]
            teamShiftsForUser.forEach(ts => {
                if (!userShifts.some(s => s.id === ts.id)) {
                    userShifts.push(ts)
                }
            })
            const userAbsences = allAbsencesHistory.filter(a => a.user_id === profile.id)
            const userEntries = allTimeEntriesHistory.filter(e => e.user_id === profile.id)
            const userCorrections = allCorrectionsHistory.filter(c => c.user_id === profile.id)
            const b = calculateGenericBalance(profile, userShifts, userAbsences, userEntries, currentDate, userCorrections)

            if (b) {
                results.push({
                    id: profile.id,
                    name: profile.display_name || profile.full_name || profile.email || 'Unbekannt',
                    target: b.target,
                    actual: b.actual + b.vacation,
                    carryover: b.carryover,
                    total: b.total
                })
            }
        })
        return results
    }, [isAdmin, allProfiles, allShiftsHistory, allTeamShiftsHistory, allAbsencesHistory, allTimeEntriesHistory, allCorrectionsHistory, yearMonth, currentDate])

    return (
        <div className="flex flex-1 h-full">
            <div className="flex-1 overflow-hidden">
                <PullToRefresh onRefresh={fetchData}>
                    <div className="min-h-full pb-20">
                        <div className="sticky top-0 bg-white z-10 border-b shadow-sm">
                            {/* Zeile 1: Datumsnavigation + Stundensaldo */}
                            <div className="px-3 pt-2.5 pb-1 flex justify-between items-center">
                                <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                                    <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-1 hover:bg-white rounded-md transition-colors"><ChevronLeft size={18} /></button>
                                    <span className="px-2 font-bold text-sm min-w-[90px] text-center capitalize">{format(currentDate, 'MMM yyyy', { locale: de })}</span>
                                    <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-1 hover:bg-white rounded-md transition-colors"><ChevronRight size={18} /></button>
                                </div>

                                {balance && !isAdmin && (
                                    <button
                                        onClick={toggleBalanceExpand}
                                        className={`px-3 py-1.5 rounded-full text-sm font-bold border transition-colors ${balance.total >= 0
                                            ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100'
                                            : 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'
                                        }`}
                                        title="Stundenkonto anzeigen"
                                    >
                                        {balance.total > 0 ? '+' : ''}{balance.total}h
                                    </button>
                                )}
                            </div>

                            {/* Zeile 2: View-Toggle + Status-Icons */}
                            <div className="px-3 pb-2 flex justify-between items-center">
                                <div className="flex bg-gray-100 rounded-lg p-0.5">
                                    <button onClick={() => setViewMode('cards')} className={`p-1.5 rounded-md transition-all ${viewMode === 'cards' ? 'bg-white shadow text-black' : 'text-gray-400'}`}><LayoutList size={15} /></button>
                                    <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-white shadow text-black' : 'text-gray-400'}`}><TableIcon size={15} /></button>
                                </div>

                                <div className="flex gap-1.5 items-center">
                                    {!isAdmin && (
                                        <button
                                            onClick={handleCalendarExport}
                                            className="p-1.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors border border-blue-100"
                                            title="Dienste in Kalender exportieren"
                                        >
                                            <Calendar size={18} />
                                        </button>
                                    )}

                                    {!isAdmin && (
                                        <button
                                            onClick={() => setIsSickModalOpen(true)}
                                            className="p-1.5 bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition-colors border border-red-100"
                                            title="Krankmelden"
                                        >
                                            <Thermometer size={18} />
                                        </button>
                                    )}

                                    {!isAdmin && (
                                        <div
                                            className={`p-1.5 rounded-full border transition-colors ${isMonthOpen ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}
                                            title={isMonthOpen ? "Dienstplan offen" : "Dienstplan geschlossen"}
                                        >
                                            {isMonthOpen ? <Unlock size={18} /> : <Lock size={18} />}
                                        </div>
                                    )}

                                    {isAdmin && (
                                        <>
                                            {!isMonthOpen && (
                                                <button
                                                    onClick={() => setIsLogModalOpen(true)}
                                                    className="p-1.5 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors border border-gray-200"
                                                    title="Änderungsprotokoll"
                                                >
                                                    <FileText size={18} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setIsSettingsModalOpen(true)}
                                                className={`p-1.5 rounded-full border transition-colors ${isMonthVisible && isMonthOpen
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
                                                <Settings size={18} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
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
                                            <MonthMinimap shifts={shifts} currentDate={currentDate} userId={user.id} absences={allAbsences} />
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
                                                    <div key={dateStr} id={`day-${dateStr}`}>
                                                    <DayCard
                                                        dateStr={dateStr}
                                                        shifts={visibleShiftsByDate[dateStr]}
                                                        userId={user.id}
                                                        isAdmin={isAdmin}
                                                        onToggleInterest={toggleInterest}
                                                        onToggleFlex={toggleFlex}
                                                        onUpdateShift={async (shiftId, newStart, newEnd, newTitle) => {
                                                            if (!isAdmin) return

                                                            const before = await fetchBeforeState('shifts', shiftId,
                                                                'id, start_time, end_time, type, title, assigned_to')

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
                                                                await logAdminAction('shift_updated', before?.assigned_to || null, 'shift', shiftId, {
                                                                    before: { start_time: before?.start_time, end_time: before?.end_time, type: before?.type, title: before?.title },
                                                                    after: updatePayload
                                                                })
                                                                setAlertConfig({ isOpen: true, title: 'Erfolg', message: 'Dienst aktualisiert', type: 'success' })
                                                                fetchData()
                                                            }
                                                        }}
                                                        onDeleteShift={async (shiftId) => {
                                                            if (!isAdmin) return
                                                            if (!window.confirm("Möchtest du diesen Dienst wirklich löschen?")) return
                                                            await supabase.from('shift_interests').delete().eq('shift_id', shiftId)
                                                            const { data: deletedShift, error } = await supabase.from('shifts').delete().eq('id', shiftId).select()
                                                            if (error) {
                                                                setAlertConfig({ isOpen: true, title: 'Fehler', message: error.message, type: 'error' })
                                                            } else {
                                                                // Audit Log
                                                                await logAdminAction('shift_deleted', null, 'shift', shiftId, {
                                                                    deleted: deletedShift?.[0] || { id: shiftId }
                                                                })
                                                                setAlertConfig({ isOpen: true, title: 'Erfolg', message: 'Dienst gelöscht', type: 'success' })
                                                                fetchData()
                                                            }
                                                        }}
                                                        onCreateShift={async (dateStr, type) => {
                                                            if (!isAdmin) return

                                                            // Use the robust utility to get Local Date Objects for start/end
                                                            // This handles rules for ND/TD1/TD2 etc.
                                                            // We pass specific holidays if we had them, otherwise default check.
                                                            const { start, end } = getDefaultTimes(dateStr, type)

                                                            if (!start || !end) {
                                                                setAlertConfig({ isOpen: true, title: 'Fehler', message: 'Konnte Zeiten nicht berechnen.', type: 'error' })
                                                                return
                                                            }

                                                            const { data: newShift, error } = await supabase.from('shifts').insert({
                                                                start_time: start.toISOString(),
                                                                end_time: end.toISOString(),
                                                                type: type
                                                            }).select()

                                                            if (error) {
                                                                setAlertConfig({ isOpen: true, title: 'Fehler', message: error.message, type: 'error' })
                                                            } else {
                                                                // Audit Log
                                                                await logAdminAction('shift_created', null, 'shift', newShift?.[0]?.id, {
                                                                    date: dateStr,
                                                                    type: type,
                                                                    start_time: start.toISOString(),
                                                                    end_time: end.toISOString()
                                                                })
                                                                setAlertConfig({ isOpen: true, title: 'Erfolg', message: 'Dienst erstellt', type: 'success' })
                                                                fetchData()
                                                            }
                                                        }}
                                                        absenceReason={myAbsence}
                                                        absences={dayAbsences}
                                                        holiday={holiday}
                                                        allProfiles={allProfiles}
                                                        coverageRequests={coverageRequests}
                                                        coverageVotes={coverageVotes}
                                                        fairnessIndices={fairnessIndices}
                                                        userBalance={balance}
                                                        onCoverageVote={submitCoverageVote}
                                                        onCoverageResolve={resolveAllCoverageRequests}
                                                    />
                                                    </div>
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
                    </div>
                </PullToRefresh>
            </div>

            {/* Modals rendered outside PullToRefresh to avoid CSS transform breaking fixed positioning */}
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

            {/* Balance Detail Sheet */}
            <ActionSheet isOpen={isBalanceExpanded} onClose={() => setIsBalanceExpanded(false)} title="Mein Stundenkonto">
                {balance && (
                    <>
                        <div className="text-xs text-gray-400 mb-3 uppercase font-bold">{format(currentDate, 'MMMM yyyy', { locale: de })}</div>
                        <div className="grid grid-cols-4 gap-2 text-center mb-4">
                            <div className="bg-gray-50 rounded-lg p-2">
                                <div className="text-[9px] text-gray-400 uppercase font-bold">Soll</div>
                                <div className="font-bold text-sm text-gray-700">{balance.target}h</div>
                            </div>
                            <div className="bg-blue-50 rounded-lg p-2">
                                <div className="text-[9px] text-blue-400 uppercase font-bold">Ist</div>
                                <div className="font-bold text-sm text-blue-700">{balance.actual + balance.vacation}h</div>
                            </div>
                            <div className={`rounded-lg p-2 ${balance.carryover >= 0 ? 'bg-gray-50' : 'bg-red-50'}`}>
                                <div className={`text-[9px] uppercase font-bold ${balance.carryover >= 0 ? 'text-gray-400' : 'text-red-600'}`}>Übertrag</div>
                                <div className={`font-bold text-sm ${balance.carryover >= 0 ? 'text-gray-700' : 'text-red-700'}`}>
                                    {balance.carryover > 0 ? '+' : ''}{balance.carryover}h
                                </div>
                            </div>
                            <div className={`rounded-lg p-2 ${balance.total >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                                <div className={`text-[9px] uppercase font-bold ${balance.total >= 0 ? 'text-green-600' : 'text-red-600'}`}>Gesamt</div>
                                <div className={`font-bold text-sm ${balance.total >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                    {balance.total > 0 ? '+' : ''}{balance.total}h
                                </div>
                            </div>
                        </div>

                        <h4 className="text-xs font-bold text-gray-500 mb-2 uppercase">Kollegen Übersicht</h4>
                        <div className="space-y-2">
                            {allProfiles.filter(p => p.id !== user.id && p.role !== 'admin').map(profile => {
                                const personalShifts = allShiftsHistory.filter(s => s.user_id === profile.id)
                                const teamShiftsForUser = allTeamShiftsHistory.map(s => ({ ...s, user_id: profile.id }))
                                const userShifts = [...personalShifts]
                                teamShiftsForUser.forEach(ts => {
                                    if (!userShifts.some(s => s.id === ts.id)) userShifts.push(ts)
                                })
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
                    </>
                )}
            </ActionSheet>

            {/* TeamPanel (Desktop Only - synchronized with RosterFeed data) */}
            {isAdmin && (
                <TeamPanel
                    balances={teamBalances}
                    currentDate={currentDate}
                    onRefresh={fetchData}
                />
            )}
        </div>
    )
}
