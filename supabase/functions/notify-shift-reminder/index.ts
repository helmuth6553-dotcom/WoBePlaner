// Shift Reminder Notification - Sends push 15 minutes before shift starts
// Trigger: Cron job every 5 minutes
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from "npm:web-push@3.6.3"

import { corsHeaders, verifyCronSecret } from '../_shared/cors.ts'

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authError = verifyCronSecret(req)
        if (authError) return authError

        console.log("Shift Reminder Cron - Starting...")

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Calculate time window: shifts starting in 10-15 minutes
        const now = new Date()
        const in10Min = new Date(now.getTime() + 10 * 60 * 1000)
        const in15Min = new Date(now.getTime() + 15 * 60 * 1000)

        console.log(`Looking for shifts between ${in10Min.toISOString()} and ${in15Min.toISOString()}`)

        // 1. Find shifts starting in 10-15 minutes with their interests
        const { data: upcomingShifts, error: shiftError } = await supabaseClient
            .from('shifts')
            .select(`
                id,
                type,
                start_time,
                end_time,
                interests:shift_interests(user_id)
            `)
            .gte('start_time', in10Min.toISOString())
            .lte('start_time', in15Min.toISOString())

        if (shiftError) {
            console.error("Error fetching shifts:", shiftError)
            throw shiftError
        }

        if (!upcomingShifts?.length) {
            console.log("No upcoming shifts in window")
            return new Response(JSON.stringify({ message: 'No shifts to notify' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        console.log(`Found ${upcomingShifts.length} shifts to process`)

        // 2. Collect all user IDs who have interest in these shifts
        const userIdsToNotify = new Set<string>()
        upcomingShifts.forEach(shift => {
            shift.interests?.forEach((interest: { user_id: string }) => {
                userIdsToNotify.add(interest.user_id)
            })
        })

        if (userIdsToNotify.size === 0) {
            console.log("No users with interests in upcoming shifts")
            return new Response(JSON.stringify({ message: 'No users to notify' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        console.log(`Found ${userIdsToNotify.size} users to potentially notify`)

        // 3. Check preferences - only users with shift_reminder enabled
        const { data: prefs, error: prefError } = await supabaseClient
            .from('notification_preferences')
            .select('user_id')
            .in('user_id', [...userIdsToNotify])
            .eq('shift_reminder', true)

        if (prefError) {
            console.error("Error fetching preferences:", prefError)
        }

        // Users with explicit preference = true, OR no preference record (default = true)
        const usersWithPrefEnabled = new Set(prefs?.map(p => p.user_id) || [])

        // For users without a preference record, we treat shift_reminder as true (default)
        // So we keep all users except those who explicitly disabled it
        const { data: disabledPrefs } = await supabaseClient
            .from('notification_preferences')
            .select('user_id')
            .in('user_id', [...userIdsToNotify])
            .eq('shift_reminder', false)

        const usersWithPrefDisabled = new Set(disabledPrefs?.map(p => p.user_id) || [])

        // Final list: all interested users minus those who disabled
        const finalUserIds = [...userIdsToNotify].filter(uid => !usersWithPrefDisabled.has(uid))

        if (finalUserIds.length === 0) {
            console.log("All users have disabled shift reminders")
            return new Response(JSON.stringify({ message: 'All disabled' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        console.log(`${finalUserIds.length} users have shift_reminder enabled`)

        // 4. Get push subscriptions for these users
        const { data: subscriptions, error: subError } = await supabaseClient
            .from('push_subscriptions')
            .select('*')
            .in('user_id', finalUserIds)

        if (subError || !subscriptions?.length) {
            console.log("No subscriptions found")
            return new Response(JSON.stringify({ message: 'No subscriptions' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        console.log(`Found ${subscriptions.length} push subscriptions`)

        // 5. Prepare and send notifications
        const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
        if (!vapidPrivateKey) {
            throw new Error("VAPID_PRIVATE_KEY not set")
        }

        webpush.setVapidDetails(
            'mailto:admin@wobeplaner.app',
            'BPLhlPrMJfoXFoLDvQ06uHLNXkQsofVqafEug1Y8AAZkDpU--i-kVjx1qA3EEgXj79aKfLqhVmpL8XtArMh_gPM',
            vapidPrivateKey
        )

        // Group shifts by user for personalized messages
        const shiftsByUser: Record<string, typeof upcomingShifts> = {}
        upcomingShifts.forEach(shift => {
            shift.interests?.forEach((interest: { user_id: string }) => {
                if (finalUserIds.includes(interest.user_id)) {
                    if (!shiftsByUser[interest.user_id]) {
                        shiftsByUser[interest.user_id] = []
                    }
                    shiftsByUser[interest.user_id].push(shift)
                }
            })
        })

        const results = await Promise.allSettled(
            subscriptions.map(sub => {
                const userShifts = shiftsByUser[sub.user_id] || []
                if (userShifts.length === 0) return Promise.resolve('skipped')

                const firstShift = userShifts[0]
                const startTime = new Date(firstShift.start_time)
                const timeStr = startTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' })

                const payload = JSON.stringify({
                    title: 'Dienst beginnt bald!',
                    body: `${firstShift.type} startet um ${timeStr}`,
                    icon: '/logo2.png',
                    data: { url: '/roster' }
                })

                return webpush.sendNotification({
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth }
                }, payload)
            })
        )

        const successCount = results.filter(r => r.status === 'fulfilled').length
        console.log(`Sent ${successCount}/${results.length} notifications`)

        return new Response(JSON.stringify({ success: true, sent: successCount }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error("Error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
        })
    }
})
