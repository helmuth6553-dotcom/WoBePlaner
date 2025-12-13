/**
 * Edge Function: create-user
 * 
 * This function creates a new user account using Supabase Admin API.
 * It bypasses the normal signup flow, allowing controlled user creation
 * only by authenticated admins.
 * 
 * Security:
 * - Requires authenticated admin user
 * - Uses service_role key for admin operations
 * - Logs all user creation attempts
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        console.log("create-user function invoked - v1.0")

        // 1. Get the authorization header from the request
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            throw new Error('Nicht autorisiert: Fehlender Auth-Header')
        }

        // 2. Create a client with the user's token to verify they're an admin
        const supabaseUserClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            {
                global: {
                    headers: { Authorization: authHeader }
                }
            }
        )

        // 3. Get the calling user and verify they're an admin
        const { data: { user: callingUser }, error: userError } = await supabaseUserClient.auth.getUser()

        if (userError || !callingUser) {
            throw new Error('Nicht autorisiert: Ungültige Session')
        }

        const { data: callerProfile, error: profileError } = await supabaseUserClient
            .from('profiles')
            .select('role')
            .eq('id', callingUser.id)
            .single()

        if (profileError || callerProfile?.role !== 'admin') {
            throw new Error('Nicht autorisiert: Nur Admins können User erstellen')
        }

        console.log(`Admin ${callingUser.email} is creating a new user`)

        // 4. Parse the request body
        const body = await req.json()
        const { email, full_name, weekly_hours, start_date, vacation_days_per_year, role } = body

        if (!email) {
            throw new Error('E-Mail ist erforderlich')
        }

        // 5. Create admin client with service_role for user creation
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 6. Check if email already exists in profiles
        const { data: existingProfile } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('email', email)
            .single()

        if (existingProfile) {
            throw new Error('Ein Benutzer mit dieser E-Mail existiert bereits')
        }

        // 7. Create user AND send invite email in ONE step
        // inviteUserByEmail creates the user and sends an email with a magic link
        const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            redirectTo: `${Deno.env.get('SITE_URL') || 'https://wobeplaner.pages.dev'}`,
            data: {
                full_name: full_name || email.split('@')[0]
            }
        })

        if (inviteError) {
            console.error('Invite error:', inviteError)
            throw new Error(`Fehler beim Einladen: ${inviteError.message}`)
        }

        const newUserId = inviteData.user.id
        console.log(`User invited successfully: ${newUserId}`)
        console.log(`Invite email sent to: ${email}`)

        // 8. Create the profile with all the employee data
        const { error: profileCreateError } = await supabaseAdmin
            .from('profiles')
            .upsert({
                id: newUserId,
                email: email,
                full_name: full_name || '',
                role: role || 'user',
                weekly_hours: weekly_hours || 40,
                start_date: start_date || new Date().toISOString().split('T')[0],
                vacation_days_per_year: vacation_days_per_year || 25,
                is_active: true,
                password_set: false  // User must set password on first login
            }, { onConflict: 'id' })

        if (profileCreateError) {
            console.error('Profile creation error:', profileCreateError)
            // Don't throw - user was invited, profile issue is secondary
        } else {
            console.log('Profile created successfully')
        }

        // 9. Delete any pending invitation for this email (cleanup from old system)
        await supabaseAdmin
            .from('invitations')
            .delete()
            .eq('email', email)

        // 11. Log the admin action
        await supabaseAdmin.from('admin_actions').insert({
            admin_id: callingUser.id,
            action: 'create_user',
            target_user_id: newUserId,
            entity_type: 'profile',
            entity_id: newUserId,
            changes: {
                after: {
                    email,
                    full_name,
                    role: role || 'user',
                    weekly_hours: weekly_hours || 40
                }
            }
        })

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Benutzer erfolgreich erstellt und Einladungs-E-Mail gesendet',
                user_id: newUserId,
                email: email
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            }
        )

    } catch (error) {
        console.error('create-user error:', error)
        return new Response(
            JSON.stringify({
                success: false,
                error: error.message
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400
            }
        )
    }
})
