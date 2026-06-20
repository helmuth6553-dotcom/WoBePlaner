const ALLOWED_ORIGINS = [
    'https://wobeapp.pages.dev',
    'https://wobeplaner.pages.dev',
]

export function getCorsHeaders(req: Request) {
    const origin = req.headers.get('Origin') ?? ''
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }
}

// Static fallback for non-request contexts
export const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://wobeapp.pages.dev',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Konstantzeit-Vergleich, um Timing-Angriffe auf den Token zu vermeiden. */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    let result = 0
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i)
    }
    return result === 0
}

/**
 * Autorisiert serverseitige Aufrufer (DB-Webhook auf `absences`, pg_cron-Jobs).
 * Diese senden bereits `Authorization: Bearer <service_role key>`. Wir verifizieren
 * exakt das gegen den in jeder Edge Function vorhandenen Reserved-Secret
 * `SUPABASE_SERVICE_ROLE_KEY`.
 *
 * FAIL-CLOSED: Fehlt der Key oder passt der Header nicht -> 401. (Die alte Variante
 * gegen ein optionales CRON_SECRET war fail-open: ohne gesetztes Secret wurde jeder
 * Request durchgewunken -> notify-sickness war unauthentifiziert aufrufbar, #239.)
 *
 * Der service_role key ist nicht oeffentlich (nicht im Frontend-Bundle), daher kann
 * ein Internet-Angreifer ihn nicht praesentieren.
 *
 * Returns eine 401-Response bei Fehlschlag, sonst null (= autorisiert).
 */
export function verifyCronSecret(req: Request): Response | null {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!serviceKey || !timingSafeEqual(authHeader, `Bearer ${serviceKey}`)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
    return null
}
