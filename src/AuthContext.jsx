import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { setUserContext, clearUserContext, addBreadcrumb } from './lib/sentry.js'

export const AuthContext = createContext()

export const AuthProvider = ({ children }) => {


    const [user, setUser] = useState(null)
    const [role, setRole] = useState(null)
    const [passwordSet, setPasswordSet] = useState(true) // Default true for existing users
    const [loading, setLoading] = useState(true)
    const [loginError, setLoginError] = useState(null)
    const clearLoginError = () => setLoginError(null)

    const fetchRole = async (userId) => {
        try {
            if (!userId) {
                setRole(null)
                setPasswordSet(true)
                return true
            }
            // Timeout for fetchRole specifically
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 5000)
            )

            const fetchPromise = supabase
                .from('profiles')
                .select('role, password_set, is_active')
                .eq('id', userId)
                .single()

            const { data, error } = await Promise.race([fetchPromise, timeoutPromise])

            if (error) {
                console.error('Error fetching role:', error)
                // Don't downgrade role on error — keep existing role intact
                // (prevents admin losing access during network glitches / Realtime reconnects)
                return true // fail open
            }

            // is_active === false (strict) blocks login; null/undefined treated as active
            if (data?.is_active === false) {
                setLoginError('Dein Account wurde deaktiviert. Wende dich an den Administrator.')
                return false
            }

            setRole(data?.role || 'user')
            // password_set might be null for old users, treat as true
            setPasswordSet(data?.password_set !== false)
            return true
        } catch (e) {
            console.error('Exception/Timeout fetching role:', e)
            // Don't downgrade role on error — keep existing role intact
            return true // fail open
        }
    }

    useEffect(() => {
        let mounted = true

        // Global safety timeout
        const safetyTimer = setTimeout(() => {
            if (mounted) {
                console.warn('Auth loading timed out, forcing render')
                setLoading(false)
            }
        }, 5000)

        const initAuth = async () => {

            try {
                const { data: { session }, error } = await supabase.auth.getSession()
                if (error) throw error

                if (mounted) {
                    if (session?.user) {
                        const isActive = await fetchRole(session.user.id)
                        if (!mounted) return
                        if (isActive) {
                            setUser(session.user)
                            // Set Sentry user context for error tracking
                            setUserContext(session.user)
                            addBreadcrumb('auth', 'User logged in')
                        } else {
                            supabase.auth.signOut() // fire-and-forget
                        }
                    } else {
                        setUser(null)
                        clearUserContext()
                    }
                }
            } catch (error) {
                console.error('Auth initialization error:', error)
            } finally {
                if (mounted) setLoading(false)
            }
        }

        initAuth()



        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (!mounted) return

            // INITIAL_SESSION is already handled by initAuth above — skip to avoid duplicate fetchRole calls
            if (_event === 'INITIAL_SESSION') return

            if (session?.user) {
                // TOKEN_REFRESHED: only update user object (new JWT), role hasn't changed
                // Avoids re-fetching role on every Realtime reconnect (which would risk role degradation on error)
                if (_event === 'TOKEN_REFRESHED') {
                    setUser(session.user)
                    return
                }

                const isActive = await fetchRole(session.user.id)
                if (!mounted) return
                if (isActive) {
                    setUser(session.user)
                    // Update Sentry user context
                    setUserContext(session.user)
                    addBreadcrumb('auth', `Auth state changed: ${_event}`)
                } else {
                    // fire-and-forget — kein await um Deadlock im Auth-Callback zu vermeiden
                    supabase.auth.signOut()
                }
            } else {
                // SIGNED_OUT — loginError NICHT löschen (muss für deaktivierte User erhalten bleiben)
                setUser(null)
                setRole(null)
                clearUserContext()
                addBreadcrumb('auth', 'User logged out')
            }
            setLoading(false)
        })

        return () => {
            mounted = false
            clearTimeout(safetyTimer)
            subscription.unsubscribe()
        }
    }, [])



    const isAdmin = role === 'admin'
    const isViewer = role === 'viewer'

    // Function to refresh password_set status after user sets their password
    const refreshPasswordSet = () => {
        setPasswordSet(true)
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <span className="ml-3 text-gray-500 font-medium">Laden...</span>
            </div>
        )
    }

    return (
        <AuthContext.Provider value={{ user, role, isAdmin, isViewer, loading, passwordSet, refreshPasswordSet, loginError, clearLoginError }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
