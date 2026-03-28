import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { Lock, ArrowRight, CheckCircle, Eye, EyeOff } from 'lucide-react'

/**
 * SetPassword Component & Onboarding Wizard (v2)
 *
 * Step 1: Welcome + Datenschutz (kombiniert)
 * Step 2: Passwort festlegen
 */
export default function SetPassword({ user, onPasswordSet }) {
    const [step, setStep] = useState('welcome') // 'welcome' | 'password'
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [firstName, setFirstName] = useState('')

    // Fetch user's first name from profile
    useEffect(() => {
        const fetchName = async () => {
            if (!user?.id) return
            try {
                const { data } = await supabase
                    .from('profiles')
                    .select('full_name')
                    .eq('id', user.id)
                    .single()
                if (data?.full_name) {
                    setFirstName(data.full_name.split(' ')[0])
                }
            } catch {
                // Fallback: kein Name
            }
        }
        fetchName()
    }, [user?.id])

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')

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
            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            })

            if (updateError) {
                throw updateError
            }

            const { error: profileError } = await supabase
                .from('profiles')
                .update({ password_set: true })
                .eq('id', user.id)

            if (profileError) {
                console.error('Profile update error:', profileError)
            }

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
        <div className="flex justify-center gap-2 mb-6">
            {['welcome', 'password'].map((s) => (
                <div
                    key={s}
                    className={`h-1.5 rounded-full transition-all ${s === current ? 'w-8 bg-black' : 'w-1.5 bg-gray-200'}`}
                />
            ))}
        </div>
    )

    // ========================================
    // STEP 1: WELCOME + DATENSCHUTZ
    // ========================================
    if (step === 'welcome') {
        return (
            <div className="flex min-h-screen items-center justify-center p-4 bg-gray-50">
                <div className="w-full max-w-lg bg-white p-8 rounded-xl shadow-sm">

                    <ProgressDots current="welcome" />

                    {/* Header */}
                    <div className="text-center mb-8">
                        <img src="/logo2.png" alt="Logo" className="h-16 mx-auto mb-5 object-contain" />
                        <h1 className="text-2xl font-black text-gray-900 mb-1">
                            Willkommen{firstName ? `, ${firstName}` : ''}
                        </h1>
                        <p className="text-gray-500 text-sm">Richte deinen Zugang ein.</p>
                    </div>

                    {/* Wer sieht was? */}
                    <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                        <h3 className="font-bold text-gray-900 text-sm mb-3">Wer sieht was?</h3>
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-1.5 font-medium text-gray-500"></th>
                                    <th className="text-center py-1.5 font-bold text-gray-900 px-2">Du</th>
                                    <th className="text-center py-1.5 font-bold text-gray-900 px-2">Team</th>
                                    <th className="text-center py-1.5 font-bold text-gray-900 px-2">Admin</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-600">
                                <tr className="border-b border-gray-100">
                                    <td className="py-1.5">Dienste</td>
                                    <td className="text-center text-green-600">&#10003;</td>
                                    <td className="text-center text-green-600">&#10003;</td>
                                    <td className="text-center text-green-600">&#10003;</td>
                                </tr>
                                <tr className="border-b border-gray-100">
                                    <td className="py-1.5">Stundenkonto</td>
                                    <td className="text-center text-green-600">&#10003;</td>
                                    <td className="text-center text-green-600">&#10003;</td>
                                    <td className="text-center text-green-600">&#10003;</td>
                                </tr>
                                <tr className="border-b border-gray-100">
                                    <td className="py-1.5">Abwesenheitsgrund</td>
                                    <td className="text-center text-green-600">&#10003;</td>
                                    <td className="text-center text-gray-400 text-[10px]">nur &quot;Abwesend&quot;</td>
                                    <td className="text-center text-green-600">&#10003;</td>
                                </tr>
                                <tr className="border-b border-gray-100">
                                    <td className="py-1.5">E-Mail</td>
                                    <td className="text-center text-green-600">&#10003;</td>
                                    <td className="text-center text-gray-400">&ndash;</td>
                                    <td className="text-center text-green-600">&#10003;</td>
                                </tr>
                                <tr>
                                    <td className="py-1.5">Passwort</td>
                                    <td className="text-center text-gray-400 text-[10px]">nur du</td>
                                    <td className="text-center text-gray-400">&ndash;</td>
                                    <td className="text-center text-gray-400">&ndash;</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Connected Tagline */}
                    <div className="mb-8 py-5 px-6 bg-gray-50 rounded-xl">
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
                            className="bg-teal-500 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-teal-600 transition-all flex items-center gap-2 mx-auto hover:scale-105 active:scale-95 shadow-lg shadow-teal-200"
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
                <div className="w-full max-w-2xl bg-white p-8 md:p-12 rounded-xl shadow-xl relative overflow-hidden">

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
                        <div className="p-4 bg-gray-50 rounded-xl">
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

                    {/* Kurzer Datenschutz-Hinweis */}
                    <p className="text-xs text-gray-400 mb-6 leading-relaxed">
                        Deine Daten liegen verschlüsselt bei Supabase (EU).
                        Krankmeldungen sehen Kolleg:innen nur als &quot;Abwesend&quot;.
                    </p>

                    {/* Action */}
                    <div className="text-center">
                        <button
                            onClick={() => setStep('password')}
                            className="bg-teal-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-teal-600 transition-all flex items-center gap-2 mx-auto active:scale-95"
                        >
                            Weiter <ArrowRight size={18} />
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // ========================================
    // STEP 2: PASSWORT FESTLEGEN
    // ========================================
    return (
        <div className="flex min-h-screen items-center justify-center p-4 bg-gray-50">
            <div className="w-full max-w-sm bg-white p-8 rounded-xl shadow-sm">
                {/* Back Button */}
                <button
                    onClick={() => setStep('welcome')}
                    className="text-gray-400 hover:text-black mb-4 text-sm flex items-center gap-1"
                >
                    &larr; Zurück
                </button>

                <ProgressDots current="password" />

                {/* Logo */}
                <div className="flex justify-center mb-6">
                    <img
                        src="/logo2.png"
                        alt="Logo"
                        className="h-16 w-auto object-contain"
                    />
                </div>

                <div className="text-center mb-6">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-600">
                        <Lock size={20} />
                    </div>
                    <h1 className="text-xl font-bold mb-1">Passwort festlegen</h1>
                    <p className="text-gray-500 text-sm">
                        Mindestens 8 Zeichen.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Neues Passwort</label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Passwort eingeben"
                                className="w-full border border-gray-200 p-3 pr-10 rounded-xl focus:ring-2 focus:ring-black focus:outline-none transition-all"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                tabIndex={-1}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Passwort bestätigen</label>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Passwort wiederholen"
                            className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-black focus:outline-none transition-all"
                            required
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 border border-red-100 p-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-teal-500 text-white p-3.5 rounded-xl font-bold hover:bg-teal-600 transition-all disabled:opacity-50 mt-2 flex items-center justify-center gap-2 active:scale-95"
                    >
                        {loading ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                                Speichere...
                            </>
                        ) : (
                            <>
                                <CheckCircle size={18} /> Passwort speichern & los
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    )
}
