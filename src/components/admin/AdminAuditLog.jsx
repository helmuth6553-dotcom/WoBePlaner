import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { supabase } from '../../supabase'
import { Download } from 'lucide-react'

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
            .limit(100)

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
                target: { full_name: nameMap[l.target_user_id] || null }
            }))

            setLogs(enriched)
        }
        setLoading(false)
    }

    useEffect(() => { fetchLogs() }, [])

    // Get display label for target based on action type and available data
    const getTargetLabel = (log) => {
        // If we have a user target, show their name
        if (log.target?.full_name) {
            return log.target.full_name
        }

        // For shift actions, try to extract date from changes
        if (log.action?.includes('shift') && log.changes) {
            const changes = log.changes.changes || log.changes
            const startTime = changes?.start_time || changes?.after?.start_time
            if (startTime) {
                try {
                    return `Schicht ${format(new Date(startTime), 'dd.MM.yyyy', { locale: de })}`
                } catch {
                    // Ignore formatting errors
                }
            }
        }

        // For entity_id, show abbreviated version
        if (log.entity_id) {
            return `ID: ${String(log.entity_id).slice(0, 8)}...`
        }

        return '-'
    }

    // Get action type badge color
    const getActionBadge = (action) => {
        const badges = {
            'shift_created': { bg: 'bg-green-50', text: 'text-green-700', label: 'Schicht erstellt' },
            'shift_updated': { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Schicht bearbeitet' },
            'shift_deleted': { bg: 'bg-red-50', text: 'text-red-700', label: 'Schicht gelöscht' },
            'absence_approved': { bg: 'bg-green-50', text: 'text-green-700', label: 'Antrag genehmigt' },
            'absence_rejected': { bg: 'bg-red-50', text: 'text-red-700', label: 'Antrag abgelehnt' },
            'report_approved': { bg: 'bg-green-50', text: 'text-green-700', label: 'Bericht genehmigt' },
            'correction_added': { bg: 'bg-yellow-50', text: 'text-yellow-700', label: 'Korrektur' },
        }
        return badges[action] || { bg: 'bg-gray-50', text: 'text-gray-700', label: action }
    }

    const renderChanges = (changes) => {
        if (!changes) return null

        // Status change (e.g., absence approval)
        if (changes.before?.status && changes.after?.status) {
            return (
                <div className="flex items-center gap-2 text-xs">
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 line-through">{changes.before.status}</span>
                    <span>➜</span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold">{changes.after.status}</span>
                </div>
            )
        }

        // Shift changes - format nicely
        const shiftChanges = changes.changes || changes
        if (shiftChanges?.start_time || shiftChanges?.end_time) {
            try {
                const start = shiftChanges.start_time ? format(new Date(shiftChanges.start_time), 'dd.MM. HH:mm', { locale: de }) : null
                const end = shiftChanges.end_time ? format(new Date(shiftChanges.end_time), 'HH:mm', { locale: de }) : null
                if (start && end) {
                    return <span className="text-xs text-gray-600">{start} - {end}</span>
                }
            } catch {
                // Fall through to JSON display
            }
        }

        // Fallback: show raw JSON but more compact
        const display = typeof changes === 'object' ? JSON.stringify(changes) : changes
        return <pre className="text-[10px] text-gray-400 overflow-hidden whitespace-nowrap text-ellipsis max-w-xs">{display}</pre>
    }

    // Format changes as readable German text
    const formatChangesText = (log) => {
        const changes = log.changes
        if (!changes) return '-'

        // Status change (e.g., absence approval)
        if (changes.before?.status && changes.after?.status) {
            return `Status: ${changes.before.status} → ${changes.after.status}`
        }

        // Shift changes
        const shiftChanges = changes.changes || changes
        if (shiftChanges?.start_time || shiftChanges?.end_time) {
            try {
                const start = shiftChanges.start_time ? format(new Date(shiftChanges.start_time), 'HH:mm', { locale: de }) : null
                const end = shiftChanges.end_time ? format(new Date(shiftChanges.end_time), 'HH:mm', { locale: de }) : null
                if (start && end) {
                    return `Neue Zeit: ${start} - ${end}`
                }
                if (start) return `Neue Startzeit: ${start}`
                if (end) return `Neue Endzeit: ${end}`
            } catch {
                // Fall through
            }
        }

        // Title change
        if (shiftChanges?.title !== undefined) {
            return shiftChanges.title ? `Neuer Titel: ${shiftChanges.title}` : 'Titel entfernt'
        }

        // Fallback
        return typeof changes === 'object' ? JSON.stringify(changes) : String(changes)
    }

    // Export logs as CSV
    const exportCSV = () => {
        const headers = ['Datum', 'Admin', 'Aktion', 'Ziel', 'Details']
        const rows = logs.map(log => {
            const badge = getActionBadge(log.action)
            return [
                format(new Date(log.created_at), 'dd.MM.yyyy HH:mm'),
                log.admin?.full_name || 'System',
                badge.label, // German label instead of English action name
                getTargetLabel(log),
                formatChangesText(log) // Readable text instead of JSON
            ]
        })

        const csvContent = [
            headers.join(';'),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
        ].join('\n')

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`
        link.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Audit Log</h2>
                <div className="flex gap-2">
                    <button
                        onClick={exportCSV}
                        className="text-sm bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors"
                        disabled={logs.length === 0}
                    >
                        <Download size={14} />
                        Export CSV
                    </button>
                    <button onClick={fetchLogs} className="text-sm bg-gray-50 hover:bg-gray-100 border px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors">
                        Aktualisieren
                    </button>
                </div>
            </div>

            {errorMsg && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm mb-4">{errorMsg}</div>}

            <div className="space-y-3">
                {logs.map(log => {
                    const badge = getActionBadge(log.action)
                    return (
                        <div key={log.id} className="bg-white border rounded-lg p-3 shadow-sm hover:bg-gray-50 transition-colors">
                            <div className="flex justify-between items-start mb-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-gray-900">{log.admin?.full_name || 'System'}</span>
                                    <span className="text-gray-400 text-xs">•</span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${badge.bg} ${badge.text}`}>
                                        {badge.label}
                                    </span>
                                </div>
                                <span className="text-xs text-gray-400 tabular-nums">
                                    {format(new Date(log.created_at), 'dd.MM. HH:mm')}
                                </span>
                            </div>

                            <div className="flex items-center gap-2 text-sm mb-2">
                                <span className="text-gray-500">Ziel:</span>
                                <span className="font-medium text-gray-800">{getTargetLabel(log)}</span>
                                {log.entity_type === 'monthly_report' && <span className="text-xs bg-gray-100 px-1 rounded text-gray-500">Monatsbericht</span>}
                                {log.entity_type === 'absence_request' && <span className="text-xs bg-yellow-100 px-1 rounded text-yellow-800">Antrag</span>}
                            </div>

                            <div className="bg-gray-50 rounded p-2 border border-gray-100">
                                {renderChanges(log.changes)}
                            </div>
                        </div>
                    )
                })}
            </div>

            {loading && <div className="text-center text-gray-400 text-sm py-4">Lade...</div>}
            {!loading && logs.length === 0 && <div className="text-center text-gray-400 text-sm py-4">Keine Einträge.</div>}
        </div>
    )
}
