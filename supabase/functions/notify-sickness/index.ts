// Deno-native WebPush implementation to verify push notifications without 'web-push' library issues.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as base64url from "https://deno.land/std@0.170.0/encoding/base64url.ts";

// Minimal JWT implementation for VAPID
async function signVapidJwt(aud: string, subject: string, privateKey: string) {
    const header = { typ: "JWT", alg: "ES256" };
    const claims = {
        aud,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: subject,
    };

    const encodedHeader = base64url.encode(JSON.stringify(header));
    const encodedClaims = base64url.encode(JSON.stringify(claims));
    const data = new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`);

    const key = await importKey(privateKey);
    const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        key,
        data
    );

    return `${encodedHeader}.${encodedClaims}.${base64url.encode(signature)}`;
}

async function importKey(b64url: string): Promise<CryptoKey> {
    const binary = base64url.decode(b64url);
    return await crypto.subtle.importKey(
        "jwk",
        {
            kty: "EC",
            crv: "P-256",
            d: base64url.encode(binary),
            x: "", // Not needed for private key import usually, or derived
            y: "",
            ext: true,
        },
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"]
    );
}

// NOTE: Sending raw Web Push in Deno requires manually constructing the encryption (AES-128-GCM or AESGCM).
// That is extremely complex to do from scratch without a library.
// Instead of rewriting the entire encryption logic, we can try a different library or version.
// 'web-push' relies on Node 'crypto' which is hard to polyfill perfectly.

// ALTERNATIVE: Use 'web-push' but a version that works with Deno?
// The error suggests an issue with 'util' and 'jws' polyfills.

// PLAN B: Use a simple fetch to a notification service OR try a different import for web-push.
// Let's try importing web-push from a different CDN that might bundle differently, or use 'node-web-push' compatible with Deno.

import webpush from "https://esm.sh/web-push@3.6.3?bundle"
// Adding ?bundle sometimes helps with Node polyfills in Deno.

// If that fails, we will have to look at another library. 
// However, the error "TypeError: Object prototype may only be an Object or null: undefined" comes from 'inherits' in 'util'.

// Fix:
// Use a lightweight detailed logger instead to trace.
// Actually, let's try a different approach:
// We will just verify if we can send a simple payload, or if the library import itself is crashing (it seems to be crashing at boot).

// Let's try to use the library 'web-push' from a skypack or other source?
// No, the reliable way is to use 'djwt' for VAPID and simple fetch? No, payload encryption is hard.

// Let's try 'web-push' 3.5.0 which might have fewer issues, or use the 'deno-web-push' port if one exists.
// There isn't a widely maintained deno-only web-push.

// Let's try fixing the import first by adding the node std library polyfills explicitly if needed,
// but Supabase Edge Functions provide Deno processing.

// Revised Plan: Use `npm:web-push` specifier if supported by Supabase Edge Functions (it is supported in newer versions).
// If not, we will try to downgrade or change the import.

// Let's assume Supabase supports npm specifiers now (it does).
import webpushNpm from "npm:web-push@3.6.3";

import { corsHeaders, verifyCronSecret } from '../_shared/cors.ts'

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authError = verifyCronSecret(req)
        if (authError) return authError

        // Check if we are crashing before even starting
        console.log("Function invoked - v2.0")

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const payload = await req.json()
        console.log("Payload received:", JSON.stringify(payload)) // Log the entire payload

        const record = payload.record

        if (!record || payload.table !== 'absences') {
            console.log("Ignored: Not absences table or no record", payload.table)
            return new Response(JSON.stringify({ message: 'Ignored' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // Only notify if Sick
        console.log("Checking record type:", record.type)
        if (record.type !== 'Krank' && record.type !== 'Krankenstand') {
            console.log("Ignored: Type is not Sick")
            return new Response(JSON.stringify({ message: 'Ignored: Type' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // Read shifts to cover directly from the absence snapshot — deterministic, no race with mark_shifts_urgent.
        // Filter matches RosterFeed.jsx: TEAM/FORTBILDUNG need no coverage.
        const snapshotShifts = (record.planned_shifts_snapshot || [])
            .filter((s: any) => s && s.type !== 'TEAM' && s.type !== 'FORTBILDUNG')

        if (snapshotShifts.length === 0) {
            console.log("No shifts to cover — skipping push.")
            return new Response(JSON.stringify({ message: 'No shifts to cover' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        const sickUserId = record.user_id
        console.log("Fetching subscriptions for colleagues of:", sickUserId)

        // 1. Find colleagues who are already absent (Vacation, Sick, etc.) during this period
        // Logic: absence.start <= sick.end AND absence.end >= sick.start
        const { data: absentColleagues, error: absenceError } = await supabaseClient
            .from('absences')
            .select('user_id')
            .eq('status', 'genehmigt')
            .lte('start_date', record.end_date)
            .gte('end_date', record.start_date)

        if (absenceError) {
            console.error("Error fetching absent colleagues:", absenceError)
        }

        const excludedUserIds = new Set([sickUserId])
        if (absentColleagues) {
            absentColleagues.forEach(a => excludedUserIds.add(a.user_id))
        }

        console.log(`Excluding ${excludedUserIds.size} users (Sick/Absent):`, [...excludedUserIds])

        // 2. Fetch all subscriptions and filter in memory (safest for small user counts)
        const { data: allSubscriptions, error: subError } = await supabaseClient
            .from('push_subscriptions')
            .select('*')

        if (subError) {
            console.error("DB Error fetching subs:", subError)
        }

        // Filter out excluded users (sick/absent)
        const eligibleSubscriptions = allSubscriptions?.filter(sub => !excludedUserIds.has(sub.user_id)) || []

        // 2b. NEW: Check notification preferences - only include users with sick_alert enabled
        const eligibleUserIds = eligibleSubscriptions.map(s => s.user_id)
        const { data: disabledPrefs } = await supabaseClient
            .from('notification_preferences')
            .select('user_id')
            .in('user_id', eligibleUserIds)
            .eq('sick_alert', false)

        const usersWithSickAlertDisabled = new Set(disabledPrefs?.map(p => p.user_id) || [])

        // Final filter: exclude users who disabled sick_alert (default is true if no preference record)
        const subscriptions = eligibleSubscriptions.filter(sub => !usersWithSickAlertDisabled.has(sub.user_id))

        console.log(`After preference filter: ${subscriptions.length} subscriptions (${usersWithSickAlertDisabled.size} disabled sick_alert)`)

        // === COVERAGE SYSTEM: Create coverage records for urgent shifts ===
        // Find shifts that were marked urgent by this sick report
        const { data: urgentShifts } = await supabaseClient
            .from('shifts')
            .select('id, type, start_time, end_time')
            .not('urgent_since', 'is', null)
            .gte('start_time', record.start_date + 'T00:00:00')
            .lte('start_time', record.end_date + 'T23:59:59')

        console.log(`Found ${urgentShifts?.length || 0} urgent shifts for coverage records`)

        // Get unique eligible user IDs from subscriptions
        const coverageEligibleUserIds = [...new Set(subscriptions.map(s => s.user_id))]

        // Create coverage_requests and coverage_votes for each urgent shift
        if (urgentShifts?.length) {
            for (const shift of urgentShifts) {
                // Create coverage request
                await supabaseClient.from('coverage_requests').upsert({
                    shift_id: shift.id,
                    status: 'open',
                }, { onConflict: 'shift_id' })

                // Create coverage_votes for each eligible user
                const voteRecords = coverageEligibleUserIds.map(uid => ({
                    shift_id: shift.id,
                    user_id: uid,
                    was_eligible: true,
                    responded: false,
                }))

                if (voteRecords.length > 0) {
                    await supabaseClient.from('coverage_votes').upsert(
                        voteRecords,
                        { onConflict: 'shift_id, user_id' }
                    )
                }
            }
            console.log(`Created coverage records for ${urgentShifts.length} shifts, ${coverageEligibleUserIds.length} eligible users`)
        }

        // === Calculate per-user flex counts for personalized push ===
        const { data: flexData } = await supabaseClient
            .from('shift_interests')
            .select('user_id')
            .eq('is_flex', true)

        const flexCounts: Record<string, number> = {}
        coverageEligibleUserIds.forEach(id => { flexCounts[id] = 0 })
        flexData?.forEach((f: any) => {
            if (flexCounts[f.user_id] !== undefined) flexCounts[f.user_id]++
        })

        const totalFlex = Object.values(flexCounts).reduce((sum: number, c: number) => sum + c, 0)
        const teamAvgFlex = coverageEligibleUserIds.length > 0 ? (totalFlex / coverageEligibleUserIds.length).toFixed(1) : '0'

        // Determine shift type text for push — list unique types (e.g. "TD1 + ND"), short form.
        const uniqueTypes = [...new Set(snapshotShifts.map((s: any) => s.type))]
        const shiftTypeText = uniqueTypes.join(' + ')

        if (!subscriptions?.length) {
            console.log("No subscriptions found to notify.")
            return new Response(JSON.stringify({ message: 'No subs' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        console.log(`Found ${subscriptions.length} subscriptions. Preparing to send...`)


        const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
        if (!vapidPrivateKey) {
            console.error("VAPID Key missing!")
            throw new Error("No VAPID Key");
        }

        webpushNpm.setVapidDetails(
            'mailto:admin@wobeplaner.app',
            'BPLhlPrMJfoXFoLDvQ06uHLNXkQsofVqafEug1Y8AAZkDpU--i-kVjx1qA3EEgXj79aKfLqhVmpL8XtArMh_gPM',
            vapidPrivateKey
        )

        // Format date to DD.MM. or range
        const [sYear, sMonth, sDay] = record.start_date.split('-');
        const [eYear, eMonth, eDay] = record.end_date.split('-');

        let dateText = `${sDay}.${sMonth}.`;
        if (record.start_date !== record.end_date) {
            dateText = `${sDay}.${sMonth}. - ${eDay}.${eMonth}.`;
        }

        const notificationPayload = JSON.stringify({
            title: 'Dienstausfall!',
            body: `Kannst du im Zeitraum ${dateText} einspringen?`,
            icon: '/logo2.png',
            data: { url: '/roster' }
        })

        console.log("Sending personalized WebPush notifications...")

        const results = await Promise.allSettled(
            subscriptions.map(sub => {
                const userFlexCount = flexCounts[sub.user_id] || 0

                const personalPayload = JSON.stringify({
                    title: `${shiftTypeText} am ${dateText} muss nachbesetzt werden!`,
                    body: `Kannst du den Dienst übernehmen? Öffne die App für Details.`,
                    icon: '/logo2.png',
                    data: {
                        url: '/roster',
                        shiftId: urgentShifts?.[0]?.id || null
                    }
                })

                return webpushNpm.sendNotification({
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth
                    }
                }, personalPayload)
            })
        )

        // Log detailed rejection reasons because Error objects stringify to {}
        const debugResults = results.map(r => {
            if (r.status === 'rejected') {
                return { status: 'rejected', reason: r.reason?.message || r.reason?.toString() || r.reason }
            }
            return r
        })

        console.log("Send results:", JSON.stringify(debugResults))
        return new Response(JSON.stringify({ success: true, results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error(error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
