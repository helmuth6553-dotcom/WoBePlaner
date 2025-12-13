import { useState } from 'react'
import { supabase } from '../supabase'
import { Calendar, Clock, Palmtree, Link2, Lock, CheckCircle, ArrowRight, Shield, Eye, EyeOff, Database, Users } from 'lucide-react'

/**
 * SetPassword Component & Onboarding Wizard
 * 
 * Step 1: Welcome & Feature Overview
 * Step 2: Data & Security Info
 * Step 3: Set Password
 */
export default function SetPassword({ user, onPasswordSet }) {
    const [step, setStep] = useState('welcome') // 'welcome' | 'privacy' | 'password'
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

    // Progress indicator
    const ProgressDots = ({ current }) => (
        <div className="flex justify-center gap-2 mb-8">
            {['welcome', 'privacy', 'password'].map((s, i) => (
                <div
                    key={s}
                    className={`w-2 h-2 rounded-full transition-all ${s === current ? 'w-6 bg-black' : 'bg-gray-200'
                        }`}
                />
            ))}
        </div>
    )

    // ========================================
    // STEP 1: WELCOME SCREEN (Features)
    // ========================================
    if (step === 'welcome') {
        return (
            <div className="flex min-h-screen items-center justify-center p-4 bg-gray-50">
                <div className="w-full max-w-2xl bg-white p-8 md:p-12 rounded-3xl shadow-xl border border-gray-100 relative overflow-hidden">

                    {/* Decorative Background Blobs */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-green-50 rounded-full blur-3xl -z-10 -translate-x-1/2 translate-y-1/2"></div>

                    <ProgressDots current="welcome" />

                    {/* Header */}
                    <div className="text-center mb-10">
                        <img src="/logo2.png" alt="Logo" className="h-20 mx-auto mb-6 object-contain" />
                        <h1 className="text-3xl font-black text-gray-900 mb-3">Willkommen im Team! 👋</h1>
                        <p className="text-gray-500 text-lg">Alles an einem Ort. Alles miteinander verbunden.</p>
                    </div>

                    {/* Core Features - 3 Columns */}
                    <div className="grid md:grid-cols-3 gap-5 mb-8">
                        <div className="p-5 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-2xl border border-blue-100 text-center">
                            <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                                <Calendar className="text-blue-600" size={28} />
                            </div>
                            <h3 className="font-bold text-gray-900 mb-1">Dienstplan</h3>
                            <p className="text-xs text-gray-500">Sieh deine Schichten auf einen Blick</p>
                        </div>

                        <div className="p-5 bg-gradient-to-br from-green-50 to-green-100/50 rounded-2xl border border-green-100 text-center">
                            <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                                <Palmtree className="text-green-600" size={28} />
                            </div>
                            <h3 className="font-bold text-gray-900 mb-1">Urlaubsplanung</h3>
                            <p className="text-xs text-gray-500">Beantrage Urlaub mit wenigen Klicks</p>
                        </div>

                        <div className="p-5 bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-2xl border border-purple-100 text-center">
                            <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                                <Clock className="text-purple-600" size={28} />
                            </div>
                            <h3 className="font-bold text-gray-900 mb-1">Zeiterfassung</h3>
                            <p className="text-xs text-gray-500">Stunden & Überstunden automatisch</p>
                        </div>
                    </div>

                    {/* Connected Tagline */}
                    <div className="mb-8 py-5 px-6 bg-gray-50 rounded-2xl border border-gray-100">
                        <div className="flex items-center gap-2 mb-3">
                            <Link2 className="text-gray-900" size={18} />
                            <span className="font-bold text-gray-900">Alles verbunden:</span>
                        </div>
                        <ul className="text-sm text-gray-600 space-y-2">
                            <li className="flex items-start gap-2">
                                <span className="text-green-500 mt-0.5">✓</span>
                                <span>Deine Stundensalden werden <strong>automatisch berechnet</strong>.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-500 mt-0.5">✓</span>
                                <span>Abwesenheiten erscheinen <strong>sofort</strong> im Dienstplan und der Arbeitszeiterfassung.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-500 mt-0.5">✓</span>
                                <span>Urlaubsanträge müssen nicht mehr ausgedruckt, korrigiert, nochmal ausgedruckt, unterschrieben und abgegeben werden.</span>
                            </li>
                        </ul>
                    </div>

                    {/* Action */}
                    <div className="text-center">
                        <button
                            onClick={() => setStep('privacy')}
                            className="bg-black text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-gray-800 transition-all flex items-center gap-2 mx-auto hover:scale-105 active:scale-95 shadow-lg shadow-gray-200"
                        >
                            Weiter <ArrowRight size={20} />
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // ========================================
    // STEP 2: PRIVACY & SECURITY INFO
    // ========================================
    if (step === 'privacy') {
        return (
            <div className="flex min-h-screen items-center justify-center p-4 bg-gray-50">
                <div className="w-full max-w-2xl bg-white p-8 md:p-12 rounded-3xl shadow-xl border border-gray-100 relative overflow-hidden">

                    {/* Decorative Background */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2"></div>

                    {/* Back Button */}
                    <button
                        onClick={() => setStep('welcome')}
                        className="text-gray-400 hover:text-black mb-2 text-sm flex items-center gap-1"
                    >
                        ← Zurück
                    </button>

                    <ProgressDots current="privacy" />

                    {/* Header - Kompakter */}
                    <div className="text-center mb-5">
                        <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                            <Shield className="text-blue-600" size={24} />
                        </div>
                        <h1 className="text-xl font-black text-gray-900">Deine Daten bei uns</h1>
                    </div>

                    {/* Combined: What we store + What we don't */}
                    <div className="grid md:grid-cols-2 gap-3 mb-4">
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="flex items-center gap-2 mb-2">
                                <Database className="text-gray-600" size={16} />
                                <span className="font-bold text-gray-900 text-sm">Was speichern wir?</span>
                            </div>
                            <ul className="text-xs text-gray-600 space-y-1">
                                <li>• Name & E-Mail</li>
                                <li>• Arbeitszeiten & Schichten</li>
                                <li>• Urlaubstage & Abwesenheiten</li>
                            </ul>
                        </div>

                        <div className="p-4 bg-red-50/50 rounded-xl border border-red-100">
                            <div className="flex items-center gap-2 mb-2">
                                <EyeOff className="text-red-500" size={16} />
                                <span className="font-bold text-gray-900 text-sm">Was NICHT?</span>
                            </div>
                            <ul className="text-xs text-gray-600 space-y-1">
                                <li className="flex items-start gap-1">
                                    <span className="text-red-400">✗</span>
                                    <span>Niemals dein Passwort</span>
                                </li>
                                <li className="flex items-start gap-1">
                                    <span className="text-red-400">✗</span>
                                    <span>Keine Gesundheitsdaten</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* Who sees what - Compact Table */}
                    <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-2 mb-2">
                            <Users className="text-gray-600" size={16} />
                            <span className="font-bold text-gray-900 text-sm">Wer sieht was?</span>
                        </div>
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-1.5 font-medium text-gray-500"></th>
                                    <th className="text-center py-1.5 font-bold text-gray-900 px-2">Du</th>
                                    <th className="text-center py-1.5 font-bold text-gray-900 px-2">Kolleg:innen</th>
                                    <th className="text-center py-1.5 font-bold text-gray-900 px-2">Admin</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-600">
                                <tr className="border-b border-gray-100">
                                    <td className="py-1.5">Schichten</td>
                                    <td className="text-center text-green-500">✓</td>
                                    <td className="text-center text-green-500">✓</td>
                                    <td className="text-center text-green-500">✓</td>
                                </tr>
                                <tr className="border-b border-gray-100">
                                    <td className="py-1.5">Stundenkonto</td>
                                    <td className="text-center text-green-500">✓</td>
                                    <td className="text-center text-green-500">✓</td>
                                    <td className="text-center text-green-500">✓</td>
                                </tr>
                                <tr className="border-b border-gray-100">
                                    <td className="py-1.5">Abwesenheitsgrund</td>
                                    <td className="text-center text-green-500">✓</td>
                                    <td className="text-center text-gray-400 text-[10px]">nur "Abwesend"</td>
                                    <td className="text-center text-green-500">✓</td>
                                </tr>
                                <tr className="border-b border-gray-100">
                                    <td className="py-1.5">E-Mail</td>
                                    <td className="text-center text-green-500">✓</td>
                                    <td className="text-center text-red-400">✗</td>
                                    <td className="text-center text-green-500">✓</td>
                                </tr>
                                <tr>
                                    <td className="py-1.5">Passwort</td>
                                    <td className="text-center text-gray-400 text-[10px]">nur du</td>
                                    <td className="text-center text-red-400">✗</td>
                                    <td className="text-center text-red-400">✗</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Security + Signature - Combined row */}
                    <div className="grid md:grid-cols-2 gap-3 mb-5">
                        <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl border border-green-100">
                            <Lock className="text-green-600 shrink-0" size={16} />
                            <p className="text-xs text-green-800">
                                <strong>HTTPS</strong> – Verschlüsselte Übertragung
                            </p>
                        </div>

                        <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-100">
                            <p className="text-xs text-gray-600">
                                <span className="mr-1">🔏</span>
                                <strong>Digitale Signatur</strong> statt Unterschrift – manipulationssicher durch Hash
                            </p>
                        </div>
                    </div>

                    {/* Action */}
                    <div className="text-center">
                        <button
                            onClick={() => setStep('password')}
                            className="bg-black text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 transition-all flex items-center gap-2 mx-auto"
                        >
                            Verstanden, weiter <ArrowRight size={18} />
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // ========================================
    // STEP 3: PASSWORD FORM
    // ========================================
    return (
        <div className="flex h-screen items-center justify-center p-4 bg-gray-50">
            <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
                {/* Back Button */}
                <button
                    onClick={() => setStep('privacy')}
                    className="text-gray-400 hover:text-black mb-4 text-sm flex items-center gap-1"
                >
                    ← Zurück
                </button>

                <ProgressDots current="password" />

                {/* Logo */}
                <div className="flex justify-center mb-6">
                    <img
                        src="/logo2.png"
                        alt="Logo"
                        className="h-20 w-auto object-contain"
                    />
                </div>

                <div className="text-center mb-8">
                    <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
                        <Lock size={24} />
                    </div>
                    <h1 className="text-2xl font-bold mb-2">Letzter Schritt!</h1>
                    <p className="text-gray-500 text-sm">
                        Wähle ein sicheres Passwort für deinen Zugang.
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
                        <div className="bg-red-50 text-red-600 border border-red-100 p-3 rounded-lg text-sm flex items-start gap-2">
                            <span>⚠️</span> <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-black text-white p-3.5 rounded-xl font-bold hover:bg-gray-800 transition-all disabled:opacity-50 mt-4 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                                Speichere...
                            </>
                        ) : (
                            <>
                                <CheckCircle size={18} /> Passwort speichern & Starten
                            </>
                        )}
                    </button>
                </form>

                <p className="mt-6 text-xs text-center text-gray-400 leading-relaxed">
                    Nach dem Speichern hast du vollen Zugriff. <br />
                    Willkommen an Bord! 🚀
                </p>
            </div>
        </div>
    )
}
