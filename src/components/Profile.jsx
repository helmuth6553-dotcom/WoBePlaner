import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import { eachDayOfInterval, isWeekend, parseISO, startOfYear, endOfYear, isWithinInterval } from 'date-fns'
import { User, Save, Briefcase, CalendarCheck, Clock, PieChart, Shield, LogOut } from 'lucide-react'
import { useHolidays } from '../hooks/useHolidays'

export default function Profile() {
    const { user, isAdmin } = useAuth()
    const [profile, setProfile] = useState(null)
    const [fullName, setFullName] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [stats, setStats] = useState({
        total: 25,
        used: 0,
        planned: 0,
        remaining: 25
    })

    const { getHoliday } = useHolidays()

    useEffect(() => {
        // Inline function definitions to avoid 'accessed before declared' errors
        const fetchProfile = async () => {
            const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
            if (data) {
                setProfile(data)
                setFullName(data.full_name || '')
                setDisplayName(data.display_name || '')
            }
        }

        const calculateVacationStats = async () => {
            // Hole Profil Daten für Urlaubsanspruch
            const { data: profileData } = await supabase.from('profiles').select('vacation_days_per_year').eq('id', user.id).single()
            const totalVacation = profileData?.vacation_days_per_year || 25

            // Hole alle Abwesenheiten des aktuellen Jahres
            const start = startOfYear(new Date())
            const end = endOfYear(new Date())

            const { data: absences } = await supabase
                .from('absences')
                .select('*')
                .eq('user_id', user.id)
                .eq('type', 'Urlaub') // Nur Urlaub zählt

            if (!absences) return

            let usedDays = 0
            let plannedDays = 0

            absences.forEach(abs => {
                // Berechne Tage im aktuellen Jahr
                const absStart = parseISO(abs.start_date)
                const absEnd = parseISO(abs.end_date)

                // Intervall der Abwesenheit
                const days = eachDayOfInterval({ start: absStart, end: absEnd })

                // Zähle nur Werktage (Mo-Fr) und nur Tage im aktuellen Jahr, die KEINE Feiertage sind
                const count = days.filter(day =>
                    !isWeekend(day) &&
                    isWithinInterval(day, { start, end }) &&
                    !getHoliday(day)
                ).length

                if (abs.status === 'genehmigt') usedDays += count
                else if (abs.status === 'beantragt') plannedDays += count
            })

            setStats({
                total: totalVacation,
                used: usedDays,
                planned: plannedDays,
                remaining: totalVacation - usedDays - plannedDays
            })
        }

        if (user) {
            fetchProfile()
            calculateVacationStats()
        }
    }, [user, getHoliday])

    const updateProfile = async () => {
        setLoading(true)
        const { error } = await supabase.from('profiles').update({
            full_name: fullName,
            display_name: displayName || null  // Allow null if empty
        }).eq('id', user.id)
        setLoading(false)
        if (error) alert('Fehler beim Speichern')
        else alert('Profil aktualisiert!')
    }

    const updatePassword = async () => {
        setLoading(true)
        const { error } = await supabase.auth.updateUser({ password: password })
        setLoading(false)
        if (error) alert('Fehler: ' + error.message)
        else {
            alert('Passwort erfolgreich gesetzt!')
            setPassword('')
        }
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        // Erzwinge Reload, um sicherzustellen, dass der Login-Screen erscheint
        window.location.reload()
    }

    return (
        <div className="p-6 max-w-md mx-auto pb-24">
            <h1 className="text-2xl font-bold mb-6">Mein Profil</h1>

            {/* Profil Einstellungen */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                        <User size={32} />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 font-medium">Angemeldet als</p>
                        <p className="font-bold">{profile?.display_name || profile?.full_name || user.email}</p>
                    </div>
                </div>

                {/* Full Name - Legal Name for PDFs and Signatures */}
                <label className="block text-sm font-bold mb-2">Voller Name</label>
                <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Vorname Nachname"
                    className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-black mb-1"
                />
                <p className="text-xs text-gray-400 mb-4">Dein offizieller Name für Signaturen und PDFs.</p>

                {/* Display Name - Nickname for Rosters */}
                <label className="block text-sm font-bold mb-2">Anzeigename</label>
                <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="z.B. Max, Maxi, oder leer lassen"
                    className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-black mb-1"
                />
                <p className="text-xs text-gray-400 mb-4">Dein Spitzname für den Dienstplan. Wenn leer, wird der volle Name verwendet.</p>

                <button
                    onClick={updateProfile}
                    disabled={loading}
                    className="w-full bg-black text-white p-3 rounded-xl hover:bg-gray-800 disabled:opacity-50 font-bold flex items-center justify-center gap-2"
                >
                    <Save size={20} /> Speichern
                </button>
            </div>

            {/* Sicherheit / Passwort */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                    <Shield size={20} /> Sicherheit
                </h3>
                <label className="block text-sm font-bold mb-2">Neues Passwort setzen</label>
                <div className="flex gap-2">
                    <input
                        type="password"
                        placeholder="Neues Passwort"
                        className="flex-1 p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-black"
                        onChange={e => setPassword(e.target.value)}
                    />
                    <button
                        onClick={updatePassword}
                        disabled={loading || !password}
                        className="bg-gray-900 text-white p-3 rounded-xl hover:bg-black disabled:opacity-50"
                    >
                        Setzen
                    </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">Setze ein Passwort, um dich ohne E-Mail Link einzuloggen.</p>
            </div>

            {/* Urlaubs Statistik - nur für Mitarbeiter, nicht für Admins */}
            {!isAdmin && (
                <>
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Briefcase size={20} />
                        Urlaubsanspruch {new Date().getFullYear()}
                    </h2>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                            <div className="flex items-center gap-2 text-blue-600 mb-1">
                                <PieChart size={16} />
                                <span className="text-xs font-bold uppercase">Gesamt</span>
                            </div>
                            <p className="text-2xl font-black text-blue-900">{stats.total} <span className="text-sm font-medium text-blue-400">Tage</span></p>
                        </div>
                        <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
                            <div className="flex items-center gap-2 text-green-600 mb-1">
                                <CalendarCheck size={16} />
                                <span className="text-xs font-bold uppercase">Verfügbar</span>
                            </div>
                            <p className="text-2xl font-black text-green-900">{stats.remaining} <span className="text-sm font-medium text-green-400">Tage</span></p>
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm mb-8">
                        <div className="flex justify-between items-center border-b border-gray-50 pb-3 mb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-gray-900"></div>
                                <span className="text-sm text-gray-600">Genehmigt</span>
                            </div>
                            <span className="font-bold">{stats.used} Tage</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                                <span className="text-sm text-gray-600">Geplant (offen)</span>
                            </div>
                            <span className="font-bold">{stats.planned} Tage</span>
                        </div>
                    </div>
                </>
            )}

            <button
                onClick={handleLogout}
                className="w-full bg-red-50 text-red-600 p-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"
            >
                <LogOut size={20} /> Abmelden
            </button>
        </div>
    )
}
