/**
 * useTimeEntries.js - Custom Hook for fetching time entries
 * 
 * Fetches time entries for a user within a given month,
 * with buffer for handling overnight shifts.
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { startOfMonth, endOfMonth, subDays, addDays, format } from 'date-fns'

/**
 * Fetches time entries for a user in a given month
 * @param {string} userId - User ID
 * @param {string} selectedMonth - Month in 'yyyy-MM' format
 * @returns {Object} { entries, entriesMap, loading, error, refetch, saveEntry }
 */
export function useTimeEntries(userId, selectedMonth) {
    const [entries, setEntries] = useState([])
    const [entriesMap, setEntriesMap] = useState({})
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const fetchEntries = useCallback(async () => {
        if (!userId || !selectedMonth) {
            setLoading(false)
            return
        }

        setLoading(true)
        setError(null)

        try {
            const start = startOfMonth(new Date(selectedMonth + '-01'))
            const end = endOfMonth(new Date(selectedMonth + '-01'))

            // Buffer for overnight shifts spanning month boundaries
            const bufferStart = subDays(start, 7).toISOString()
            const bufferEnd = addDays(end, 7).toISOString()
            const bufferStartDate = format(subDays(start, 7), 'yyyy-MM-dd')
            const bufferEndDate = format(addDays(end, 7), 'yyyy-MM-dd')

            // Parallel queries for performance
            const [shiftEntriesRes, absenceEntriesRes] = await Promise.all([
                // A) Entries linked to shifts (filter by actual_start)
                supabase
                    .from('time_entries')
                    .select('*')
                    .eq('user_id', userId)
                    .gte('actual_start', bufferStart)
                    .lte('actual_start', bufferEnd),
                // B) Entries linked to absences (filter by entry_date)
                supabase
                    .from('time_entries')
                    .select('*')
                    .eq('user_id', userId)
                    .gte('entry_date', bufferStartDate)
                    .lte('entry_date', bufferEndDate)
            ])

            if (shiftEntriesRes.error) throw shiftEntriesRes.error
            if (absenceEntriesRes.error) throw absenceEntriesRes.error

            // Combine and deduplicate
            const allEntries = [
                ...(shiftEntriesRes.data || []),
                ...(absenceEntriesRes.data || [])
            ]

            // Deduplicate by ID
            const entriesById = new Map()
            allEntries.forEach(e => entriesById.set(e.id, e))
            const dedupedEntries = Array.from(entriesById.values())

            setEntries(dedupedEntries)

            // Build map for quick lookup by shift_id or absence_id+date
            const map = {}
            dedupedEntries.forEach(e => {
                if (e.shift_id) {
                    map[e.shift_id] = e
                }
                if (e.absence_id && e.entry_date) {
                    // Key format matches what expandAbsencesToItems generates
                    map[`abs-${e.absence_id}-${e.entry_date}`] = e
                }
            })
            setEntriesMap(map)
        } catch (err) {
            console.error('useTimeEntries error:', err)
            setError(err)
        } finally {
            setLoading(false)
        }
    }, [userId, selectedMonth])

    useEffect(() => {
        fetchEntries()
    }, [fetchEntries])

    // Save/update a time entry
    const saveEntry = useCallback(async (entryData) => {
        try {
            const payload = {
                user_id: userId,
                ...entryData,
                status: 'submitted'
            }

            let result
            if (entryData.id) {
                // Update existing
                result = await supabase
                    .from('time_entries')
                    .update(payload)
                    .eq('id', entryData.id)
                    .select()
            } else {
                // Insert new
                result = await supabase
                    .from('time_entries')
                    .insert(payload)
                    .select()
            }

            if (result.error) throw result.error

            // Optimistic update
            if (result.data?.[0]) {
                const newEntry = result.data[0]
                setEntries(prev => {
                    const idx = prev.findIndex(e => e.id === newEntry.id)
                    if (idx >= 0) {
                        return [...prev.slice(0, idx), newEntry, ...prev.slice(idx + 1)]
                    }
                    return [...prev, newEntry]
                })
            }

            return { success: true, data: result.data?.[0] }
        } catch (err) {
            console.error('saveEntry error:', err)
            return { success: false, error: err }
        }
    }, [userId])

    return {
        entries,
        entriesMap,
        loading,
        error,
        refetch: fetchEntries,
        saveEntry
    }
}
