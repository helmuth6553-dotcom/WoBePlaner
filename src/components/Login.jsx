import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [useMagicLink, setUseMagicLink] = useState(false)

    const handleLogin = async (e) => {
        e.preventDefault()
        setLoading(true)
        setMessage('')

        let error
        if (useMagicLink) {
            const { error: otpError } = await supabase.auth.signInWithOtp({ email })
            error = otpError
            if (!error) setMessage('Checke deine E-Mails für den Login-Link!')
        } else {
            const { error: pwError } = await supabase.auth.signInWithPassword({ email, password })
            error = pwError
        }

        if (error) {
            setMessage(error.message)
        }
        setLoading(false)
    }

    return (
        <div className="flex h-screen items-center justify-center p-4 bg-gray-50">
            <form onSubmit={handleLogin} className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
                {/* Logo */}
                <div className="flex justify-center mb-6">
                    <img
                        src="/logo2.png"
                        alt="Logo"
                        className="h-32 w-auto object-contain"
                    />
                </div>

                <h1 className="text-2xl font-bold mb-6 text-center">
                    {useMagicLink ? 'Login per Link' : 'WoBePlaner'}
                </h1>

                {message && (
                    <div className={`p-3 rounded-lg text-sm mb-6 border ${message.includes('Checke') ? 'bg-green-50 text-green-800 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                        {message}
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-black focus:outline-none transition-all"
                            required
                        />
                    </div>

                    {!useMagicLink && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-black focus:outline-none transition-all"
                                required
                            />
                        </div>
                    )}

                    <button
                        disabled={loading}
                        className="w-full bg-black text-white p-3.5 rounded-xl font-bold hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Lade...' : (useMagicLink ? 'Link anfordern' : 'Einloggen')}
                    </button>

                    <div className="text-center pt-2">
                        <button
                            type="button"
                            onClick={() => { setUseMagicLink(!useMagicLink); setMessage(''); }}
                            className="text-sm text-gray-500 hover:text-black underline"
                        >
                            {useMagicLink ? 'Zurück zum Passwort-Login' : 'Passwort vergessen? Login per E-Mail Link'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    )
}
