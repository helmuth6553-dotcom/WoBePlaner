export const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://wobeplaner.pages.dev',
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
