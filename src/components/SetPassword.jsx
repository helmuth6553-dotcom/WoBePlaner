import { useState } from 'react'
import { supabase } from '../supabase'

/**
 * SetPassword Component
 * 
 * Shown to users who have been invited but haven't set a password yet.
 * Matches the style of the Login component (clean, white, black accents).
 */
export default function SetPassword({ user, onPasswordSet }) {
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')

        // Validation
        if (password.length < 8) {
            setError('Passwort muss mindestens 8 Zeichen lang sein')
            return
        }

        if (password !== confirmPassword) {
            setError('Passwörter stimmen nicht überein')
            return
        }

        setLoading(true)

        try {
            // Update password in Supabase Auth
            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            })

            if (updateError) {
                throw updateError
            }

            // Mark password as set in profile
            const { error: profileError } = await supabase
                .from('profiles')
                .update({ password_set: true })
                .eq('id', user.id)

            if (profileError) {
                console.error('Profile update error:', profileError)
                // Don't throw - password was set successfully
            }

            // Notify parent component
            if (onPasswordSet) {
                onPasswordSet()
            }

        } catch (err) {
            console.error('Password set error:', err)
            setError(err.message || 'Fehler beim Setzen des Passworts')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex h-screen items-center justify-center p-4 bg-gray-50">
            <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
                {/* Logo */}
                <div className="flex justify-center mb-6">
                    <img
                        src="/logo2.png"
                        alt="Logo"
                        className="h-32 w-auto object-contain"
                    />
                </div>

                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold mb-2">Willkommen!</h1>
                    <p className="text-gray-500 text-sm">
                        Bitte setze dein persönliches Passwort, um deinen Account zu aktivieren.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Neues Passwort</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Mindestens 8 Zeichen"
                            className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-black focus:outline-none transition-all"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Passwort bestätigen</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Passwort wiederholen"
                            className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-black focus:outline-none transition-all"
                            required
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 border border-red-100 p-3 rounded-lg text-sm">
                            ⚠️ {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-black text-white p-3.5 rounded-xl font-bold hover:bg-gray-800 transition-colors disabled:opacity-50 mt-2"
                    >
                        {loading ? 'Speichere...' : 'Passwort speichern & starten'}
                    </button>
                </form>

                <p className="mt-6 text-xs text-center text-gray-400">
                    Nach dem Speichern kannst du dich jederzeit mit deiner E-Mail und diesem Passwort anmelden.
                </p>
            </div>
        </div>
    )
}
