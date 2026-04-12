import { useState, useEffect, useMemo, Fragment } from 'react'
import { format, subDays, parseISO, isValid, isToday, isYesterday } from 'date-fns'
import { de } from 'date-fns/locale'
import { supabase } from '../../supabase'
import {
    Download, Filter, Calendar, User, Search, Activity,
    Plus, Edit, Trash2, UserCheck, UserX, UserPlus, UserMinus,
    FileCheck, FileX, Clock, Thermometer, ChevronDown, ChevronRight,
} from 'lucide-react'
import {
    ACTION_CATALOG,
    CATEGORY_LABELS,
    COLOR_CLASSES,
    formatAuditEntry,
    getCatalogEntry,
} from '../../utils/auditFormatting'

const ICON_MAP = {
    Plus, Edit, Trash2, Calendar, UserCheck, UserX, UserPlus, UserMinus,
    FileCheck, FileX, Clock, Thermometer, Activity,
}

const CATEGORY_OPTIONS = [
    { value: 'all', label: 'Alle Aktionen' },
    { value: 'shifts', label: CATEGORY_LABELS.shifts },
    { value: 'absences', label: CATEGORY_LABELS.absences },
    { value: 'reports', label: CATEGORY_LABELS.reports },
    { value: 'corrections', label: CATEGORY_LABELS.corrections },
    { value: 'employees', label: CATEGORY_LABELS.employees },
]

function getDayLabel(dateStr) {
    const d = parseISO(dateStr)
    if (!isValid(d)) return dateStr
    if (isToday(d)) return 'Heute'
    if (isYesterday(d)) return 'Gestern'
    return format(d, 'EEEE, dd.MM.yyyy', { locale: de })
}

function groupByDay(logs) {
    const groups = new Map()
    for (const log of logs) {
        const d = parseISO(log.created_at)
        if (!isValid(d)) continue
        const dayKey = format(d, 'yyyy-MM-dd')
        if (!groups.has(dayKey)) groups.set(dayKey, [])
        groups.get(dayKey).push(log)
    }
    return Array.from(groups.entries()).map(([day, items]) => ({ day, items }))
}

export default function AdminAuditLog() {
    const [logs, setLogs] = useState([])
    const [loading, setLoading] = useState(true)
    const [errorMsg, setErrorMsg] = useState(null)
    const [expanded, setExpanded] = useState(new Set())

    const [timePeriod, setTimePeriod] = useState('30')
    const [categoryFilter, setCategoryFilter] = useState('all')
    const [actionFilter, setActionFilter] = useState('all')
    const [adminFilter, setAdminFilter] = useState('all')
    const [employeeFilter, setEmployeeFilter] = useState('all')
    const [searchTerm, setSearchTerm] = useState('')
    const [showFilters, setShowFilters] = useState(false)

    const fetchLogs = async () => {
        setLoading(true)
        setErrorMsg(null)

        let query = supabase
            .from('admin_actions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500)

        if (timePeriod !== 'all') {
            const cutoffDate = subDays(new Date(), Number.parseInt(timePeriod, 10)).toISOString()
            query = query.gte('created_at', cutoffDate)
        }

        const { data: logsData, error } = await query

        if (error) {
            console.error(error)
            setErrorMsg(error.message)
            setLogs([])
            setLoading(false)
            return
        }

        const userIds = new Set()
        logsData?.forEach(l => {
            if (l.admin_id) userIds.add(l.admin_id)
            if (l.target_user_id) userIds.add(l.target_user_id)
        })

        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', Array.from(userIds))

        const nameMap = {}
        profiles?.forEach(p => { nameMap[p.id] = p.full_name })

        const enriched = (logsData || []).map(l => ({
            ...l,
            admin: { full_name: nameMap[l.admin_id] || 'Unbekannt', id: l.admin_id },
            target: { full_name: nameMap[l.target_user_id] || null, id: l.target_user_id },
        }))

        setLogs(enriched)
        setLoading(false)
    }

    useEffect(() => { fetchLogs() }, [timePeriod])

    const formattedLogs = useMemo(() => {
        return logs.map(log => ({ log, formatted: formatAuditEntry(log) }))
    }, [logs])

    const uniqueAdmins = useMemo(() => {
        const m = new Map()
        logs.forEach(l => { if (l.admin?.id && l.admin?.full_name) m.set(l.admin.id, l.admin.full_name) })
        return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
    }, [logs])

    const uniqueEmployees = useMemo(() => {
        const m = new Map()
        logs.forEach(l => { if (l.target?.id && l.target?.full_name) m.set(l.target.id, l.target.full_name) })
        return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
    }, [logs])

    const actionOptionsForCategory = useMemo(() => {
        const entries = Object.entries(ACTION_CATALOG)
        const filtered = categoryFilter === 'all'
            ? entries
            : entries.filter(([, v]) => v.category === categoryFilter)
        return filtered.map(([key, v]) => ({ value: key, label: v.label }))
            .sort((a, b) => a.label.localeCompare(b.label))
    }, [categoryFilter])

    const filteredLogs = useMemo(() => {
        const search = searchTerm.trim().toLowerCase()
        return formattedLogs.filter(({ log, formatted }) => {
            if (categoryFilter !== 'all' && formatted.category !== categoryFilter) return false
            if (actionFilter !== 'all' && formatted.actionKey !== actionFilter) return false
            if (adminFilter !== 'all' && log.admin?.id !== adminFilter) return false
            if (employeeFilter !== 'all' && log.target?.id !== employeeFilter) return false
            if (search) {
                const haystack = [
                    formatted.adminName, formatted.targetName,
                    formatted.label, formatted.headline, formatted.summary,
                ].filter(Boolean).join(' ').toLowerCase()
                if (!haystack.includes(search)) return false
            }
            return true
        })
    }, [formattedLogs, categoryFilter, actionFilter, adminFilter, employeeFilter, searchTerm])

    const grouped = useMemo(() => groupByDay(filteredLogs.map(x => x.log)), [filteredLogs])
    const formattedMap = useMemo(() => {
        const m = new Map()
        filteredLogs.forEach(({ log, formatted }) => m.set(log.id, formatted))
        return m
    }, [filteredLogs])

    const toggleExpand = (id) => {
        setExpanded(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
        })
    }

    const exportCSV = () => {
        const headers = ['Datum', 'Admin', 'Aktion', 'Mitarbeiter', 'Zusammenfassung']
        const rows = filteredLogs.map(({ log, formatted }) => ([
            format(parseISO(log.created_at), 'dd.MM.yyyy HH:mm'),
            formatted.adminName || 'System',
            formatted.label,
            formatted.targetName || '—',
            formatted.summary || formatted.headline,
        ]))
        const csvContent = [
            headers.join(';'),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')),
        ].join('\n')
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `audit-protokoll-${format(new Date(), 'yyyy-MM-dd')}.csv`
        link.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div>
            <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold">Audit-Protokoll</h2>
                    <span className="text-xs text-gray-400">{filteredLogs.length} {filteredLogs.length === 1 ? 'Eintrag' : 'Einträge'}</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[180px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="search"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Suche nach Mitarbeiter, Aktion…"
                            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-teal-400 focus:outline-none"
                        />
                    </div>
                    <button
                        onClick={() => setShowFilters(v => !v)}
                        className={`text-sm px-3 py-1.5 rounded-lg flex items-center gap-2 border transition-colors ${showFilters ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 hover:bg-gray-100 border-gray-200'}`}
                    >
                        <Filter size={14} />
                        Filter
                    </button>
                    <button
                        onClick={exportCSV}
                        disabled={filteredLogs.length === 0}
                        className="text-sm bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                        <Download size={14} />
                        CSV
                    </button>
                    <button
                        onClick={fetchLogs}
                        className="text-sm bg-gray-50 hover:bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors"
                    >
                        Aktualisieren
                    </button>
                </div>
            </div>

            {showFilters && (
                <div className="bg-gray-50/50 rounded-xl p-4 mb-4 shadow-[0_2px_10px_rgb(0,0,0,0.04)]">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-1">
                                <Calendar size={12} /> Zeitraum
                            </label>
                            <select
                                value={timePeriod}
                                onChange={(e) => setTimePeriod(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                            >
                                <option value="7">Letzte 7 Tage</option>
                                <option value="30">Letzte 30 Tage</option>
                                <option value="90">Letzte 90 Tage</option>
                                <option value="all">Alle</option>
                            </select>
                        </div>
                        <div>
                            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-1">
                                <Activity size={12} /> Kategorie
                            </label>
                            <select
                                value={categoryFilter}
                                onChange={(e) => { setCategoryFilter(e.target.value); setActionFilter('all') }}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                            >
                                {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-1">
                                <Activity size={12} /> Spezifische Aktion
                            </label>
                            <select
                                value={actionFilter}
                                onChange={(e) => setActionFilter(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                            >
                                <option value="all">Alle</option>
                                {actionOptionsForCategory.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-1">
                                <User size={12} /> Admin
                            </label>
                            <select
                                value={adminFilter}
                                onChange={(e) => setAdminFilter(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                            >
                                <option value="all">Alle Admins</option>
                                {uniqueAdmins.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-1">
                                <User size={12} /> Betroffener Mitarbeiter
                            </label>
                            <select
                                value={employeeFilter}
                                onChange={(e) => setEmployeeFilter(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                            >
                                <option value="all">Alle Mitarbeiter</option>
                                {uniqueEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="mt-3 text-xs text-gray-500">
                        Zeige {filteredLogs.length} von {logs.length} Einträgen
                    </div>
                </div>
            )}

            {errorMsg && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm mb-4">{errorMsg}</div>}

            <div className="space-y-4">
                {grouped.map(({ day, items }) => (
                    <div key={day}>
                        <div className="flex items-center gap-3 mb-2 px-1">
                            <span className="text-xs font-bold uppercase text-gray-500 tracking-wide">{getDayLabel(day)}</span>
                            <div className="flex-1 h-px bg-gray-200" />
                            <span className="text-xs text-gray-400">{items.length}</span>
                        </div>
                        <div className="space-y-2">
                            {items.map(log => (
                                <AuditCard
                                    key={log.id}
                                    log={log}
                                    formatted={formattedMap.get(log.id)}
                                    expanded={expanded.has(log.id)}
                                    onToggle={() => toggleExpand(log.id)}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {loading && <div className="text-center text-gray-400 text-sm py-4">Lade…</div>}
            {!loading && filteredLogs.length === 0 && (
                <div className="text-center text-gray-400 text-sm py-8">
                    Keine Admin-Aktionen im gewählten Zeitraum.
                </div>
            )}
        </div>
    )
}

function AuditCard({ log, formatted, expanded, onToggle }) {
    if (!formatted) return null
    const Icon = ICON_MAP[formatted.icon] || Activity
    const colors = COLOR_CLASSES[formatted.color] || COLOR_CLASSES.gray
    const catalogEntry = getCatalogEntry(log.action)
    const isKnownAction = Boolean(catalogEntry)

    const timeStr = format(parseISO(log.created_at), 'HH:mm', { locale: de })
    const adminName = formatted.adminName || 'System'
    const targetName = formatted.targetName

    return (
        <div className="bg-white rounded-xl p-4 shadow-[0_2px_10px_rgb(0,0,0,0.04)] hover:shadow-[0_4px_20px_rgb(0,0,0,0.06)] transition-all">
            <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${colors.ring}`}>
                    <Icon size={18} className={colors.text} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                                    {formatted.label}
                                </span>
                                {!isKnownAction && (
                                    <span className="text-[10px] text-gray-400 italic">unbekannter Typ</span>
                                )}
                            </div>
                            <div className="font-semibold text-gray-900 mt-0.5 text-sm">
                                {formatted.headline}
                            </div>
                        </div>
                        <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">{timeStr}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-gray-600 mt-1.5 flex-wrap">
                        <span className="font-medium">{adminName}</span>
                        {targetName && (
                            <>
                                <span className="text-gray-300">→</span>
                                <span className="font-medium text-gray-800">{targetName}</span>
                            </>
                        )}
                        {!targetName && formatted.category === 'shifts' && (
                            <span className="text-gray-400 italic">Dienstplan-weit</span>
                        )}
                    </div>

                    {formatted.chips.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                            {formatted.chips.map((chip, i) => {
                                const c = COLOR_CLASSES[chip.color] || COLOR_CLASSES.gray
                                return (
                                    <span key={i} className={`text-[11px] px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
                                        {chip.label}
                                    </span>
                                )
                            })}
                        </div>
                    )}

                    {formatted.diffs.length > 0 && (
                        <div className="mt-2 bg-gray-50 rounded-lg p-2.5 space-y-1">
                            {formatted.diffs.map((d, i) => (
                                <div key={i} className="text-xs grid grid-cols-[minmax(90px,auto)_1fr] gap-2 items-center">
                                    <span className="text-gray-500">{d.fieldLabel}:</span>
                                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                        <span className="text-gray-400 line-through truncate">{d.before}</span>
                                        <span className="text-gray-300">→</span>
                                        <span className="text-gray-900 font-medium truncate">{d.after}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <button
                        onClick={onToggle}
                        className="mt-2 text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1"
                    >
                        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        Rohdaten {expanded ? 'ausblenden' : 'anzeigen'}
                    </button>

                    {expanded && (
                        <div className="mt-2 bg-gray-900 text-gray-100 rounded-lg p-3 text-[10px] font-mono overflow-auto max-h-96">
                            <div className="text-gray-400 mb-1">action: <span className="text-gray-200">{log.action}</span></div>
                            <div className="text-gray-400 mb-1">resource: <span className="text-gray-200">{log.target_resource_type || '—'} / {log.target_resource_id || '—'}</span></div>
                            <div className="text-gray-400 mb-1">changes:</div>
                            <pre className="whitespace-pre-wrap break-all">{JSON.stringify(log.changes, null, 2)}</pre>
                            <div className="text-gray-400 mb-1 mt-2">metadata:</div>
                            <pre className="whitespace-pre-wrap break-all">{JSON.stringify(log.metadata, null, 2)}</pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
