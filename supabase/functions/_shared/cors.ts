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

/**
 * Verify cron secret from Authorization header.
 * Returns an error Response if verification fails, or null if OK.
 */
export function verifyCronSecret(req: Request): Response | null {
    const cronSecret = Deno.env.get('CRON_SECRET')
    if (cronSecret) {
        const authHeader = req.headers.get('Authorization')
        if (authHeader !== `Bearer ${cronSecret}`) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }
    }
    return null
}
