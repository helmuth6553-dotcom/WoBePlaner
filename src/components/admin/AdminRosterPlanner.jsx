import { useState, useEffect, useCallback } from 'react'
import { CalendarDays, Plus, X, ChevronLeft, ChevronRight, Eye, Zap, AlertCircle } from 'lucide-react'
import { format, getDaysInMonth, startOfMonth, getISODay, addMonths, subMonths } from 'date-fns'
import { de } from 'date-fns/locale'
import { supabase } from '../../supabase'
import { useShiftTemplates } from '../../contexts/ShiftTemplateContext'
import { getHolidays, isHoliday } from '../../utils/holidays'
import { logAdminAction } from '../../utils/adminAudit'
import ConfirmModal from '../ConfirmModal'

const WEEKDAYS = [
    { iso: 1, label: 'Montag', short: 'Mo' },
    { iso: 2, label: 'Dienstag', short: 'Di' },
    { iso: 3, label: 'Mittwoch', short: 'Mi' },
    { iso: 4, label: 'Donnerstag', short: 'Do' },
    { iso: 5, label: 'Freitag', short: 'Fr' },
    { iso: 6, label: 'Samstag', short: 'Sa' },
    { iso: 7, label: 'Sonntag', short: 'So' },
]

// Reguläre Dienst-Typen die im Wochenplan sinnvoll sind
const PLANNABLE_TYPES = ['TD1', 'TD2', 'ND', 'DBD', 'AST', 'TEAM', 'FORTBILDUNG', 'SUPERVISION', 'EINSCHULUNG', 'SONSTIGES']

function formatTimeRange(start, end) {
    if (!start || !end) return ''
    const fmt = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return `${fmt(start)}–${fmt(end)}`
}

// ─── Wochenplan-Karte für einen Wochentag ────────────────────────────────────

function WeekdayCard({ weekday, entries, allTemplates, getDefaultTimes, onAdd, onRemove }) {
    const [showPicker, setShowPicker] = useState(false)

    const usedTypes = entries.map(e => e.shift_type)
    const availableTypes = PLANNABLE_TYPES.filter(t => !usedTypes.includes(t))

    const sortedEntries = [...entries].sort((a, b) => a.sort_order - b.sort_order)

    // Beispielzeiten für heute anzeigen (Werktag, kein Feiertag)
    const exampleDate = (() => {
        // Nächsten passenden Wochentag finden
        const d = new Date()
        const diff = (weekday.iso - getISODay(d) + 7) % 7
        const target = new Date(d)
        target.setDate(d.getDate() + diff)
        return format(target, 'yyyy-MM-dd')
    })()

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-gray-800">{weekday.label}</span>
                {availableTypes.length > 0 && (
                    <button
                        onClick={() => setShowPicker(v => !v)}
                        className="flex items-center gap-1 text-xs text-teal-600 font-bold px-2 py-1 rounded-lg hover:bg-teal-50 active:scale-95 transition-all"
                    >
                        <Plus size={14} />
                        Dienst
                    </button>
                )}
            </div>

            {sortedEntries.length === 0 && (
                <p className="text-xs text-gray-400 italic">Keine Dienste definiert</p>
            )}

            <div className="flex flex-wrap gap-2">
                {sortedEntries.map(entry => {
                    const tmpl = allTemplates.find(t => t.code === entry.shift_type)
                    const { start, end } = getDefaultTimes(exampleDate, entry.shift_type)
                    const timeStr = formatTimeRange(start, end)
                    return (
                        <div
                            key={entry.shift_type}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold text-white"
                            style={{ backgroundColor: tmpl?.color || '#6b7280' }}
                        >
                            <span>{entry.shift_type}</span>
                            {timeStr && (
                                <span className="opacity-75 font-normal">{timeStr}</span>
                            )}
                            <button
                                onClick={() => onRemove(weekday.iso, entry.shift_type)}
                                className="ml-0.5 opacity-75 hover:opacity-100 transition-opacity"
                                aria-label="Entfernen"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    )
                })}
            </div>

            {/* Typ-Picker */}
            {showPicker && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-500 mb-2">Diensttyp hinzufügen:</p>
                    <div className="flex flex-wrap gap-1.5">
                        {availableTypes.map(type => {
                            const tmpl = allTemplates.find(t => t.code === type)
                            return (
                                <button
                                    key={type}
                                    onClick={() => {
                                        onAdd(weekday.iso, type)
                                        setShowPicker(false)
                                    }}
                                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-white active:scale-95 transition-all"
                                    style={{ backgroundColor: tmpl?.color || '#6b7280' }}
                                >
                                    {type}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Vorschau-Tabelle ─────────────────────────────────────────────────────────

function PreviewTable({ previewData, holidays }) {
    return (
        <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
            {previewData.map(({ date, dateStr, weekdayLabel, holidayName, shifts }) => (
                <div key={dateStr} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="w-24 shrink-0">
                        <span className="text-sm font-bold text-gray-800">
                            {format(date, 'd. MMM', { locale: de })}
                        </span>
                        <span className="text-xs text-gray-400 ml-1.5">{weekdayLabel}</span>
                        {holidayName && (
                            <div className="mt-0.5">
                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md">
                                    {holidayName}
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 flex-1">
                        {shifts.length === 0 ? (
                            <span className="text-xs text-gray-300 italic">—</span>
                        ) : shifts.map(s => (
                            <div
                                key={s.type}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                                    s.exists
                                        ? 'bg-gray-100 text-gray-400'
                                        : 'text-white'
                                }`}
                                style={!s.exists ? { backgroundColor: s.color } : {}}
                            >
                                <span>{s.type}</span>
                                <span className={`font-normal ${s.exists ? 'text-gray-400' : 'opacity-70'}`}>
                                    {s.timeStr}
                                </span>
                                {s.exists && (
                                    <span className="text-[9px] text-gray-400">✓</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function AdminRosterPlanner() {
    const { templates, getDefaultTimes } = useShiftTemplates()

    // Wochenplan-State
    const [rosterEntries, setRosterEntries] = useState([]) // { weekday, shift_type, sort_order }
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Monats-Generator-State
    const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()))
    const [previewData, setPreviewData] = useState(null)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [generating, setGenerating] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [lastResult, setLastResult] = useState(null) // { created, skipped }

    // Wochenplan laden
    useEffect(() => {
        async function load() {
            setLoading(true)
            const { data, error } = await supabase
                .from('roster_templates')
                .select('*')
                .order('weekday')
                .order('sort_order')
            if (!error) setRosterEntries(data || [])
            setLoading(false)
        }
        load()
    }, [])

    // Dienst zu Wochentag hinzufügen
    const handleAdd = useCallback(async (weekday, shiftType) => {
        setSaving(true)
        const sortOrder = rosterEntries.filter(e => e.weekday === weekday).length
        const { data, error } = await supabase
            .from('roster_templates')
            .insert({ weekday, shift_type: shiftType, sort_order: sortOrder })
            .select()
            .single()
        if (!error && data) {
            setRosterEntries(prev => [...prev, data])
        }
        setSaving(false)
        setPreviewData(null) // Vorschau zurücksetzen
    }, [rosterEntries])

    // Dienst von Wochentag entfernen
    const handleRemove = useCallback(async (weekday, shiftType) => {
        setSaving(true)
        const { error } = await supabase
            .from('roster_templates')
            .delete()
            .eq('weekday', weekday)
            .eq('shift_type', shiftType)
        if (!error) {
            setRosterEntries(prev => prev.filter(
                e => !(e.weekday === weekday && e.shift_type === shiftType)
            ))
        }
        setSaving(false)
        setPreviewData(null)
    }, [])

    // Vorschau berechnen
    const handlePreview = useCallback(async () => {
        setPreviewLoading(true)
        setLastResult(null)

        const year = selectedMonth.getFullYear()
        const month = selectedMonth.getMonth()
        const daysCount = getDaysInMonth(selectedMonth)
        const holidays = getHolidays(year)

        // Existierende Shifts für den Monat laden
        const firstDay = new Date(year, month, 1).toISOString()
        const firstDayNext = new Date(year, month + 1, 1).toISOString()
        const { data: existing } = await supabase
            .from('shifts')
            .select('start_time, type')
            .gte('start_time', firstDay)
            .lt('start_time', firstDayNext)

        const existingSet = new Set(
            (existing || []).map(s => {
                const d = new Date(s.start_time)
                return `${format(d, 'yyyy-MM-dd')}_${s.type}`
            })
        )

        // Vorschau-Daten aufbauen
        const preview = []
        for (let day = 1; day <= daysCount; day++) {
            const date = new Date(year, month, day)
            const dateStr = format(date, 'yyyy-MM-dd')
            const isoWeekday = getISODay(date) // 1=Mo, 7=So
            const weekdayDef = WEEKDAYS.find(w => w.iso === isoWeekday)
            const holidayInfo = isHoliday(date, holidays)

            const dayEntries = rosterEntries
                .filter(e => e.weekday === isoWeekday)
                .sort((a, b) => a.sort_order - b.sort_order)

            const shifts = dayEntries.map(entry => {
                const tmpl = templates.find(t => t.code === entry.shift_type)
                const { start, end } = getDefaultTimes(dateStr, entry.shift_type, holidays)
                return {
                    type: entry.shift_type,
                    color: tmpl?.color || '#6b7280',
                    timeStr: formatTimeRange(start, end),
                    exists: existingSet.has(`${dateStr}_${entry.shift_type}`),
                }
            })

            preview.push({
                date,
                dateStr,
                weekdayLabel: weekdayDef?.short || '',
                holidayName: holidayInfo?.name || null,
                shifts,
            })
        }

        setPreviewData(preview)
        setPreviewLoading(false)
    }, [selectedMonth, rosterEntries, templates, getDefaultTimes])

    // Dienstplan generieren
    const handleGenerate = useCallback(async () => {
        if (!previewData) return
        setGenerating(true)
        setConfirmOpen(false)

        const year = selectedMonth.getFullYear()
        const month = selectedMonth.getMonth()
        const holidays = getHolidays(year)

        // Existierende Shifts nochmal frisch laden (könnte sich seit Vorschau geändert haben)
        const firstDay = new Date(year, month, 1).toISOString()
        const firstDayNext = new Date(year, month + 1, 1).toISOString()
        const { data: existing } = await supabase
            .from('shifts')
            .select('start_time, type')
            .gte('start_time', firstDay)
            .lt('start_time', firstDayNext)

        const existingSet = new Set(
            (existing || []).map(s => {
                const d = new Date(s.start_time)
                return `${format(d, 'yyyy-MM-dd')}_${s.type}`
            })
        )

        const toInsert = []
        const daysCount = getDaysInMonth(selectedMonth)

        for (let day = 1; day <= daysCount; day++) {
            const date = new Date(year, month, day)
            const dateStr = format(date, 'yyyy-MM-dd')
            const isoWeekday = getISODay(date)

            const dayEntries = rosterEntries.filter(e => e.weekday === isoWeekday)

            for (const entry of dayEntries) {
                const key = `${dateStr}_${entry.shift_type}`
                if (existingSet.has(key)) continue

                const { start, end } = getDefaultTimes(dateStr, entry.shift_type, holidays)
                if (!start || !end) continue

                toInsert.push({
                    start_time: start.toISOString(),
                    end_time: end.toISOString(),
                    type: entry.shift_type,
                })
            }
        }

        let created = 0
        if (toInsert.length > 0) {
            const { error } = await supabase.from('shifts').insert(toInsert)
            if (!error) {
                created = toInsert.length
                await logAdminAction(
                    'generate_roster',
                    null,
                    'shifts',
                    null,
                    null,
                    {
                        month: format(selectedMonth, 'yyyy-MM'),
                        created,
                        skipped: existing?.length || 0,
                    }
                )
            }
        }

        setLastResult({ created, skipped: (existing?.length || 0) })
        setPreviewData(null)
        setGenerating(false)
    }, [previewData, selectedMonth, rosterEntries, getDefaultTimes])

    // Statistiken für die Vorschau
    const previewStats = previewData ? {
        newCount: previewData.reduce((sum, d) => sum + d.shifts.filter(s => !s.exists).length, 0),
        skipCount: previewData.reduce((sum, d) => sum + d.shifts.filter(s => s.exists).length, 0),
    } : null

    return (
        <div className="space-y-6">

            {/* ── Sektion 1: Wochenplan ── */}
            <div>
                <div className="flex items-center gap-2 mb-4 px-1">
                    <h2 className="text-lg font-black text-gray-900">Wochenplan</h2>
                    {saving && (
                        <span className="text-xs text-gray-400 animate-pulse">Wird gespeichert…</span>
                    )}
                </div>

                {loading ? (
                    <div className="text-center py-8 text-gray-400 text-sm">Wird geladen…</div>
                ) : (
                    <div className="space-y-3">
                        {WEEKDAYS.map(weekday => (
                            <WeekdayCard
                                key={weekday.iso}
                                weekday={weekday}
                                entries={rosterEntries.filter(e => e.weekday === weekday.iso)}
                                allTemplates={templates}
                                getDefaultTimes={getDefaultTimes}
                                onAdd={handleAdd}
                                onRemove={handleRemove}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* ── Sektion 2: Monat generieren ── */}
            <div>
                <div className="flex items-center gap-2 mb-4 px-1">
                    <h2 className="text-lg font-black text-gray-900">Monat generieren</h2>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">

                    {/* Monat-Auswahl */}
                    <div className="flex items-center justify-between">
                        <button
                            onClick={() => { setSelectedMonth(m => subMonths(m, 1)); setPreviewData(null); setLastResult(null) }}
                            className="p-2 rounded-xl hover:bg-gray-100 active:scale-95 transition-all"
                        >
                            <ChevronLeft size={18} className="text-gray-600" />
                        </button>

                        <span className="text-base font-bold text-gray-800">
                            {format(selectedMonth, 'MMMM yyyy', { locale: de })}
                        </span>

                        <button
                            onClick={() => { setSelectedMonth(m => addMonths(m, 1)); setPreviewData(null); setLastResult(null) }}
                            className="p-2 rounded-xl hover:bg-gray-100 active:scale-95 transition-all"
                        >
                            <ChevronRight size={18} className="text-gray-600" />
                        </button>
                    </div>

                    {/* Hinweis wenn kein Wochenplan definiert */}
                    {!loading && rosterEntries.length === 0 && (
                        <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl text-sm text-amber-700">
                            <AlertCircle size={16} className="shrink-0" />
                            <span>Bitte zuerst den Wochenplan oben definieren.</span>
                        </div>
                    )}

                    {/* Letztes Ergebnis */}
                    {lastResult && (
                        <div className="p-3 bg-green-50 rounded-xl text-sm text-green-700 font-medium">
                            ✓ {lastResult.created} Dienste erstellt
                            {lastResult.skipped > 0 && `, ${lastResult.skipped} bereits vorhanden (übersprungen)`}
                        </div>
                    )}

                    {/* Vorschau-Button */}
                    {rosterEntries.length > 0 && (
                        <button
                            onClick={handlePreview}
                            disabled={previewLoading}
                            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50"
                        >
                            <Eye size={16} />
                            {previewLoading ? 'Wird geladen…' : 'Vorschau anzeigen'}
                        </button>
                    )}

                    {/* Vorschau-Tabelle */}
                    {previewData && (
                        <>
                            {/* Statistiken */}
                            <div className="flex gap-3 text-sm">
                                <div className="flex-1 p-3 bg-teal-50 rounded-xl text-center">
                                    <div className="text-2xl font-black text-teal-600">{previewStats.newCount}</div>
                                    <div className="text-xs text-teal-600 font-medium">Neue Dienste</div>
                                </div>
                                <div className="flex-1 p-3 bg-gray-50 rounded-xl text-center">
                                    <div className="text-2xl font-black text-gray-400">{previewStats.skipCount}</div>
                                    <div className="text-xs text-gray-400 font-medium">Bereits vorhanden</div>
                                </div>
                            </div>

                            <PreviewTable previewData={previewData} />

                            {/* Generieren-Button */}
                            {previewStats.newCount > 0 ? (
                                <button
                                    onClick={() => setConfirmOpen(true)}
                                    disabled={generating}
                                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-teal-500 text-white font-bold rounded-xl hover:bg-teal-600 active:scale-95 transition-all disabled:opacity-50 shadow-md"
                                >
                                    <Zap size={16} />
                                    {generating ? 'Wird generiert…' : `${previewStats.newCount} Dienste generieren`}
                                </button>
                            ) : (
                                <div className="text-center text-sm text-gray-400 py-2">
                                    Alle Dienste für diesen Monat sind bereits vorhanden.
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Bestätigungs-Modal */}
            <ConfirmModal
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={handleGenerate}
                title="Dienstplan generieren"
                message={`${previewStats?.newCount ?? 0} Dienste für ${format(selectedMonth, 'MMMM yyyy', { locale: de })} erstellen? Bereits vorhandene Dienste werden nicht verändert.`}
                confirmText="Generieren"
                icon={CalendarDays}
            />
        </div>
    )
}
