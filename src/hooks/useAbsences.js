import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabase'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import { expandAbsencesToItems } from '../utils/timeTrackingHelpers'
import { calculateWorkHours, calculateDailyAbsenceHours } from '../utils/timeCalculations'

/**
 * Fetches and expands absences for a user in a given month
 * @param {string} userId - User ID
 * @param {string} selectedMonth - Month in 'yyyy-MM' format
 * @param {Array} plannedShifts - All planned shifts for absence calculation
 * @param {Object} userProfile - User profile with weekly_hours
 * @returns {Object} { absences, absenceItems, loading, error, refetch }
 */
export function useAbsences(userId, selectedMonth, plannedShifts = [], userProfile = null) {
    const [absences, setAbsences] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    // Create a stable key from shift IDs to detect when shifts actually change
    const shiftsKey = useMemo(() => {
        return (plannedShifts || []).map(s => s.id).sort().join(',')
    }, [plannedShifts])

    // Fetch raw absences from DB
    const fetchAbsences = useCallback(async () => {
        if (!userId || !selectedMonth) {
            setLoading(false)
            return
        }

        setLoading(true)
        setError(null)

        try {
            const start = startOfMonth(new Date(selectedMonth + '-01'))
            const end = endOfMonth(new Date(selectedMonth + '-01'))
            const startStr = format(start, 'yyyy-MM-dd')
            const endStr = format(end, 'yyyy-MM-dd')

            // Fetch approved absences that overlap with the month
            const { data: absData, error: absError } = await supabase
                .from('absences')
                .select('start_date, end_date, user_id, status, type, planned_hours, planned_shifts_snapshot, id, reason, note')
                .eq('user_id', userId)
                .eq('status', 'genehmigt')
                .lte('start_date', endStr)
                .gte('end_date', startStr)

            if (absError) throw absError

            setAbsences(absData || [])
        } catch (err) {
            console.error('useAbsences error:', err)
            setError(err)
        } finally {
            setLoading(false)
        }
    }, [userId, selectedMonth])

    useEffect(() => {
        fetchAbsences()
    }, [fetchAbsences])

    // Expand absences into day items - re-calculate when shifts or profile change
    const absenceItems = useMemo(() => {
        if (!absences || absences.length === 0) return []

        const start = startOfMonth(new Date(selectedMonth + '-01'))
        const end = endOfMonth(new Date(selectedMonth + '-01'))

        return expandAbsencesToItems(
            absences,
            start,
            end,
            plannedShifts || [],
            userProfile,
            calculateDailyAbsenceHours,
            calculateWorkHours
        )
    }, [absences, selectedMonth, plannedShifts, userProfile, shiftsKey]) // shiftsKey ensures re-render when shifts change

    return {
        absences,
        absenceItems,
        loading,
        error,
        refetch: fetchAbsences
    }
}
