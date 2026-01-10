import { createClient } from '@supabase/supabase-js'

// Supabase credentials from environment variables (Vite uses import.meta.env)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Validate that required environment variables are set
if (!supabaseUrl || !supabaseKey) {
    throw new Error(
        'Missing Supabase credentials. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file. See .env.example for reference.'
    )
}

export const supabase = createClient(supabaseUrl, supabaseKey)

