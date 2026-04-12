// Calendar Feed - Serves iCal subscription for external calendar apps
// URL: GET /functions/v1/calendar-feed?token=<uuid>
// Deploy: supabase functions deploy calendar-feed --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- iCal generation (ported from src/utils/calendarExport.js) ---

const SHIFT_TYPE_NAMES: Record<string, string> = {
    'TD1': 'Tagdienst 1',
    'TD2': 'Tagdienst 2',
    'ND': 'Nachtdienst',
    'DBD': 'Doppelbesetzter Dienst',
    'TEAM': 'Teamsitzung',
    'FORTBILDUNG': 'Fortbildung',
    'EINSCHULUNG': 'Einschulungstermin',
    'MITARBEITERGESPRAECH': 'Mitarbeitergespräch',
    'SONSTIGES': 'Sonstiges',
    'SUPERVISION': 'Supervision',
    'AST': 'Anlaufstelle',
}

function formatToICalDate(date: string | Date): string {
    const d = new Date(date)
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeICalText(text: string): string {
    if (!text) return ''
    return text
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n')
}

interface Shift {
    id: number
    type: string
    title?: string
    start_time: string
    end_time: string
}

function shiftToVEvent(shift: Shift, userName: string): string {
    const title = shift.title || SHIFT_TYPE_NAMES[shift.type] || shift.type
    const description = `Dienst: ${title}${userName ? `\\nMitarbeiter: ${userName}` : ''}`

    const lines = [
        'BEGIN:VEVENT',
        `UID:${shift.id}@wobeplaner.app`,
        `DTSTAMP:${formatToICalDate(new Date())}`,
        `DTSTART:${formatToICalDate(shift.start_time)}`,
        `DTEND:${formatToICalDate(shift.end_time)}`,
        `SUMMARY:${escapeICalText(title)}`,
        `DESCRIPTION:${escapeICalText(description)}`,
        'STATUS:CONFIRMED',
        'TRANSP:OPAQUE',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:Dienst in 1 Stunde',
        'TRIGGER:-PT1H',
        'END:VALARM',
        'END:VEVENT',
    ]

    return lines.join('\r\n')
}

function generateICalFromShifts(shifts: Shift[], userName: string): string {
    const header = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//WoBePlaner//Dienstplan Export//DE',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:WoBePlaner Dienste',
        'X-WR-TIMEZONE:Europe/Vienna',
        'X-PUBLISHED-TTL:PT12H',
    ].join('\r\n')

    const events = shifts
        .filter(s => s.start_time && s.end_time)
        .map(s => shiftToVEvent(s, userName))
        .join('\r\n')

    const footer = 'END:VCALENDAR'

    return events.length > 0
        ? `${header}\r\n${events}\r\n${footer}`
        : `${header}\r\n${footer}`
}

// --- Edge Function handler ---

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

serve(async (req) => {
    if (req.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405 })
    }

    try {
        const url = new URL(req.url)
        const token = url.searchParams.get('token')

        if (!token || !UUID_REGEX.test(token)) {
            return new Response('Invalid or missing token', { status: 400 })
        }

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Look up token
        const { data: tokenRecord, error: tokenError } = await supabaseClient
            .from('calendar_tokens')
            .select('user_id')
            .eq('token', token)
            .eq('is_active', true)
            .maybeSingle()

        if (tokenError || !tokenRecord) {
            return new Response('Invalid or revoked token', { status: 403 })
        }

        const userId = tokenRecord.user_id

        // Get user display name
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('display_name, full_name')
            .eq('id', userId)
            .single()

        const userName = profile?.display_name || profile?.full_name || ''

        // Query shifts: 1 month ago to 3 months ahead
        const now = new Date()
        const from = new Date(now)
        from.setMonth(from.getMonth() - 1)
        const to = new Date(now)
        to.setMonth(to.getMonth() + 3)

        const { data: interests, error: shiftError } = await supabaseClient
            .from('shift_interests')
            .select('shift_id, shifts!inner(id, type, title, start_time, end_time)')
            .eq('user_id', userId)
            .gte('shifts.start_time', from.toISOString())
            .lte('shifts.start_time', to.toISOString())

        if (shiftError) {
            console.error('Shift query error:', shiftError)
            return new Response('Internal error', { status: 500 })
        }

        // Deduplicate shifts by ID
        const shiftsMap = new Map<number, Shift>()
        interests?.forEach((i: { shifts: Shift }) => {
            if (i.shifts) {
                shiftsMap.set(i.shifts.id, i.shifts)
            }
        })
        const shifts = Array.from(shiftsMap.values())

        const icalContent = generateICalFromShifts(shifts, userName)

        return new Response(icalContent, {
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8',
                'Content-Disposition': 'inline; filename="dienste.ics"',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'X-Content-Type-Options': 'nosniff',
            }
        })

    } catch (error) {
        console.error('calendar-feed error:', error)
        return new Response('Internal Server Error', { status: 500 })
    }
})
