import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { calculateGenericBalance } from '../utils/balanceHelpers'
import { Users, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react'

/**
 * TeamPanel - Admin-only Right Panel for Desktop
 * Shows all employee balances in a readable, spacious layout
 */
export default function TeamPanel() {
    const [balances, setBalances] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchBalances()

        // Realtime subscription
        const channel = supabase
            .channel('team-panel-' + Date.now())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_interests' }, () => fetchBalances())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => fetchBalances())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'absences' }, () => fetchBalances())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries' }, () => fetchBalances())
            .subscribe()

        const interval = setInterval(fetchBalances, 5000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(interval)
        }
    }, [])

    const fetchBalances = async () => {
        try {
            // Date filter: Only fetch shifts from the last 12 months for balance calculation
            const oneYearAgo = new Date()
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
            oneYearAgo.setDate(1) // Start of month
            const dateFilter = oneYearAgo.toISOString()

            const { data: allProfiles } = await supabase
                .from('profiles')
                .select('id, full_name, display_name, email, role, weekly_hours, start_date, initial_balance')
                .or('is_active.eq.true,is_active.is.null')
                .order('full_name')

            // LOAD BOTH: Direct Assignments AND Shift Interests
            // 1. Direct Assignments (non-TEAM shifts with assigned_to) - last 12 months only
            const { data: allShifts } = await supabase
                .from('shifts')
                .select('id, start_time, end_time, type, assigned_to')
                .not('type', 'eq', 'TEAM')
                .gte('start_time', dateFilter)

            // 1b. TEAM shifts are separate (they apply to all employees) - last 12 months only
            const { data: allTeamShifts } = await supabase
                .from('shifts')
                .select('id, start_time, end_time, type')
                .eq('type', 'TEAM')
                .gte('start_time', dateFilter)

            // 2. Shift Interests (User showed interest and was assigned)
            const { data: allInterests } = await supabase
                .from('shift_interests')
                .select('user_id, shift:shifts(id, start_time, end_time, type)')

            // Build history from BOTH sources
            const historyFromDirect = allShifts?.filter(s => s.assigned_to).map(s => ({
                user_id: s.assigned_to,
                id: s.id,
                start_time: s.start_time,
                end_time: s.end_time,
                type: s.type
            })) || []

            const historyFromInterests = allInterests?.map(i => ({
                user_id: i.user_id,
                id: i.shift?.id,
                start_time: i.shift?.start_time,
                end_time: i.shift?.end_time,
                type: i.shift?.type
            })).filter(s => s.start_time) || []

            // Merge and deduplicate (by shift ID + user ID)
            const allShiftsHistory = [...historyFromDirect]
            historyFromInterests.forEach(s => {
                const exists = allShiftsHistory.some(h => h.id === s.id && h.user_id === s.user_id)
                if (!exists) {
                    allShiftsHistory.push(s)
                }
            })

            // Use the separately fetched TEAM shifts (these apply to ALL employees)
            const teamShifts = (allTeamShifts || []).map(s => ({
                id: s.id,
                start_time: s.start_time,
                end_time: s.end_time,
                type: s.type
            }))

            const { data: allAbsencesHistory } = await supabase
                .from('absences')
                .select('start_date, end_date, user_id, status, type, planned_hours')
                .eq('status', 'genehmigt')

            const { data: allTimeEntriesHistory } = await supabase
                .from('time_entries')
                .select('user_id, shift_id, calculated_hours, status')

            // Fetch all corrections
            const { data: allCorrections } = await supabase
                .from('balance_corrections')
                .select('user_id, correction_hours, effective_month')

            const currentDate = new Date()
            const results = []

            allProfiles?.filter(p => p.role !== 'admin').forEach(profile => {
                // Get personal shifts
                const personalShifts = allShiftsHistory.filter(s => s.user_id === profile.id)

                // Add Team shifts for this user (they apply to everyone)
                const userTeamShifts = teamShifts.map(s => ({ ...s, user_id: profile.id }))

                // Merge personal + team shifts, avoiding duplicates
                const userShifts = [...personalShifts]
                userTeamShifts.forEach(ts => {
                    if (!userShifts.some(s => s.id === ts.id)) {
                        userShifts.push(ts)
                    }
                })

                const userAbsences = (allAbsencesHistory || []).filter(a => a.user_id === profile.id)
                const userEntries = (allTimeEntriesHistory || []).filter(e => e.user_id === profile.id)
                const userCorrections = (allCorrections || []).filter(c => c.user_id === profile.id)

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

            setBalances(results)
        } catch (err) {
            console.error('TeamPanel Error:', err)
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="hidden lg:flex flex-col w-96 h-full bg-gray-50 border-l border-gray-200 p-4">
                <div className="animate-pulse space-y-3">
                    {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-20 bg-gray-200 rounded-lg"></div>)}
                </div>
            </div>
        )
    }

    return (
        <div className="hidden lg:flex flex-col w-96 h-full bg-gray-50 border-l border-gray-200">
            {/* Header */}
            <div className="p-4 bg-white border-b border-gray-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Users size={22} className="text-gray-600" />
                        <h2 className="font-bold text-lg text-gray-800">Team Übersicht</h2>
                    </div>
                    <button
                        onClick={fetchBalances}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        title="Aktualisieren"
                    >
                        <RefreshCw size={18} className="text-gray-500" />
                    </button>
                </div>
                <p className="text-sm text-gray-400 mt-1">{balances.length} Mitarbeiter</p>
            </div>

            {/* Scrollable List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {balances.map(user => {
                    const isPositive = user.total > 0
                    const isNegative = user.total < 0

                    return (
                        <div key={user.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-center mb-3">
                                <span className="font-semibold text-gray-800 truncate text-base" title={user.name}>
                                    {user.name}
                                </span>
                                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold ${isPositive ? 'bg-emerald-100 text-emerald-700' :
                                    isNegative ? 'bg-red-100 text-red-700' :
                                        'bg-gray-100 text-gray-600'
                                    }`}>
                                    {isPositive && <TrendingUp size={18} />}
                                    {isNegative && <TrendingDown size={18} />}
                                    {!isPositive && !isNegative && <Minus size={18} />}
                                    <span className="text-lg">{user.total > 0 ? '+' : ''}{user.total}h</span>
                                </div>
                            </div>

                            <div className="flex justify-between bg-gray-50 rounded-lg p-3">
                                <div className="text-center flex-1">
                                    <div className="text-gray-400 text-xs mb-1">Soll</div>
                                    <div className="font-bold text-gray-700 text-lg">{user.target}h</div>
                                </div>
                                <div className="text-center flex-1 border-x border-gray-200">
                                    <div className="text-blue-400 text-xs mb-1">Ist</div>
                                    <div className="font-bold text-blue-600 text-lg">{user.actual}h</div>
                                </div>
                                <div className="text-center flex-1">
                                    <div className={`text-xs mb-1 ${user.carryover >= 0 ? 'text-gray-400' : 'text-red-400'}`}>Übertrag</div>
                                    <div className={`font-bold text-lg ${user.carryover >= 0 ? 'text-gray-700' : 'text-red-600'}`}>
                                        {user.carryover > 0 ? '+' : ''}{user.carryover}h
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Footer */}
            <div className="p-3 bg-white border-t border-gray-200 text-center">
                <div className="text-xs text-gray-400 uppercase tracking-wider">
                    Live aktualisiert
                </div>
            </div>
        </div>
    )
}
