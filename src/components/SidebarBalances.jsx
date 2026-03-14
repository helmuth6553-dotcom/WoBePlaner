import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { calculateGenericBalance } from '../utils/balanceHelpers'
import { Users } from 'lucide-react'
import { debounce } from '../utils/debounce'

/**
 * SidebarBalances - Admin Widget
 * Shows employee hour balances in the desktop sidebar.
 * Logic copied EXACTLY from RosterFeed.jsx "Kollegen Übersicht"
 */
export default function SidebarBalances() {
    const [balances, setBalances] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        fetchBalances()

        // Realtime subscription for live updates (short debounce to batch rapid changes)
        const debouncedFetch = debounce(fetchBalances, 500)
        let wasConnected = false
        const channel = supabase
            .channel('sidebar-balances')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_interests' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'absences' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, debouncedFetch)
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    if (wasConnected) fetchBalances()
                    wasConnected = true
                }
            })

        return () => { supabase.removeChannel(channel) }
    }, [])

    const fetchBalances = async () => {
        try {
            // Date filter: Only fetch shifts from the last 12 months
            const oneYearAgo = new Date()
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
            oneYearAgo.setDate(1)
            const dateFilter = oneYearAgo.toISOString()

            // 1. Fetch all profiles
            const { data: allProfiles, error: pErr } = await supabase
                .from('profiles')
                .select('id, full_name, display_name, email, role, weekly_hours, start_date, vacation_days_per_year, initial_balance')
                .order('full_name')

            if (pErr) throw pErr

            // 2. Fetch shift history via assignments (last 12 months)
            const { data: allShifts } = await supabase
                .from('shifts')
                .select('id, start_time, end_time, type, assigned_to')
                .not('assigned_to', 'is', null)
                .not('type', 'eq', 'TEAM')
                .gte('start_time', dateFilter)

            // 2b. Fetch TEAM shifts separately (they apply to all employees)
            const { data: allTeamShifts } = await supabase
                .from('shifts')
                .select('id, start_time, end_time, type')
                .eq('type', 'TEAM')
                .gte('start_time', dateFilter)

            const allShiftsHistory = allShifts?.map(s => ({
                user_id: s.assigned_to,
                id: s.id,
                start_time: s.start_time,
                end_time: s.end_time,
                type: s.type
            })) || []

            // 2c. Also fetch shift interests
            const { data: allInterests } = await supabase
                .from('shift_interests')
                .select('user_id, shift:shifts(id, start_time, end_time, type)')

            const historyFromInterests = allInterests?.map(i => ({
                user_id: i.user_id,
                id: i.shift?.id,
                start_time: i.shift?.start_time,
                end_time: i.shift?.end_time,
                type: i.shift?.type
            })).filter(s => s.start_time && new Date(s.start_time) >= oneYearAgo) || []

            // Merge direct assignments and interests
            historyFromInterests.forEach(s => {
                const exists = allShiftsHistory.some(h => h.id === s.id && h.user_id === s.user_id)
                if (!exists) {
                    allShiftsHistory.push(s)
                }
            })

            // Prepare team shifts
            const teamShifts = (allTeamShifts || []).map(s => ({
                id: s.id,
                start_time: s.start_time,
                end_time: s.end_time,
                type: s.type
            }))

            // 3. Fetch absences
            const { data: allAbsencesHistory } = await supabase
                .from('absences')
                .select('user_id, start_date, end_date, type, planned_hours, status')
                .eq('status', 'genehmigt')

            // 4. Fetch time entries
            const { data: allTimeEntriesHistory } = await supabase
                .from('time_entries')
                .select('user_id, shift_id, calculated_hours, status')

            // 5. Fetch corrections
            const { data: allCorrections } = await supabase
                .from('balance_corrections')
                .select('user_id, correction_hours, effective_month')

            // 6. Calculate for each employee
            const currentDate = new Date()
            const results = []

            allProfiles?.filter(p => p.role !== 'admin').forEach(profile => {
                // Personal shifts
                const personalShifts = allShiftsHistory.filter(s => s.user_id === profile.id)

                // Add team shifts for this user
                const userTeamShifts = teamShifts.map(s => ({ ...s, user_id: profile.id }))
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
            console.error('SidebarBalances Error:', err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return <div className="animate-pulse h-32 bg-gray-100 rounded mt-4 mx-4"></div>
    }

    if (error) {
        return <div className="text-xs text-red-500 mx-4 mt-4">Fehler: {error}</div>
    }

    if (balances.length === 0) {
        return <div className="text-xs text-gray-400 mx-4 mt-4">Keine Mitarbeiter gefunden.</div>
    }

    return (
        <div className="mt-2 px-2 flex-1 overflow-y-auto min-h-0">
            <div className="flex items-center gap-2 mb-2 text-gray-500">
                <Users size={14} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Team Salden</span>
            </div>

            <div className="space-y-2">
                {balances.map(user => (
                    <div key={user.id} className="bg-gray-50 rounded-lg p-2 border border-gray-100">
                        <div className="font-medium text-gray-800 text-xs mb-1 truncate" title={user.name}>
                            {user.name}
                        </div>
                        <div className="grid grid-cols-4 gap-0.5 text-center">
                            <div>
                                <div className="text-[8px] text-gray-400 uppercase">Soll</div>
                                <div className="text-[10px] font-bold text-gray-600">{user.target}h</div>
                            </div>
                            <div>
                                <div className="text-[8px] text-blue-400 uppercase">Ist</div>
                                <div className="text-[10px] font-bold text-blue-600">{user.actual}h</div>
                            </div>
                            <div>
                                <div className={`text-[8px] uppercase ${user.carryover >= 0 ? 'text-gray-400' : 'text-red-400'}`}>Übertr.</div>
                                <div className={`text-[10px] font-bold ${user.carryover >= 0 ? 'text-gray-600' : 'text-red-600'}`}>
                                    {user.carryover > 0 ? '+' : ''}{user.carryover}h
                                </div>
                            </div>
                            <div>
                                <div className={`text-[8px] uppercase ${user.total >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>Ges.</div>
                                <div className={`text-[10px] font-bold ${user.total >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {user.total > 0 ? '+' : ''}{user.total}h
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
