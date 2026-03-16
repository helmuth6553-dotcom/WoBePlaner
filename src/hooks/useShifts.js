/**
 * useShifts.js - Custom Hook for fetching shifts
 * 
 * Fetches personal shifts (via interests + direct assignments) and team shifts
 * for a given user and month.
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { startOfMonth, endOfMonth } from 'date-fns'
import { filterShiftsByStartDate } from '../utils/timeTrackingHelpers'

// Shift types that support multiple participants (group events)
// These are confirmed as soon as the user is registered, regardless of interest count
const GROUP_SHIFT_TYPES = ['FORTBILDUNG', 'EINSCHULUNG', 'MITARBEITERGESPRAECH', 'SONSTIGES', 'TEAM']

/**
 * Fetches all shifts for a user in a given month
 * @param {string} userId - User ID
 * @param {string} selectedMonth - Month in 'yyyy-MM' format
 * @param {Object} options - Optional configuration
 * @param {Date} options.employeeStartDate - Filter shifts before this date
 * @returns {Object} { personalShifts, teamShifts, allShifts, loading, error, refetch }
 */
export function useShifts(userId, selectedMonth, options = {}) {
    const [data, setData] = useState({
        personalShifts: [],
        teamShifts: [],
        allShifts: []
    })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const fetchShifts = useCallback(async () => {
        if (!userId || !selectedMonth) {
            setLoading(false)
            return
        }

        setLoading(true)
        setError(null)

        try {
            const start = startOfMonth(new Date(selectedMonth + '-01'))
            const end = endOfMonth(new Date(selectedMonth + '-01'))
            const startIso = start.toISOString()
            const endIso = end.toISOString()

            // 1. Get shifts via interests (confirmed when only 1 person interested)
            const { data: myInterests, error: interestError } = await supabase
                .from('shift_interests')
                .select('shift_id, shifts(*)')
                .eq('user_id', userId)

            if (interestError) throw interestError

            // Filter to shifts within the selected month
            const monthInterests = myInterests?.filter(i => {
                if (!i.shifts?.start_time) return false
                const shiftDate = new Date(i.shifts.start_time)
                return shiftDate >= start && shiftDate <= end
            }) || []

            const shiftIds = monthInterests.map(i => i.shift_id)
            let confirmedShifts = []

            if (shiftIds.length > 0) {
                // Get interest counts
                const { data: allInterests } = await supabase
                    .from('shift_interests')
                    .select('shift_id')
                    .in('shift_id', shiftIds)

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

            // 2. Get directly assigned shifts (backwards compatibility)
            const { data: assignments } = await supabase
                .from('shifts')
                .select('*')
                .eq('assigned_to', userId)
                .gte('start_time', startIso)
                .lte('start_time', endIso)

            // Merge, avoiding duplicates
            const allPersonalShifts = [...confirmedShifts]
            assignments?.forEach(a => {
                if (!allPersonalShifts.some(s => s.id === a.id)) {
                    allPersonalShifts.push(a)
                }
            })

            // 3. Get TEAM shifts (mandatory for everyone)
            const { data: teamShifts } = await supabase
                .from('shifts')
                .select('*')
                .eq('type', 'TEAM')
                .gte('start_time', startIso)
                .lte('start_time', endIso)

            // 4. Filter by employee start date if provided
            const effectiveStartDate = options.employeeStartDate
                ? new Date(options.employeeStartDate)
                : null

            const filteredPersonal = filterShiftsByStartDate(allPersonalShifts, effectiveStartDate)
            const filteredTeam = filterShiftsByStartDate(teamShifts || [], effectiveStartDate)

            // 5. Combine all shifts (deduplicated)
            const allShiftsMap = new Map()
            filteredPersonal.forEach(s => allShiftsMap.set(s.id, s))
            filteredTeam.forEach(s => allShiftsMap.set(s.id, s))

            setData({
                personalShifts: filteredPersonal,
                teamShifts: filteredTeam,
                allShifts: Array.from(allShiftsMap.values())
            })
        } catch (err) {
            console.error('useShifts error:', err)
            setError(err)
        } finally {
            setLoading(false)
        }
    }, [userId, selectedMonth, options.employeeStartDate])

    useEffect(() => {
        fetchShifts()
    }, [fetchShifts])

    return {
        ...data,
        loading,
        error,
        refetch: fetchShifts
    }
}
