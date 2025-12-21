// Monthly Closing Reminder - Reminds employees to submit their time entries
// Trigger: Cron job on last day of month at 15:00
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from "npm:web-push@3.6.3"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        console.log("Monthly Closing Reminder - Starting...")

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Get current month/year
        const now = new Date()
        const year = now.getFullYear()
        const month = now.getMonth() + 1 // 1-12

        console.log(`Checking for month: ${year}-${month}`)

        // 1. Get all active non-admin employees
        const { data: employees, error: empError } = await supabaseClient
            .from('profiles')
            .select('id, full_name, display_name')
            .or('role.neq.admin,role.is.null')
            .or('is_active.eq.true,is_active.is.null')

        if (empError) {
            console.error("Error fetching employees:", empError)
            throw empError
        }

        if (!employees?.length) {
            console.log("No employees found")
            return new Response(JSON.stringify({ message: 'No employees' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        console.log(`Found ${employees.length} employees`)

        // 2. Check who already submitted their monthly report
        const { data: reports, error: reportError } = await supabaseClient
            .from('monthly_reports')
            .select('user_id')
            .eq('year', year)
            .eq('month', month)

        if (reportError) {
            console.error("Error fetching reports:", reportError)
        }

        const submittedUserIds = new Set(reports?.map(r => r.user_id) || [])

        // Filter to employees who haven't submitted yet
        const employeesNeedReminder = employees.filter(e => !submittedUserIds.has(e.id))

        if (employeesNeedReminder.length === 0) {
            console.log("All employees have submitted their reports")
            return new Response(JSON.stringify({ message: 'All submitted' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        console.log(`${employeesNeedReminder.length} employees need reminder`)

        // 3. Check preferences - only users with monthly_closing enabled
        const userIds = employeesNeedReminder.map(e => e.id)

        const { data: disabledPrefs } = await supabaseClient
            .from('notification_preferences')
            .select('user_id')
            .in('user_id', userIds)
            .eq('monthly_closing', false)

        const usersWithPrefDisabled = new Set(disabledPrefs?.map(p => p.user_id) || [])

        // Final list: employees who need reminder AND haven't disabled this notification
        const finalUserIds = userIds.filter(uid => !usersWithPrefDisabled.has(uid))

        if (finalUserIds.length === 0) {
            console.log("All remaining users have disabled monthly reminders")
            return new Response(JSON.stringify({ message: 'All disabled' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        console.log(`${finalUserIds.length} users will receive reminder`)

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

        // 5. Send notifications
        const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
        if (!vapidPrivateKey) {
            throw new Error("VAPID_PRIVATE_KEY not set")
        }

        webpush.setVapidDetails(
            'mailto:admin@wobeplaner.app',
            'BPLhlPrMJfoXFoLDvQ06uHLNXkQsofVqafEug1Y8AAZkDpU--i-kVjx1qA3EEgXj79aKfLqhVmpL8XtArMh_gPM',
            vapidPrivateKey
        )

        // German month names
        const monthNames = [
            'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
            'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
        ]
        const monthName = monthNames[month - 1]

        const payload = JSON.stringify({
            title: 'Monat abschließen!',
            body: `Bitte erfasse deine Arbeitszeiten für ${monthName} und schließe den Monat ab.`,
            icon: '/logo2.png',
            data: { url: '/time' }
        })

        const results = await Promise.allSettled(
            subscriptions.map(sub => {
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
