import { useState } from 'react'
import { supabase } from '../supabase'
import { X, CheckCircle, Lock, FileText, AlertTriangle } from 'lucide-react'

export default function SignatureModal({ isOpen, onClose, onConfirm, payload, title }) {
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    if (!isOpen) return null

    const handleSign = async () => {
        setLoading(true)
        setError(null)
        try {
            // 1. Re-Authenticate User to ensure identity (Sole Control)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("Nicht eingeloggt.")

            const { error: authError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: password
            })

            if (authError) throw new Error("Falsches Passwort. Signatur fehlgeschlagen.")

            // 2. Generate Hash of Payload (Integrity)
            const payloadString = JSON.stringify(payload)
            const encoder = new TextEncoder()
            const data = encoder.encode(payloadString)
            const hashBuffer = await crypto.subtle.digest('SHA-256', data)
            const hashArray = Array.from(new Uint8Array(hashBuffer))
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

            // 3. Return signature data
            const signatureData = {
                signer_id: user.id,
                role: 'applicant', // Default role, logic can refine this
                hash: hashHex,
                ip_address: 'client-ip-placeholder' // In a real app, catch this server-side or via Edge Function
            }

            await onConfirm(payload, signatureData)
            onClose()
        } catch (e) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                                <Lock size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">{title || 'Dokument signieren'}</h3>
                                <p className="text-xs text-gray-500 font-medium">Digitale Signaturerstellung (FES)</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                            <X size={20} className="text-gray-400" />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-sm mb-4">
                            <div className="flex items-start gap-2 text-gray-600">
                                <FileText size={16} className="mt-0.5 shrink-0" />
                                <div className="font-mono text-xs break-all opacity-70">
                                    Dokumenten-Hash (SHA-256):<br />
                                    <span className="text-gray-400">Wird basierend auf den Daten generiert...</span>
                                </div>
                            </div>
                        </div>

                        <p className="text-sm text-gray-600 mb-4">
                            Bitte bestätigen Sie mit Ihrem Passwort, dass Sie diesen Antrag wirklich stellen möchten.
                            Dies erstellt eine <strong>unveränderbare digitale Signatur</strong>.
                        </p>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Passwort zur Bestätigung</label>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full border-2 border-gray-200 p-3 rounded-xl focus:border-black focus:ring-0 outline-none transition-all font-bold"
                                placeholder="Ihr App-Passwort"
                                autoFocus
                            />
                        </div>

                        {error && (
                            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm flex items-start gap-2">
                                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handleSign}
                            disabled={loading || !password}
                            className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all mt-2"
                        >
                            {loading ? (
                                <span className="animate-pulse">Signiere...</span>
                            ) : (
                                <>
                                    <CheckCircle size={20} />
                                    Signieren & Einreichen
                                </>
                            )}
                        </button>
                    </div>
                </div>
                <div className="bg-gray-50 px-6 py-3 text-[10px] text-gray-400 text-center border-t border-gray-100">
                    Gesichert durch FES-Standard • Zeitstempel & Hash-Verfahren aktiv
                </div>
            </div>
        </div>
    )
}
