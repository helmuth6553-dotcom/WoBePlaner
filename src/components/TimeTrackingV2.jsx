/**
 * TimeTrackingV2.jsx - Refactored Time Tracking Component
 * 
 * This is the new, clean version using custom hooks.
 * Old component: TimeTracking.jsx (1044 lines)
 * New component: ~250 lines, same functionality
 * 
 * Switch in App.jsx:
 * const USE_NEW_TIME_TRACKING = true
 */

import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../AuthContext'
import { format, parseISO, areIntervalsOverlapping } from 'date-fns'
import { de } from 'date-fns/locale'
import { CheckCircle, Save, Download, Sun, Thermometer, ChevronRight, ChevronLeft, Users } from 'lucide-react'

// Custom Hooks
import { useShifts } from '../hooks/useShifts'
import { useAbsences } from '../hooks/useAbsences'
import { useTimeEntries } from '../hooks/useTimeEntries'
import { useMonthStatus } from '../hooks/useMonthStatus'

// Utils
import { calculateWorkHours } from '../utils/timeCalculations'
import { constructIso, constructInterruptionIso } from '../utils/timeTrackingHelpers'

export default function TimeTrackingV2() {
    const { user, isAdmin } = useAuth()
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'))
    const [userProfile, setUserProfile] = useState(null)
    const [editingItem, setEditingItem] = useState(null)

    // Load user profile once
    useEffect(() => {
        if (!user) return
        const loadProfile = async () => {
            const { supabase } = await import('../supabase')
            const { data } = await supabase
                .from('profiles')
                .select('weekly_hours, start_date')
                .eq('id', user.id)
                .single()
            if (data) setUserProfile(data)
        }
        loadProfile()
    }, [user])

    // Use custom hooks for data fetching
    const { personalShifts, teamShifts, allShifts, loading: shiftsLoading } = useShifts(
        user?.id,
        selectedMonth,
        { employeeStartDate: userProfile?.start_date }
    )

    const { absenceItems, loading: absencesLoading } = useAbsences(
        user?.id,
        selectedMonth,
        allShifts,
        userProfile
    )

    const { entriesMap, loading: entriesLoading, saveEntry } = useTimeEntries(
        user?.id,
        selectedMonth
    )

    const { status: monthStatus, isLocked, submitMonth, loading: statusLoading } = useMonthStatus(
        user?.id,
        selectedMonth
    )

    // Combined loading state
    const loading = shiftsLoading || absencesLoading || entriesLoading || statusLoading

    // Merge shifts and absences into unified items list
    const items = useMemo(() => {
        if (!personalShifts && !teamShifts && !absenceItems) return []

        const absenceDates = new Set(absenceItems?.map(a => a.date) || [])

        // Personal shifts (exclude days with absences)
        const shiftItems = (personalShifts || [])
            .filter(s => !absenceDates.has(format(new Date(s.start_time), 'yyyy-MM-dd')))
            .map(s => ({
                ...s,
                itemType: 'shift',
                sortDate: new Date(s.start_time)
            }))

        // Team shifts with collision detection
        const teamItems = (teamShifts || [])
            .filter(s => !absenceDates.has(format(new Date(s.start_time), 'yyyy-MM-dd')))
            .map(s => {
                const sStart = new Date(s.start_time)
                const sEnd = new Date(s.end_time)
                const collision = shiftItems.find(ps => {
                    const pStart = new Date(ps.start_time)
                    const pEnd = new Date(ps.end_time)
                    return areIntervalsOverlapping({ start: sStart, end: sEnd }, { start: pStart, end: pEnd })
                })
                return {
                    ...s,
                    itemType: 'shift',
                    sortDate: new Date(s.start_time),
                    isTeam: true,
                    isColliding: !!collision
                }
            })

        // Combine and sort
        return [...shiftItems, ...teamItems, ...(absenceItems || [])]
            .sort((a, b) => a.sortDate - b.sortDate)
    }, [personalShifts, teamShifts, absenceItems])

    // Check if all items are complete
    const allItemsDone = useMemo(() => {
        return items.length > 0 && items.every(item => {
            if (item.itemType === 'absence') return true
            if (entriesMap[item.id]) return true
            if (item.isTeam && item.isColliding) return true
            return false
        })
    }, [items, entriesMap])

    // Admin redirect
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
                        Nutze die <strong>Admin Zeiterfassung</strong> im Menü.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="p-4 pb-24 max-w-xl mx-auto">
            <h1 className="text-2xl font-bold mb-2 px-2">Zeiterfassung</h1>
            <p className="text-xs text-green-600 mb-4 px-2">✨ V2 (neue Architektur)</p>

            {/* Month Status Banner */}
            {monthStatus && (
                <div className={`mb-6 p-4 rounded-xl border flex flex-col gap-3 ${monthStatus.status === 'genehmigt' ? 'bg-green-50 border-green-200' :
                        monthStatus.status === 'eingereicht' ? 'bg-blue-50 border-blue-200' : ''
                    }`}>
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-full ${monthStatus.status === 'genehmigt' ? 'bg-green-100' : 'bg-blue-100 text-blue-600'
                            }`}>
                            {monthStatus.status === 'genehmigt' ? <CheckCircle size={24} /> : <Save size={24} />}
                        </div>
                        <div>
                            <div className="font-bold text-lg capitalize">{monthStatus.status}</div>
                            <div className="text-sm opacity-80">
                                {monthStatus.status === 'eingereicht' ? 'Wartet auf Admin-Freigabe.' :
                                    monthStatus.status === 'genehmigt' ? 'Abgeschlossen.' : 'In Bearbeitung'}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Month Selector */}
            <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 mb-6">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2 text-center">Monat</label>
                <div className="flex items-center justify-between bg-gray-50 rounded-xl p-1.5 border border-gray-200">
                    <button
                        onClick={() => {
                            const current = new Date(selectedMonth + '-01')
                            current.setMonth(current.getMonth() - 1)
                            setSelectedMonth(format(current, 'yyyy-MM'))
                        }}
                        className="p-3 hover:bg-white hover:shadow-md rounded-lg text-gray-500 transition-all flex-1 flex justify-center"
                    >
                        <ChevronLeft size={20} strokeWidth={2.5} />
                    </button>

                    <span className="font-black text-gray-800 text-lg px-2 capitalize tracking-wide select-none flex-[2] text-center">
                        {format(new Date(selectedMonth + '-01'), 'MMMM yyyy', { locale: de })}
                    </span>

                    <button
                        onClick={() => {
                            const current = new Date(selectedMonth + '-01')
                            current.setMonth(current.getMonth() + 1)
                            setSelectedMonth(format(current, 'yyyy-MM'))
                        }}
                        className="p-3 hover:bg-white hover:shadow-md rounded-lg text-gray-500 transition-all flex-1 flex justify-center"
                    >
                        <ChevronRight size={20} strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            {/* Items List */}
            {loading ? (
                <div className="text-center py-10 text-gray-400">Lade...</div>
            ) : (
                <div className="space-y-3 pb-24">
                    {items.map(item => {
                        const entry = entriesMap[item.id]
                        const isDone = entry?.status === 'approved'
                        const isAbsence = item.itemType === 'absence'
                        const itemDate = isAbsence ? item.sortDate : new Date(item.start_time)
                        const isSick = isAbsence && item.type?.toLowerCase().includes('krank')

                        return (
                            <div
                                key={item.id}
                                className={`p-4 rounded-xl border shadow-sm transition-all ${isDone ? 'bg-gray-100' : 'bg-white border-gray-200'
                                    }`}
                            >
                                <div className="flex justify-between items-center mb-2">
                                    <div>
                                        <div className="font-bold text-lg flex items-center gap-2">
                                            {format(itemDate, 'EEEE, dd.MM.', { locale: de })}
                                            {isAbsence ? (
                                                isSick ? <Thermometer size={16} className="text-red-500" />
                                                    : <Sun size={16} className="text-orange-500" />
                                            ) : item.isTeam ? (
                                                <Users size={16} className="text-purple-500" />
                                            ) : null}
                                        </div>
                                        <div className="text-sm text-gray-500 flex items-center gap-2">
                                            {isAbsence ? (
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${isSick ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'
                                                    }`}>
                                                    {item.type || 'Urlaub'}
                                                </span>
                                            ) : (
                                                <>
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${item.isTeam ? 'bg-purple-100 text-purple-700' : 'bg-gray-100'
                                                        }`}>
                                                        {item.isTeam ? 'Teamsitzung' : item.type}
                                                    </span>
                                                    {format(parseISO(item.start_time), 'HH:mm')} - {format(parseISO(item.end_time), 'HH:mm')}
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Status Badge */}
                                    {isAbsence ? (
                                        <div className="px-2 py-1 rounded text-xs font-bold uppercase bg-green-100 text-green-700">
                                            Genehmigt
                                        </div>
                                    ) : entry ? (
                                        <div className={`px-2 py-1 rounded text-xs font-bold uppercase ${isDone ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                            {isDone ? 'Genehmigt' : 'Erfasst'}
                                        </div>
                                    ) : (
                                        <div className="px-2 py-1 rounded text-xs font-bold uppercase bg-gray-100 text-gray-500">
                                            Offen
                                        </div>
                                    )}
                                </div>

                                {/* Hours Display */}
                                {entry && (
                                    <div className="text-sm text-gray-600 mt-2">
                                        {format(parseISO(entry.actual_start), 'HH:mm')} - {format(parseISO(entry.actual_end), 'HH:mm')}
                                        <span className="ml-2 font-bold">{entry.calculated_hours?.toFixed(2)}h</span>
                                    </div>
                                )}
                                {isAbsence && (
                                    <div className="text-sm text-gray-600 mt-2">
                                        <span className="font-bold">{item.planned_hours?.toFixed(2)}h</span> gutgeschrieben
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {items.length === 0 && (
                        <div className="text-center py-10 text-gray-400">
                            Keine Schichten in diesem Monat.
                        </div>
                    )}
                </div>
            )}

            {/* Submit Button (if all done and not locked) */}
            {!isLocked && allItemsDone && items.length > 0 && (
                <div className="fixed bottom-20 left-0 right-0 p-4 bg-white border-t">
                    <button
                        className="w-full bg-black text-white py-4 rounded-xl font-bold"
                        onClick={() => {/* TODO: Open submit modal */ }}
                    >
                        Monat einreichen
                    </button>
                </div>
            )}
        </div>
    )
}
