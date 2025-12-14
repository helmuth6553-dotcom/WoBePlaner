import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { supabase } from '../../supabase'

/**
 * =========================================================================
 * AdminAuditLog
 * Displays the immutable log of administrative actions (approvals, edits).
 * Fetches from `admin_actions` table joined with `profiles`.
 * =========================================================================
 */
export default function AdminAuditLog() {
    const [logs, setLogs] = useState([])
    const [loading, setLoading] = useState(true)
    const [errorMsg, setErrorMsg] = useState(null)

    const fetchLogs = async () => {
        setLoading(true)
        setErrorMsg(null)

        // 1. Fetch raw logs without join
        const { data: logsData, error } = await supabase
            .from('admin_actions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50)

        if (error) {
            console.error(error)
            setErrorMsg(error.message)
            setLogs([])
        } else if (logsData) {
            // 2. Collect IDs
            const userIds = new Set()
            logsData.forEach(l => {
                if (l.admin_id) userIds.add(l.admin_id)
                if (l.target_user_id) userIds.add(l.target_user_id)
            })

            // 3. Fetch profiles
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name')
                .in('id', Array.from(userIds))

            const nameMap = {}
            profiles?.forEach(p => nameMap[p.id] = p.full_name)

            // 4. Enrich
            const enriched = logsData.map(l => ({
                ...l,
                admin: { full_name: nameMap[l.admin_id] || 'Unbekannt' },
                target: { full_name: nameMap[l.target_user_id] || 'Unbekannt' }
            }))

            setLogs(enriched)
        }
        setLoading(false)
    }

    useEffect(() => { fetchLogs() }, [])

    const renderChanges = (changes) => {
        if (!changes) return null

        if (changes.before?.status && changes.after?.status) {
            return (
                <div className="flex items-center gap-2 text-xs">
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 line-through">{changes.before.status}</span>
                    <span>➜</span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold">{changes.after.status}</span>
                </div>
            )
        }

        return <pre className="text-[10px] text-gray-400 overflow-hidden">{JSON.stringify(changes)}</pre>
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Audit Log</h2>
                <button onClick={fetchLogs} className="text-sm bg-gray-50 hover:bg-gray-100 border px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors">
                    Aktualisieren
                </button>
            </div>

            {errorMsg && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm mb-4">{errorMsg}</div>}

            <div className="space-y-3">
                {logs.map(log => (
                    <div key={log.id} className="bg-white border rounded-lg p-3 shadow-sm hover:bg-gray-50 transition-colors">
                        <div className="flex justify-between items-start mb-1">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-gray-900">{log.admin?.full_name || 'System'}</span>
                                <span className="text-gray-400 text-xs">•</span>
                                <span className="text-xs uppercase font-bold text-gray-500">{log.action}</span>
                            </div>
                            <span className="text-xs text-gray-400 tabular-nums">
                                {format(new Date(log.created_at), 'dd.MM. HH:mm')}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 text-sm mb-2">
                            <span className="text-gray-500">Ziel:</span>
                            <span className="font-medium text-gray-800">{log.target?.full_name || log.target_user_id || '-'}</span>
                            {log.entity_type === 'monthly_report' && <span className="text-xs bg-gray-100 px-1 rounded text-gray-500">Monatsbericht</span>}
                            {log.entity_type === 'absence_request' && <span className="text-xs bg-yellow-100 px-1 rounded text-yellow-800">Antrag</span>}
                        </div>

                        <div className="bg-gray-50 rounded p-2 border border-gray-100">
                            {renderChanges(log.changes)}
                        </div>
                    </div>
                ))}
            </div>

            {loading && <div className="text-center text-gray-400 text-sm py-4">Lade...</div>}
            {!loading && logs.length === 0 && <div className="text-center text-gray-400 text-sm py-4">Keine Einträge.</div>}
        </div>
    )
}
