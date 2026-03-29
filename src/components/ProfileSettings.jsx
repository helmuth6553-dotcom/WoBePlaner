import { useState } from 'react'
import { supabase } from '../supabase'
import { User, Save, Shield, LogOut, Lock, FileCheck, Download, Briefcase, Calendar, Clock, ChevronDown } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import NotificationToggle from './NotificationToggle'

export default function ProfileSettings({ user, profile, onProfileUpdate }) {
    const [fullName, setFullName] = useState(profile?.full_name || '')
    const [displayName, setDisplayName] = useState(profile?.display_name || '')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [signatureInfoOpen, setSignatureInfoOpen] = useState(false)

    const updateProfile = async () => {
        setLoading(true)
        const { error } = await supabase.from('profiles').update({
            full_name: fullName,
            display_name: displayName || null
        }).eq('id', user.id)
        setLoading(false)
        if (error) alert('Fehler beim Speichern')
        else {
            alert('Profil aktualisiert!')
            onProfileUpdate?.()
        }
    }

    const updatePassword = async () => {
        setLoading(true)
        const { error } = await supabase.auth.updateUser({ password })
        setLoading(false)
        if (error) alert('Fehler: ' + error.message)
        else {
            alert('Passwort erfolgreich gesetzt!')
            setPassword('')
        }
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        window.location.reload()
    }

    const roleLabel = profile?.role === 'admin' ? 'Administrator' : 'Mitarbeiter'
    const startDate = profile?.start_date ? format(new Date(profile.start_date), 'd. MMMM yyyy', { locale: de }) : '—'

    return (
        <div className="space-y-6">
            {/* Profile Header */}
            <div className="bg-white p-6 rounded-xl shadow-[0_2px_10px_rgb(0,0,0,0.04)]">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                        <User size={32} />
                    </div>
                    <div>
                        <p className="font-bold text-lg">{profile?.display_name || profile?.full_name || user.email}</p>
                        <p className="text-sm text-gray-500">{roleLabel}</p>
                    </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                    <div className="bg-gray-50 rounded-xl p-3">
                        <div className="flex items-center gap-1.5 text-gray-400 mb-1">
                            <Briefcase size={12} />
                            <span className="text-[10px] font-bold uppercase">Rolle</span>
                        </div>
                        <p className="text-sm font-bold text-gray-700">{roleLabel}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                        <div className="flex items-center gap-1.5 text-gray-400 mb-1">
                            <Calendar size={12} />
                            <span className="text-[10px] font-bold uppercase">Eintritt</span>
                        </div>
                        <p className="text-sm font-bold text-gray-700">{startDate}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                        <div className="flex items-center gap-1.5 text-gray-400 mb-1">
                            <Clock size={12} />
                            <span className="text-[10px] font-bold uppercase">Wochenstd.</span>
                        </div>
                        <p className="text-sm font-bold text-gray-700">{profile?.weekly_hours || 40}h</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                        <div className="flex items-center gap-1.5 text-gray-400 mb-1">
                            <User size={12} />
                            <span className="text-[10px] font-bold uppercase">Team</span>
                        </div>
                        <p className="text-sm font-bold text-gray-700">WoBe</p>
                    </div>
                </div>

                {/* Name Fields */}
                <label className="block text-sm font-bold mb-2">Voller Name</label>
                <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Vorname Nachname"
                    className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-black mb-1"
                />
                <p className="text-xs text-gray-400 mb-4">Dein offizieller Name für Signaturen und PDFs.</p>

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
                    className="w-full bg-teal-500 text-white p-3 rounded-xl hover:bg-teal-600 disabled:opacity-50 font-bold flex items-center justify-center gap-2"
                >
                    <Save size={20} /> Speichern
                </button>
            </div>

            {/* Notifications */}
            <NotificationToggle />

            {/* Password */}
            <div className="bg-white p-6 rounded-xl shadow-[0_2px_10px_rgb(0,0,0,0.04)]">
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
                        value={password}
                    />
                    <button
                        onClick={updatePassword}
                        disabled={loading || !password}
                        className="bg-teal-500 text-white p-3 rounded-xl hover:bg-teal-600 disabled:opacity-50"
                    >
                        Setzen
                    </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">Setze ein Passwort, um dich ohne E-Mail Link einzuloggen.</p>
            </div>

            {/* Signature Info */}
            <div className="bg-blue-50/50 border border-blue-100/80 rounded-xl shadow-[0_2px_10px_rgb(0,0,0,0.04)] overflow-hidden">
                <button
                    onClick={() => setSignatureInfoOpen(o => !o)}
                    className="w-full p-4 flex items-center justify-between gap-2 text-left"
                >
                    <span className="font-bold text-gray-900 flex items-center gap-2">
                        <Shield className="text-blue-600 shrink-0" size={20} />
                        Wie sicher ist meine Unterschrift?
                    </span>
                    <ChevronDown
                        size={18}
                        className={`text-blue-400 shrink-0 transition-transform duration-200 ${signatureInfoOpen ? 'rotate-180' : ''}`}
                    />
                </button>
                {signatureInfoOpen && (
                    <div className="px-4 pb-4 space-y-4">
                        <div className="flex gap-3">
                            <div className="bg-white p-2 rounded-lg shadow-sm h-fit text-blue-600 shrink-0">
                                <Lock size={18} />
                            </div>
                            <div>
                                <p className="font-bold text-sm text-gray-900">1. Identität geprüft</p>
                                <p className="text-xs text-gray-500">Durch Login & Passwort wird bestätigt, dass du es wirklich bist.</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <div className="bg-white p-2 rounded-lg shadow-sm h-fit text-blue-600 shrink-0">
                                <FileCheck size={18} />
                            </div>
                            <div>
                                <p className="font-bold text-sm text-gray-900">2. Daten versiegelt</p>
                                <p className="text-xs text-gray-500">Aus dem Dokument wird ein unveränderbarer Code (Hash) berechnet.</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <div className="bg-white p-2 rounded-lg shadow-sm h-fit text-blue-600 shrink-0">
                                <Download size={18} />
                            </div>
                            <div>
                                <p className="font-bold text-sm text-gray-900">3. Beweisbar</p>
                                <p className="text-xs text-gray-500">Der Code steht auf deinem PDF. Niemand kann die Datenbank unbemerkt ändern.</p>
                            </div>
                        </div>
                        <div className="pt-3 border-t border-blue-100">
                            <p className="text-[10px] text-blue-400 font-mono text-center uppercase tracking-wider">
                                Fortgeschrittene Elektronische Signatur (FES)
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Logout */}
            <button
                onClick={handleLogout}
                className="w-full bg-red-50 text-red-600 p-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"
            >
                <LogOut size={20} /> Abmelden
            </button>
        </div>
    )
}
