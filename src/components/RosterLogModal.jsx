import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { FileText, X, ArrowRight, History } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

export default function RosterLogModal({ isOpen, onClose }) {
    const [logs, setLogs] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!isOpen) return // Guard inside useEffect instead of early return

        const fetchLogs = async () => {
            setLoading(true)
            const { data, error } = await supabase
                .from('shift_logs')
                .select(`
                    *,
                    shift:shifts(start_time, type),
                    old_user:profiles!shift_logs_old_user_id_fkey(full_name, email),
                    new_user:profiles!shift_logs_new_user_id_fkey(full_name, email),
                    changer:profiles!shift_logs_changed_by_fkey(full_name, email)
                `)
                .order('created_at', { ascending: false })
                .limit(50)

            if (error) console.error('Error fetching logs:', error)
            setLogs(data || [])
            setLoading(false)
        }
        fetchLogs()
    }, [isOpen])

    // Early return AFTER hooks
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-[1.5rem] w-full max-w-2xl h-[80vh] shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/20 flex flex-col animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b flex justify-between items-center">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <History className="text-gray-600" /> Änderungsprotokoll
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <p className="text-center text-gray-500">Lade Protokoll...</p>
                    ) : logs.length === 0 ? (
                        <div className="text-center py-10 text-gray-400">
                            <FileText size={48} className="mx-auto mb-4 opacity-20" />
                            <p>Keine Änderungen protokolliert.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {logs.map(log => (
                                <div key={log.id} className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="font-bold text-gray-700">
                                            {log.shift?.type} am {log.shift?.start_time ? format(new Date(log.shift.start_time), 'dd.MM.yyyy', { locale: de }) : '???'}
                                        </span>
                                        <span className="text-xs text-gray-400">
                                            {format(new Date(log.created_at), 'dd.MM. HH:mm', { locale: de })}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-3 text-gray-600 bg-white p-3 rounded-lg border border-gray-100">
                                        <div className="flex-1 text-right font-medium">
                                            {log.old_user?.full_name || log.old_user?.email || 'Unbekannt'}
                                        </div>
                                        <ArrowRight size={16} className="text-gray-400" />
                                        <div className="flex-1 font-bold text-black">
                                            {log.new_user?.full_name || log.new_user?.email || 'Unbekannt'}
                                        </div>
                                    </div>

                                    <div className="mt-2 text-xs text-gray-400 text-right">
                                        Geändert von: {log.changer?.full_name || log.changer?.email || 'System'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
