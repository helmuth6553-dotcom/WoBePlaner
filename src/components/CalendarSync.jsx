import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { Link, Copy, Check, Trash2, RefreshCw, Smartphone } from 'lucide-react'
import useModal from '../hooks/useModal'

export default function CalendarSync({ userId }) {
    const { showAlert, showConfirm, modalElement } = useModal()
    const [token, setToken] = useState(null)
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [copied, setCopied] = useState(null) // 'https' | 'webcal' | null

    useEffect(() => {
        loadToken()
    }, [userId])

    const loadToken = async () => {
        setLoading(true)
        const { data } = await supabase
            .from('calendar_tokens')
            .select('token, created_at')
            .eq('user_id', userId)
            .eq('is_active', true)
            .maybeSingle()
        setToken(data?.token || null)
        setLoading(false)
    }

    const createToken = async () => {
        setCreating(true)
        // Deactivate any existing token
        await supabase
            .from('calendar_tokens')
            .update({ is_active: false })
            .eq('user_id', userId)
            .eq('is_active', true)

        const { data, error } = await supabase
            .from('calendar_tokens')
            .insert({ user_id: userId })
            .select('token')
            .single()

        setCreating(false)
        if (error) {
            showAlert({ title: 'Fehler', message: 'Kalender-Link konnte nicht erstellt werden.', type: 'error' })
            return
        }
        setToken(data.token)
    }

    const revokeToken = () => {
        showConfirm({
            title: 'Link widerrufen',
            message: 'Der aktuelle Kalender-Link wird ungültig. Bereits abonnierte Kalender werden nicht mehr aktualisiert. Du kannst jederzeit einen neuen Link erstellen.',
            confirmText: 'Widerrufen',
            isDestructive: true,
            onConfirm: async () => {
                await supabase
                    .from('calendar_tokens')
                    .update({ is_active: false })
                    .eq('user_id', userId)
                    .eq('is_active', true)
                setToken(null)
            }
        })
    }

    const getHttpsUrl = () => {
        const base = import.meta.env.VITE_SUPABASE_URL
        return `${base}/functions/v1/calendar-feed?token=${token}`
    }

    const getWebcalUrl = () => getHttpsUrl().replace('https://', 'webcal://')

    const copyToClipboard = async (type) => {
        const url = type === 'webcal' ? getWebcalUrl() : getHttpsUrl()
        try {
            await navigator.clipboard.writeText(url)
            setCopied(type)
            setTimeout(() => setCopied(null), 2000)
        } catch {
            showAlert({ title: 'Fehler', message: 'Link konnte nicht kopiert werden.', type: 'error' })
        }
    }

    if (loading) {
        return <div className="py-4 text-center text-sm text-gray-400">Laden...</div>
    }

    if (!token) {
        return (
            <>
                <div className="space-y-3">
                    <p className="text-sm text-gray-500">
                        Abonniere deine Dienste in Google Calendar, Apple Kalender oder Outlook. Der Kalender aktualisiert sich automatisch.
                    </p>
                    <button
                        onClick={createToken}
                        disabled={creating}
                        className="w-full py-3 bg-teal-500 text-white rounded-xl font-bold hover:bg-teal-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <Link size={18} />
                        {creating ? 'Wird erstellt...' : 'Abo-Link erstellen'}
                    </button>
                </div>
                {modalElement}
            </>
        )
    }

    return (
        <>
            <div className="space-y-3">
                <p className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded inline-block">
                    Kalender-Abo aktiv
                </p>

                <p className="text-sm text-gray-500">
                    Kopiere den Link und füge ihn als Kalender-Abo hinzu.
                </p>

                {/* HTTPS URL - for Google Calendar */}
                <button
                    onClick={() => copyToClipboard('https')}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-teal-300 hover:bg-teal-50/50 transition-colors text-left"
                >
                    <div className="p-2 bg-blue-50 rounded-lg text-blue-600 shrink-0">
                        <Copy size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">Link kopieren</div>
                        <div className="text-xs text-gray-400 truncate">{getHttpsUrl()}</div>
                    </div>
                    {copied === 'https' && <Check size={18} className="text-green-500 shrink-0" />}
                </button>

                {/* webcal:// URL - for Apple Calendar */}
                <button
                    onClick={() => copyToClipboard('webcal')}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-teal-300 hover:bg-teal-50/50 transition-colors text-left"
                >
                    <div className="p-2 bg-purple-50 rounded-lg text-purple-600 shrink-0">
                        <Smartphone size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">Apple Kalender (webcal://)</div>
                        <div className="text-xs text-gray-400">Für iPhone, iPad & Mac</div>
                    </div>
                    {copied === 'webcal' && <Check size={18} className="text-green-500 shrink-0" />}
                </button>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                    <button
                        onClick={() => { revokeToken() }}
                        className="flex-1 py-2.5 text-sm text-red-500 bg-red-50 rounded-xl font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5"
                    >
                        <Trash2 size={14} />
                        Widerrufen
                    </button>
                    <button
                        onClick={async () => {
                            await supabase
                                .from('calendar_tokens')
                                .update({ is_active: false })
                                .eq('user_id', userId)
                                .eq('is_active', true)
                            await createToken()
                        }}
                        className="flex-1 py-2.5 text-sm text-gray-600 bg-gray-50 rounded-xl font-medium hover:bg-gray-100 transition-colors flex items-center justify-center gap-1.5"
                    >
                        <RefreshCw size={14} />
                        Neuer Link
                    </button>
                </div>
            </div>
            {modalElement}
        </>
    )
}
