import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {


    const [user, setUser] = useState(null)
    const [role, setRole] = useState(null)
    const [passwordSet, setPasswordSet] = useState(true) // Default true for existing users
    const [loading, setLoading] = useState(true)

    const fetchRole = async (userId) => {
        try {
            if (!userId) {
                setRole(null)
                setPasswordSet(true)
                return
            }
            // Timeout for fetchRole specifically
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 5000)
            )

            const fetchPromise = supabase
                .from('profiles')
                .select('role, password_set')
                .eq('id', userId)
                .single()

            const { data, error } = await Promise.race([fetchPromise, timeoutPromise])

            if (error) {
                console.error('Error fetching role:', error)
                setRole('user')
                setPasswordSet(true) // Assume set if we can't check
            } else {
                setRole(data?.role || 'user')
                // password_set might be null for old users, treat as true
                setPasswordSet(data?.password_set !== false)
            }
        } catch (e) {
            console.error('Exception/Timeout fetching role:', e)
            setRole('user')
            setPasswordSet(true)
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
                    setUser(session?.user ?? null)
                    if (session?.user) {
                        await fetchRole(session.user.id)
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
            if (mounted) {
                setUser(session?.user ?? null)
                if (session?.user) {
                    fetchRole(session.user.id)
                } else {
                    setRole(null)
                }
                setLoading(false)
            }
        })

        return () => {
            mounted = false
            clearTimeout(safetyTimer)
            subscription.unsubscribe()
        }
    }, [])



    const isAdmin = role === 'admin'

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
        <AuthContext.Provider value={{ user, role, isAdmin, loading, passwordSet, refreshPasswordSet }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
