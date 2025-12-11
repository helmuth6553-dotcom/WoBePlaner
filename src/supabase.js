import { createClient } from '@supabase/supabase-js'

// Use environment variables for credentials (Vite uses import.meta.env)
// Fallback values for development - in production, use proper environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://snxhcaruybvfyvcxtnrw.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNueGhjYXJ1eWJ2Znl2Y3h0bnJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzM3NDcsImV4cCI6MjA4MDEwOTc0N30.rcGFgYcg-Ek7X4C4WV93542EEljqC7hdrj_q36hc9_c'

export const supabase = createClient(supabaseUrl, supabaseKey)

