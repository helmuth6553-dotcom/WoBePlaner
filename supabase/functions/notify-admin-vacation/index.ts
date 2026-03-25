// Edge Function: notify-admin-vacation
// Sends push notification to all admins when a vacation request is submitted

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpushNpm from "npm:web-push@3.6.3";

import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        console.log("notify-admin-vacation invoked")

        // Verify caller is authenticated
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Verify JWT and get the calling user
        const userClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )
        const { data: { user }, error: authError } = await userClient.auth.getUser()
        if (authError || !user) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized: Invalid session' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const payload = await req.json()

        const { startDate, endDate } = payload

        if (!startDate || !endDate) {
            console.log("Missing required fields")
            return new Response(
                JSON.stringify({ error: 'Missing required fields: startDate, endDate' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Get userName from DB (don't trust payload)
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single()
        const userName = profile?.full_name || user.email
        console.log(`Vacation request from authenticated user: ${user.id}`)

        // 1. Get all admin users
        const { data: admins, error: adminError } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('role', 'admin')

        if (adminError) {
            console.error("Error fetching admins:", adminError)
            return new Response(
                JSON.stringify({ error: 'Failed to fetch admins' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!admins?.length) {
            console.log("No admins found")
            return new Response(
                JSON.stringify({ message: 'No admins found' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const adminIds = admins.map(a => a.id)
        console.log(`Found ${adminIds.length} admins:`, adminIds)

        // 2. Get push subscriptions for admins
        const { data: subscriptions, error: subError } = await supabaseClient
            .from('push_subscriptions')
            .select('*')
            .in('user_id', adminIds)

        if (subError) {
            console.error("Error fetching subscriptions:", subError)
        }

        if (!subscriptions?.length) {
            console.log("No admin subscriptions found")
            return new Response(
                JSON.stringify({ message: 'No admin subscriptions' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log(`Found ${subscriptions.length} admin subscriptions`)

        // 3. Configure VAPID
        const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
        const vapidPublicKey = Deno.env.get('VITE_VAPID_PUBLIC_KEY')
        const vapidSubject = 'mailto:admin@wobe-team.at'

        if (!vapidPrivateKey || !vapidPublicKey) {
            console.error("VAPID keys missing!")
            return new Response(
                JSON.stringify({ error: 'VAPID configuration missing' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        webpushNpm.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

        // 4. Format notification message
        const formattedStart = startDate.split('-').reverse().slice(0, 2).join('.')
        const formattedEnd = endDate.split('-').reverse().slice(0, 2).join('.')

        const notificationPayload = JSON.stringify({
            title: 'Neuer Urlaubsantrag',
            body: `${userName} beantragt Urlaub vom ${formattedStart} - ${formattedEnd}`,
            url: '/admin?tab=absences',
            tag: 'vacation-request',
            requireInteraction: true
        })

        // 5. Send notifications
        let successCount = 0
        let failCount = 0

        for (const sub of subscriptions) {
            try {
                const pushSub = {
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth
                    }
                }

                await webpushNpm.sendNotification(pushSub, notificationPayload)
                successCount++
                console.log(`Push sent to admin ${sub.user_id}`)
            } catch (err: unknown) {
                failCount++
                const errorMessage = err instanceof Error ? err.message : String(err)
                console.error(`Push failed for ${sub.user_id}:`, errorMessage)

                // Remove invalid subscriptions
                if (errorMessage.includes('410') || errorMessage.includes('expired')) {
                    await supabaseClient
                        .from('push_subscriptions')
                        .delete()
                        .eq('id', sub.id)
                    console.log(`Removed expired subscription ${sub.id}`)
                }
            }
        }

        console.log(`Notifications sent: ${successCount} success, ${failCount} failed`)

        return new Response(
            JSON.stringify({
                message: 'Notifications sent',
                success: successCount,
                failed: failCount
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error("Error:", errorMessage)
        return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
