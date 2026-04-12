import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { debounce } from './debounce'

const SICK_SEEN_KEY_PREFIX = 'admin_sick_last_seen_'
const SICK_SEEN_EVENT = 'admin-sick-seen'

function readLastSeen(userId) {
    if (!userId) return null
    try {
        return localStorage.getItem(SICK_SEEN_KEY_PREFIX + userId)
    } catch {
        return null
    }
}

export function markAdminKrankSeen(userId) {
    if (!userId) return
    try {
        localStorage.setItem(SICK_SEEN_KEY_PREFIX + userId, new Date().toISOString())
        window.dispatchEvent(new CustomEvent(SICK_SEEN_EVENT))
    } catch {
        // localStorage disabled — silent fallback
    }
}

export function useAdminBadgeCounts(userId, isAdmin) {
    const [counts, setCounts] = useState({ antraege: 0, krank: 0 })

    const fetchCounts = useCallback(async () => {
        if (!userId || !isAdmin) {
            setCounts({ antraege: 0, krank: 0 })
            return
        }
        try {
            const lastSeen = readLastSeen(userId)

            const antraegeQuery = supabase
                .from('absences')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'beantragt')
                .neq('type', 'Krank')

            let krankQuery = supabase
                .from('absences')
                .select('*', { count: 'exact', head: true })
                .in('type', ['Krank', 'Krankenstand'])
            if (lastSeen) krankQuery = krankQuery.gt('created_at', lastSeen)

            const [antraegeRes, krankRes] = await Promise.all([antraegeQuery, krankQuery])

            setCounts({
                antraege: antraegeRes.count || 0,
                krank: krankRes.count || 0,
            })
        } catch (err) {
            console.error('useAdminBadgeCounts fetch failed:', err)
        }
    }, [userId, isAdmin])

    useEffect(() => {
        if (!userId || !isAdmin) {
            setCounts({ antraege: 0, krank: 0 })
            return
        }

        fetchCounts()

        const debouncedFetch = debounce(fetchCounts, 1000)
        let wasConnected = false
        const channelName = `admin-badge-counts-${Math.random().toString(36).slice(2, 10)}`
        const channel = supabase
            .channel(channelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'absences' }, debouncedFetch)
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    if (wasConnected) fetchCounts()
                    wasConnected = true
                }
            })

        const onSeen = () => fetchCounts()
        window.addEventListener(SICK_SEEN_EVENT, onSeen)

        return () => {
            supabase.removeChannel(channel)
            window.removeEventListener(SICK_SEEN_EVENT, onSeen)
        }
    }, [userId, isAdmin, fetchCounts])

    const markKrankSeen = useCallback(() => {
        markAdminKrankSeen(userId)
    }, [userId])

    return {
        antraege: counts.antraege,
        krank: counts.krank,
        total: counts.antraege + counts.krank,
        markKrankSeen,
    }
}
