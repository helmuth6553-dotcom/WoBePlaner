import { useState, useEffect, useMemo } from 'react'
import { format, subDays } from 'date-fns'
import { de } from 'date-fns/locale'
import { supabase } from '../../supabase'
import { Download, Filter, Calendar, User, Activity } from 'lucide-react'

/**
 * =========================================================================
 * AdminAuditLog
 * Displays the immutable log of administrative actions (approvals, edits).
 * Fetches from `admin_actions` table joined with `profiles`.
 * 
 * Priority 1 Improvements:
 * - Filter by time period (7/30/90 days or all)
 * - Filter by action type (shifts, absences, etc.)
 * - Filter by admin
 * - Complete German translations
 * =========================================================================
 */
export default function AdminAuditLog() {
    const [logs, setLogs] = useState([])
    const [loading, setLoading] = useState(true)
    const [errorMsg, setErrorMsg] = useState(null)

    // Filter state
    const [timePeriod, setTimePeriod] = useState('30') // days: '7', '30', '90', 'all'
    const [actionFilter, setActionFilter] = useState('all') // 'all', 'shifts', 'absences', 'reports', 'other'
    const [adminFilter, setAdminFilter] = useState('all') // 'all' or admin_id
    const [showFilters, setShowFilters] = useState(false)

    // All action types with German translations
    const actionBadges = {
        // Shift actions
        'shift_created': { bg: 'bg-green-50', text: 'text-green-700', label: 'Schicht erstellt', category: 'shifts' },
        'shift_updated': { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Schicht bearbeitet', category: 'shifts' },
        'shift_deleted': { bg: 'bg-red-50', text: 'text-red-700', label: 'Schicht gelöscht', category: 'shifts' },

        // Absence actions (English)
        'absence_approved': { bg: 'bg-green-50', text: 'text-green-700', label: 'Urlaub genehmigt', category: 'absences' },
        'absence_rejected': { bg: 'bg-red-50', text: 'text-red-700', label: 'Urlaub abgelehnt', category: 'absences' },

        // Absence actions (German from DB)
        'absence_genehmigt': { bg: 'bg-green-50', text: 'text-green-700', label: 'Urlaub genehmigt', category: 'absences' },
        'absence_abgelehnt': { bg: 'bg-red-50', text: 'text-red-700', label: 'Urlaub abgelehnt', category: 'absences' },
        'absence_storniert': { bg: 'bg-orange-50', text: 'text-orange-700', label: 'Urlaub storniert', category: 'absences' },
        'urlaub_genehmigt': { bg: 'bg-green-50', text: 'text-green-700', label: 'Urlaub genehmigt', category: 'absences' },
        'urlaub_abgelehnt': { bg: 'bg-red-50', text: 'text-red-700', label: 'Urlaub abgelehnt', category: 'absences' },
        'krankmeldung': { bg: 'bg-orange-50', text: 'text-orange-700', label: 'Krankmeldung', category: 'absences' },

        // Report actions
        'report_approved': { bg: 'bg-green-50', text: 'text-green-700', label: 'Bericht genehmigt', category: 'reports' },
        'bericht_genehmigt': { bg: 'bg-green-50', text: 'text-green-700', label: 'Bericht genehmigt', category: 'reports' },

        // Correction actions
        'correction_added': { bg: 'bg-yellow-50', text: 'text-yellow-700', label: 'Korrektur hinzugefügt', category: 'other' },
        'korrektur': { bg: 'bg-yellow-50', text: 'text-yellow-700', label: 'Korrektur', category: 'other' },

        // Employee actions
        'employee_updated': { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Mitarbeiter aktualisiert', category: 'other' },
        'employee_invited': { bg: 'bg-purple-50', text: 'text-purple-700', label: 'Mitarbeiter eingeladen', category: 'other' },
    }

    const getActionBadge = (action) => {
        return actionBadges[action] || { bg: 'bg-gray-50', text: 'text-gray-700', label: action, category: 'other' }
    }

    const fetchLogs = async () => {
        setLoading(true)
        setErrorMsg(null)

        // Build query with time filter
        let query = supabase
            .from('admin_actions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500)

        // Apply time period filter
        if (timePeriod !== 'all') {
            const cutoffDate = subDays(new Date(), parseInt(timePeriod)).toISOString()
            query = query.gte('created_at', cutoffDate)
        }

        const { data: logsData, error } = await query

        if (error) {
            console.error(error)
            setErrorMsg(error.message)
            setLogs([])
        } else if (logsData) {
            // Collect IDs
            const userIds = new Set()
            logsData.forEach(l => {
                if (l.admin_id) userIds.add(l.admin_id)
                if (l.target_user_id) userIds.add(l.target_user_id)
            })

            // Fetch profiles
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name')
                .in('id', Array.from(userIds))

            const nameMap = {}
            profiles?.forEach(p => nameMap[p.id] = p.full_name)

            // Enrich logs
            const enriched = logsData.map(l => ({
                ...l,
                admin: { full_name: nameMap[l.admin_id] || 'Unbekannt', id: l.admin_id },
                target: { full_name: nameMap[l.target_user_id] || null }
            }))

            setLogs(enriched)
        }
        setLoading(false)
    }

    useEffect(() => { fetchLogs() }, [timePeriod])

    // Get unique admins for filter dropdown
    const uniqueAdmins = useMemo(() => {
        const admins = new Map()
        logs.forEach(l => {
            if (l.admin?.id && l.admin?.full_name) {
                admins.set(l.admin.id, l.admin.full_name)
            }
        })
        return Array.from(admins, ([id, name]) => ({ id, name }))
    }, [logs])

    // Filtered logs based on action type and admin
    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            // Action type filter
            if (actionFilter !== 'all') {
                const badge = getActionBadge(log.action)
                if (badge.category !== actionFilter) return false
            }

            // Admin filter
            if (adminFilter !== 'all' && log.admin?.id !== adminFilter) {
                return false
            }

            return true
        })
    }, [logs, actionFilter, adminFilter])

    // Get display label for target
    const getTargetLabel = (log) => {
        if (log.target?.full_name) {
            return log.target.full_name
        }

        if (log.action?.includes('shift') && log.changes) {
            const changes = log.changes.changes || log.changes
            const startTime = changes?.start_time || changes?.after?.start_time
            if (startTime) {
                try {
                    return `Schicht ${format(new Date(startTime), 'dd.MM.yyyy', { locale: de })}`
                } catch {
                    // Ignore
                }
            }
        }

        if (log.entity_id) {
            return `ID: ${String(log.entity_id).slice(0, 8)}...`
        }

        return '-'
    }

    const renderChanges = (changes) => {
        if (!changes) return null

        // Status change
        if (changes.before?.status && changes.after?.status) {
            return (
                <div className="flex items-center gap-2 text-xs">
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 line-through">{changes.before.status}</span>
                    <span>➜</span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold">{changes.after.status}</span>
                </div>
            )
        }

        // Shift changes
        const shiftChanges = changes.changes || changes
        if (shiftChanges?.start_time || shiftChanges?.end_time) {
            try {
                const start = shiftChanges.start_time ? format(new Date(shiftChanges.start_time), 'dd.MM. HH:mm', { locale: de }) : null
                const end = shiftChanges.end_time ? format(new Date(shiftChanges.end_time), 'HH:mm', { locale: de }) : null
                if (start && end) {
                    return <span className="text-xs text-gray-600">{start} - {end}</span>
                }
            } catch {
                // Fall through
            }
        }

        const display = typeof changes === 'object' ? JSON.stringify(changes) : changes
        return <pre className="text-[10px] text-gray-400 overflow-hidden whitespace-nowrap text-ellipsis max-w-xs">{display}</pre>
    }

    // Format changes for CSV export
    const formatChangesText = (log) => {
        const changes = log.changes
        if (!changes) return '-'

        if (changes.before?.status && changes.after?.status) {
            return `Status: ${changes.before.status} → ${changes.after.status}`
        }

        const shiftChanges = changes.changes || changes
        if (shiftChanges?.start_time || shiftChanges?.end_time) {
            try {
                const start = shiftChanges.start_time ? format(new Date(shiftChanges.start_time), 'HH:mm', { locale: de }) : null
                const end = shiftChanges.end_time ? format(new Date(shiftChanges.end_time), 'HH:mm', { locale: de }) : null
                if (start && end) return `Neue Zeit: ${start} - ${end}`
                if (start) return `Neue Startzeit: ${start}`
                if (end) return `Neue Endzeit: ${end}`
            } catch {
                // Fall through
            }
        }

        if (shiftChanges?.title !== undefined) {
            return shiftChanges.title ? `Neuer Titel: ${shiftChanges.title}` : 'Titel entfernt'
        }

        return typeof changes === 'object' ? JSON.stringify(changes) : String(changes)
    }

    // Export filtered logs as CSV
    const exportCSV = () => {
        const headers = ['Datum', 'Admin', 'Aktion', 'Ziel', 'Details']
        const rows = filteredLogs.map(log => {
            const badge = getActionBadge(log.action)
            return [
                format(new Date(log.created_at), 'dd.MM.yyyy HH:mm'),
                log.admin?.full_name || 'System',
                badge.label,
                getTargetLabel(log),
                formatChangesText(log)
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
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Audit Log</h2>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`text-sm px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors border ${showFilters ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 hover:bg-gray-100 border-gray-200'
                            }`}
                    >
                        <Filter size={14} />
                        Filter
                    </button>
                    <button
                        onClick={exportCSV}
                        className="text-sm bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors"
                        disabled={filteredLogs.length === 0}
                    >
                        <Download size={14} />
                        Export CSV
                    </button>
                    <button onClick={fetchLogs} className="text-sm bg-gray-50 hover:bg-gray-100 border px-3 py-1.5 rounded-lg transition-colors">
                        Aktualisieren
                    </button>
                </div>
            </div>

            {/* Filters */}
            {showFilters && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Time Period Filter */}
                        <div>
                            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-1">
                                <Calendar size={12} />
                                Zeitraum
                            </label>
                            <select
                                value={timePeriod}
                                onChange={(e) => setTimePeriod(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                            >
                                <option value="7">Letzte 7 Tage</option>
                                <option value="30">Letzte 30 Tage</option>
                                <option value="90">Letzte 90 Tage</option>
                                <option value="all">Alle</option>
                            </select>
                        </div>

                        {/* Action Type Filter */}
                        <div>
                            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-1">
                                <Activity size={12} />
                                Aktionstyp
                            </label>
                            <select
                                value={actionFilter}
                                onChange={(e) => setActionFilter(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                            >
                                <option value="all">Alle Aktionen</option>
                                <option value="shifts">Schichten</option>
                                <option value="absences">Urlaub/Krankmeldung</option>
                                <option value="reports">Berichte</option>
                                <option value="other">Sonstiges</option>
                            </select>
                        </div>

                        {/* Admin Filter */}
                        <div>
                            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-1">
                                <User size={12} />
                                Admin
                            </label>
                            <select
                                value={adminFilter}
                                onChange={(e) => setAdminFilter(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                            >
                                <option value="all">Alle Admins</option>
                                {uniqueAdmins.map(admin => (
                                    <option key={admin.id} value={admin.id}>{admin.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Filter summary */}
                    <div className="mt-3 text-xs text-gray-500">
                        Zeige {filteredLogs.length} von {logs.length} Einträgen
                    </div>
                </div>
            )}

            {errorMsg && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm mb-4">{errorMsg}</div>}

            {/* Log entries */}
            <div className="space-y-3">
                {filteredLogs.map(log => {
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
            {!loading && filteredLogs.length === 0 && <div className="text-center text-gray-400 text-sm py-4">Keine Einträge.</div>}
        </div>
    )
}
