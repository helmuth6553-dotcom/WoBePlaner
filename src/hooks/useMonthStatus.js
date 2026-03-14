/**
 * useMonthStatus.js - Custom Hook for monthly report status
 * 
 * Fetches the status of a monthly report (draft, submitted, approved)
 * and provides functions to submit/update the month.
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { generateReportHash } from '../utils/security'

/**
 * Fetches monthly report status for a user
 * @param {string} userId - User ID
 * @param {string} selectedMonth - Month in 'yyyy-MM' format
 * @returns {Object} { status, loading, error, submitMonth, refetch }
 */
export function useMonthStatus(userId, selectedMonth) {
    const [status, setStatus] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const fetchStatus = useCallback(async () => {
        if (!userId || !selectedMonth) {
            setLoading(false)
            return
        }

        setLoading(true)
        setError(null)

        try {
            const [year, month] = selectedMonth.split('-').map(Number)

            const { data, error: fetchError } = await supabase
                .from('monthly_reports')
                .select('id, user_id, year, month, status, data_hash, hash_version, submitted_at')
                .eq('user_id', userId)
                .eq('year', year)
                .eq('month', month)
                .maybeSingle()

            if (fetchError) throw fetchError

            setStatus(data || null)
        } catch (err) {
            console.error('useMonthStatus error:', err)
            setError(err)
        } finally {
            setLoading(false)
        }
    }, [userId, selectedMonth])

    useEffect(() => {
        fetchStatus()
    }, [fetchStatus])

    // Submit month for approval
    const submitMonth = useCallback(async (entries, userEmail, password) => {
        try {
            // Re-authenticate for security
            const { error: authError } = await supabase.auth.signInWithPassword({
                email: userEmail,
                password
            })
            if (authError) {
                return { success: false, error: 'Falsches Passwort.' }
            }

            // Generate hash for integrity
            const hash = await generateReportHash(entries, userId, selectedMonth)
            const [year, month] = selectedMonth.split('-').map(Number)

            const { error: insertError } = await supabase
                .from('monthly_reports')
                .insert({
                    user_id: userId,
                    data_hash: hash,
                    hash_version: 'v1',
                    original_data_snapshot: entries,
                    year,
                    month,
                    status: 'eingereicht',
                    submitted_at: new Date().toISOString()
                })

            if (insertError) {
                return { success: false, error: insertError.message }
            }

            await fetchStatus()
            return { success: true }
        } catch (err) {
            console.error('submitMonth error:', err)
            return { success: false, error: err.message }
        }
    }, [userId, selectedMonth, fetchStatus])

    return {
        status,
        loading,
        error,
        refetch: fetchStatus,
        submitMonth,
        isLocked: status?.status === 'eingereicht' || status?.status === 'genehmigt',
        isApproved: status?.status === 'genehmigt'
    }
}
