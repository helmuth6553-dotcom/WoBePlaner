/**
 * useAbsences.js - Custom Hook for fetching absences
 * 
 * Fetches approved absences for a user within a given month,
 * and expands multi-day absences into individual day items.
 */

import { useState, useEffect, useCallback } from 'react'
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
    const [data, setData] = useState({
        absences: [],      // Raw absences from DB
        absenceItems: []   // Expanded into day items
    })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

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
            const { data: absences, error: absError } = await supabase
                .from('absences')
                .select('start_date, end_date, user_id, status, type, planned_hours, planned_shifts_snapshot, id, reason, note')
                .eq('user_id', userId)
                .eq('status', 'genehmigt')
                .lte('start_date', endStr)
                .gte('end_date', startStr)

            if (absError) throw absError

            // Expand absences into individual day items
            const absenceItems = expandAbsencesToItems(
                absences || [],
                start,
                end,
                plannedShifts,
                userProfile,
                calculateDailyAbsenceHours,
                calculateWorkHours
            )

            setData({
                absences: absences || [],
                absenceItems
            })
        } catch (err) {
            console.error('useAbsences error:', err)
            setError(err)
        } finally {
            setLoading(false)
        }
    }, [userId, selectedMonth, plannedShifts, userProfile])

    useEffect(() => {
        fetchAbsences()
    }, [fetchAbsences])

    return {
        ...data,
        loading,
        error,
        refetch: fetchAbsences
    }
}
