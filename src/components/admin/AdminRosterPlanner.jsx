import { useState, useEffect, useCallback } from 'react'
import { CalendarDays, Plus, X, ChevronLeft, ChevronRight, Eye, Zap, AlertCircle, Clock } from 'lucide-react'
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
    { iso: 0, label: 'Feiertag', short: 'FT', isHoliday: true },
]

// Reguläre Dienst-Typen die im Wochenplan sinnvoll sind
const PLANNABLE_TYPES = ['TD1', 'TD2', 'ND', 'DBD', 'AST', 'TEAM', 'FORTBILDUNG', 'SUPERVISION', 'EINSCHULUNG', 'SONSTIGES']

function formatTimeRange(start, end) {
    if (!start || !end) return ''
    const fmt = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return `${fmt(start)}–${fmt(end)}`
}

// ─── Dienstzeiten-Konfiguration ──────────────────────────────────────────────

function TimeInput({ value, onChange }) {
    return (
        <input
            type="time"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-black w-[90px]"
        />
    )
}

function DienstzeitenRow({ template, dbConfig, onUpdate }) {
    const db = dbConfig || {}

    // Gespeicherte Werte (aus DB/Context) — Referenzwerte für dirty-check
    const savedStart = db.start_time?.slice(0, 5) ?? template.start_time
    const savedEnd = db.end_time?.slice(0, 5) ?? template.end_time
    const savedWStart = db.weekend_start?.slice(0, 5) ?? ''
    const savedWEnd = db.weekend_end?.slice(0, 5) ?? ''
    const savedHStart = db.holiday_start?.slice(0, 5) ?? ''
    const savedHEnd = db.holiday_end?.slice(0, 5) ?? ''
    const savedFse = db.fri_sat_end?.slice(0, 5) ?? ''

    // Lokaler Bearbeitungs-State
    const [start, setStart] = useState(savedStart)
    const [end, setEnd] = useState(savedEnd)
    const [wStart, setWStart] = useState(savedWStart)
    const [wEnd, setWEnd] = useState(savedWEnd)
    const [hStart, setHStart] = useState(savedHStart)
    const [hEnd, setHEnd] = useState(savedHEnd)
    const [fse, setFse] = useState(savedFse)
    const [saving, setSaving] = useState(false)
    const [justSaved, setJustSaved] = useState(false)

    const hasOverrides = wStart || wEnd || hStart || hEnd || fse
    const [showOverrides, setShowOverrides] = useState(!!hasOverrides)

    // Erkennt ob etwas geändert wurde (Vergleich mit gespeicherten Werten)
    const isDirty = start !== savedStart || end !== savedEnd ||
        wStart !== savedWStart || wEnd !== savedWEnd ||
        hStart !== savedHStart || hEnd !== savedHEnd ||
        fse !== savedFse

    const spansMidnight = end !== '' && end !== '00:00' && end < start

    const handleSave = async () => {
        setSaving(true)
        const success = await onUpdate(template.code, {
            start_time: start,
            end_time: end,
            weekend_start: wStart || null,
            weekend_end: wEnd || null,
            holiday_start: hStart || null,
            holiday_end: hEnd || null,
            fri_sat_end: fse || null,
        })
        setSaving(false)
        if (success) {
            setJustSaved(true)
            setTimeout(() => setJustSaved(false), 2000)
        }
    }

    return (
        <div className="py-3 border-b border-gray-50 last:border-0">
            {/* Basiszeiten */}
            <div className="flex items-center gap-2 flex-wrap">
                <div
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: template.color }}
                >
                    {template.code}
                </div>
                <TimeInput value={start} onChange={setStart} />
                <span className="text-gray-400 text-sm">–</span>
                <TimeInput value={end} onChange={setEnd} />
                {spansMidnight && (
                    <span className="text-[10px] text-gray-400 font-medium">↺ übernacht</span>
                )}

                <div className="ml-auto flex items-center gap-2">
                    {isDirty && !saving && (
                        <button
                            onClick={handleSave}
                            className="px-3 py-1 bg-teal-500 text-white text-xs font-bold rounded-lg active:scale-95 transition-all hover:bg-teal-600"
                        >
                            Speichern
                        </button>
                    )}
                    {saving && <span className="text-[10px] text-gray-400 animate-pulse">Wird gespeichert…</span>}
                    {justSaved && !isDirty && <span className="text-[10px] text-teal-500 font-medium">✓ Gespeichert</span>}
                    {(template.weekday_rules && Object.keys(template.weekday_rules).length > 0) && (
                        <button
                            onClick={() => setShowOverrides(o => !o)}
                            className="text-xs text-gray-400 hover:text-gray-600 font-medium"
                        >
                            {showOverrides ? 'Sonderzeiten ▲' : 'Sonderzeiten ▼'}
                        </button>
                    )}
                </div>
            </div>

            {/* Sonderzeiten-Override */}
            {showOverrides && (
                <div className="mt-2 ml-[88px] space-y-1.5">
                    {/* Wochenende */}
                    {(template.weekday_rules?.saturday || wStart || wEnd) && (
                        <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                            <span className="w-20 shrink-0">Sa/So:</span>
                            <TimeInput value={wStart} onChange={setWStart} />
                            <span className="text-gray-400">–</span>
                            <TimeInput value={wEnd} onChange={setWEnd} />
                        </div>
                    )}
                    {/* Feiertag */}
                    {(template.weekday_rules?.holiday || hStart || hEnd) && (
                        <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                            <span className="w-20 shrink-0">Feiertag:</span>
                            <TimeInput value={hStart} onChange={setHStart} />
                            <span className="text-gray-400">–</span>
                            <TimeInput value={hEnd} onChange={setHEnd} />
                        </div>
                    )}
                    {/* Fr/Sa-Ende (hauptsächlich ND) */}
                    {(template.weekday_rules?.friday || fse) && (
                        <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                            <span className="w-20 shrink-0">Fr/Sa Ende:</span>
                            <TimeInput value={fse} onChange={setFse} />
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function DienstzeitenSection({ templates, dbConfigs, updateShiftTimeConfig }) {
    const [open, setOpen] = useState(false)
    const plannable = templates.filter(t => PLANNABLE_TYPES.includes(t.code))

    return (
        <div>
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm hover:bg-gray-50 active:scale-[0.99] transition-all"
            >
                <div className="flex items-center gap-2">
                    <Clock size={16} className="text-gray-500" />
                    <h2 className="text-lg font-black text-gray-900">Dienstzeiten</h2>
                </div>
                <ChevronRight
                    size={18}
                    className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
                />
            </button>

            {open && (
                <div className="mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-1">
                    {plannable.map(tmpl => (
                        <DienstzeitenRow
                            key={tmpl.code}
                            template={tmpl}
                            dbConfig={dbConfigs[tmpl.code]}
                            onUpdate={updateShiftTimeConfig}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

// ─── Wochenplan-Karte für einen Wochentag ────────────────────────────────────

function WeekdayCard({ weekday, entries, allTemplates, getDefaultTimes, onAdd, onRemove }) {
    const [showPicker, setShowPicker] = useState(false)

    const usedTypes = entries.map(e => e.shift_type)
    const availableTypes = PLANNABLE_TYPES.filter(t => !usedTypes.includes(t))

    const sortedEntries = [...entries].sort((a, b) => a.sort_order - b.sort_order)

    // Beispielzeiten anzeigen — für Feiertag: nächsten Feiertag nehmen, sonst nächsten passenden Wochentag
    const exampleDate = (() => {
        if (weekday.isHoliday) {
            // Nächsten österreichischen Feiertag verwenden
            const year = new Date().getFullYear()
            const holidays = getHolidays(year)
            const upcoming = holidays.find(h => h.date >= new Date())
            return upcoming ? format(upcoming.date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
        }
        const d = new Date()
        const diff = (weekday.iso - getISODay(d) + 7) % 7
        const target = new Date(d)
        target.setDate(d.getDate() + diff)
        return format(target, 'yyyy-MM-dd')
    })()

    // Für Feiertage: Zeiten mit Holiday-Kontext berechnen
    const exampleHolidays = weekday.isHoliday ? getHolidays(new Date().getFullYear()) : []

    return (
        <div className={`rounded-2xl border shadow-sm p-4 ${weekday.isHoliday ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
            <div className="flex items-center justify-between mb-3">
                <span className={`font-bold ${weekday.isHoliday ? 'text-amber-700' : 'text-gray-800'}`}>
                    {weekday.label}
                    {weekday.isHoliday && (
                        <span className="ml-2 text-[10px] font-medium text-amber-500 uppercase tracking-wide">ersetzt Wochentag</span>
                    )}
                </span>
                {availableTypes.length > 0 && (
                    <button
                        onClick={() => setShowPicker(v => !v)}
                        className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg active:scale-95 transition-all ${weekday.isHoliday ? 'text-amber-600 hover:bg-amber-100' : 'text-teal-600 hover:bg-teal-50'}`}
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
                    const { start, end } = getDefaultTimes(exampleDate, entry.shift_type, exampleHolidays)
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
    const { templates, getDefaultTimes, dbConfigs, updateShiftTimeConfig } = useShiftTemplates()

    // Wochenplan-State
    const [rosterEntries, setRosterEntries] = useState([]) // { weekday, shift_type, sort_order }
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [wochenplanOpen, setWochenplanOpen] = useState(false)

    // Monats-Generator-State
    const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()))
    const [monthShiftCount, setMonthShiftCount] = useState(null) // null=lädt, 0=leer, >0=vorhanden
    const [previewData, setPreviewData] = useState(null)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [generating, setGenerating] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false)
    const [lastResult, setLastResult] = useState(null) // { created, skipped, deleted }

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

    // Shift-Count für den gewählten Monat laden
    const loadMonthShiftCount = useCallback(async (month) => {
        setMonthShiftCount(null)
        const year = month.getFullYear()
        const m = month.getMonth()
        const firstDay = new Date(year, m, 1).toISOString()
        const firstDayNext = new Date(year, m + 1, 1).toISOString()
        const { count } = await supabase
            .from('shifts')
            .select('id', { count: 'exact', head: true })
            .gte('start_time', firstDay)
            .lt('start_time', firstDayNext)
        setMonthShiftCount(count ?? 0)
    }, [])

    useEffect(() => {
        loadMonthShiftCount(selectedMonth)
    }, [selectedMonth, loadMonthShiftCount])

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

            // An Feiertagen das Feiertag-Template (weekday=0) verwenden statt des Wochentags
            const effectiveWeekday = holidayInfo ? 0 : isoWeekday
            const dayEntries = rosterEntries
                .filter(e => e.weekday === effectiveWeekday)
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

            // An Feiertagen das Feiertag-Template (weekday=0) verwenden statt des Wochentags
            const dayIsHoliday = isHoliday(date, holidays)
            const effectiveWeekday = dayIsHoliday ? 0 : isoWeekday
            const dayEntries = rosterEntries.filter(e => e.weekday === effectiveWeekday)

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

        setLastResult({ created, skipped: existing?.length || 0, deleted: 0 })
        setPreviewData(null)
        setGenerating(false)
        loadMonthShiftCount(selectedMonth)
    }, [previewData, selectedMonth, rosterEntries, getDefaultTimes, loadMonthShiftCount])

    // Monat leeren + neu generieren
    const handleReplace = useCallback(async () => {
        setGenerating(true)
        setConfirmReplaceOpen(false)

        const year = selectedMonth.getFullYear()
        const month = selectedMonth.getMonth()
        const holidays = getHolidays(year)
        const firstDay = new Date(year, month, 1).toISOString()
        const firstDayNext = new Date(year, month + 1, 1).toISOString()

        // 1. Alle bestehenden Shifts des Monats löschen (CASCADE löscht shift_interests)
        const { count: deleted } = await supabase
            .from('shifts')
            .delete({ count: 'exact' })
            .gte('start_time', firstDay)
            .lt('start_time', firstDayNext)

        // 2. Neu generieren aus Template
        const toInsert = []
        const daysCount = getDaysInMonth(selectedMonth)

        for (let day = 1; day <= daysCount; day++) {
            const date = new Date(year, month, day)
            const dateStr = format(date, 'yyyy-MM-dd')
            const isoWeekday = getISODay(date)
            const dayIsHoliday = isHoliday(date, holidays)
            const effectiveWeekday = dayIsHoliday ? 0 : isoWeekday
            const dayEntries = rosterEntries.filter(e => e.weekday === effectiveWeekday)

            for (const entry of dayEntries) {
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
            if (!error) created = toInsert.length
        }

        await logAdminAction('replace_roster', null, 'shifts', null, null, {
            month: format(selectedMonth, 'yyyy-MM'),
            deleted: deleted || 0,
            created,
        })

        setLastResult({ created, skipped: 0, deleted: deleted || 0 })
        setPreviewData(null)
        setGenerating(false)
        loadMonthShiftCount(selectedMonth)
    }, [selectedMonth, rosterEntries, getDefaultTimes, loadMonthShiftCount])

    // Statistiken für die Vorschau
    const previewStats = previewData ? {
        newCount: previewData.reduce((sum, d) => sum + d.shifts.filter(s => !s.exists).length, 0),
        skipCount: previewData.reduce((sum, d) => sum + d.shifts.filter(s => s.exists).length, 0),
    } : null

    return (
        <div className="space-y-6">

            {/* ── Sektion 0: Dienstzeiten ── */}
            <DienstzeitenSection
                templates={templates}
                dbConfigs={dbConfigs}
                updateShiftTimeConfig={updateShiftTimeConfig}
            />

            {/* ── Sektion 1: Wochenplan ── */}
            <div>
                <button
                    onClick={() => setWochenplanOpen(o => !o)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm hover:bg-gray-50 active:scale-[0.99] transition-all"
                >
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-black text-gray-900">Wochenplan</h2>
                        {saving && <span className="text-xs text-gray-400 animate-pulse">Wird gespeichert…</span>}
                        {!saving && !loading && (
                            <span className="text-xs text-gray-400">{rosterEntries.length} Einträge</span>
                        )}
                    </div>
                    <ChevronRight
                        size={18}
                        className={`text-gray-400 transition-transform duration-200 ${wochenplanOpen ? 'rotate-90' : ''}`}
                    />
                </button>

                {wochenplanOpen && (
                    <div className="mt-3">
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

                    {/* Kein Wochenplan definiert */}
                    {!loading && rosterEntries.length === 0 && (
                        <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl text-sm text-amber-700">
                            <AlertCircle size={16} className="shrink-0" />
                            <span>Bitte zuerst den Wochenplan oben definieren.</span>
                        </div>
                    )}

                    {rosterEntries.length > 0 && (<>

                        {/* Status-Indikator */}
                        {monthShiftCount === null && (
                            <div className="text-center text-sm text-gray-400 animate-pulse py-1">Wird geprüft…</div>
                        )}
                        {monthShiftCount !== null && monthShiftCount > 0 && !lastResult && (
                            <div className="flex items-center gap-2 p-3 bg-teal-50 rounded-xl text-sm text-teal-700 font-medium">
                                <CalendarDays size={16} className="shrink-0" />
                                <span>{monthShiftCount} Dienste bereits generiert</span>
                            </div>
                        )}
                        {monthShiftCount !== null && monthShiftCount === 0 && !lastResult && (
                            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl text-sm text-gray-500">
                                <AlertCircle size={16} className="shrink-0" />
                                <span>Noch keine Dienste für diesen Monat</span>
                            </div>
                        )}

                        {/* Letztes Ergebnis */}
                        {lastResult && (
                            <div className="p-3 bg-green-50 rounded-xl text-sm text-green-700 font-medium">
                                ✓ {lastResult.created} Dienste erstellt
                                {lastResult.deleted > 0 && ` (${lastResult.deleted} vorher gelöscht)`}
                                {lastResult.skipped > 0 && `, ${lastResult.skipped} bereits vorhanden (übersprungen)`}
                            </div>
                        )}

                        {/* Monat noch leer → Vorschau + Generieren als Hauptaktion */}
                        {monthShiftCount === 0 && !previewData && (
                            <button
                                onClick={handlePreview}
                                disabled={previewLoading}
                                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-teal-500 text-white font-bold rounded-xl hover:bg-teal-600 active:scale-95 transition-all disabled:opacity-50 shadow-md"
                            >
                                <Eye size={16} />
                                {previewLoading ? 'Wird geladen…' : 'Vorschau + Generieren'}
                            </button>
                        )}

                        {/* Monat hat bereits Dienste → Leeren + Neu als Hauptaktion, Vorschau sekundär */}
                        {monthShiftCount !== null && monthShiftCount > 0 && !previewData && (
                            <div className="space-y-2">
                                <button
                                    onClick={() => setConfirmReplaceOpen(true)}
                                    disabled={generating}
                                    className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 active:scale-95 transition-all disabled:opacity-50 border border-red-200"
                                >
                                    <X size={16} />
                                    {generating ? 'Wird verarbeitet…' : 'Monat leeren + neu generieren'}
                                </button>
                                <button
                                    onClick={handlePreview}
                                    disabled={previewLoading}
                                    className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-gray-100 text-gray-500 text-sm font-bold rounded-xl hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    <Eye size={14} />
                                    {previewLoading ? 'Wird geladen…' : 'Vorschau anzeigen'}
                                </button>
                            </div>
                        )}

                        {/* Vorschau-Tabelle */}
                        {previewData && (
                            <>
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

                                {previewStats.newCount > 0 ? (
                                    <button
                                        onClick={() => setConfirmOpen(true)}
                                        disabled={generating}
                                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-teal-500 text-white font-bold rounded-xl hover:bg-teal-600 active:scale-95 transition-all disabled:opacity-50 shadow-md"
                                    >
                                        <Zap size={16} />
                                        {generating ? 'Wird generiert…' : `${previewStats.newCount} fehlende Dienste ergänzen`}
                                    </button>
                                ) : (
                                    <div className="text-center text-sm text-gray-400 py-2">
                                        Alle Dienste für diesen Monat sind bereits vorhanden.
                                    </div>
                                )}

                                <button
                                    onClick={() => setConfirmReplaceOpen(true)}
                                    disabled={generating}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 active:scale-95 transition-all disabled:opacity-50 border border-red-200"
                                >
                                    <X size={16} />
                                    {generating ? 'Wird verarbeitet…' : 'Monat leeren + neu generieren'}
                                </button>
                            </>
                        )}

                    </>)}
                </div>
            </div>

            {/* Modal: Fehlende ergänzen */}
            <ConfirmModal
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={handleGenerate}
                title="Fehlende Dienste ergänzen"
                message={`${previewStats?.newCount ?? 0} fehlende Dienste für ${format(selectedMonth, 'MMMM yyyy', { locale: de })} erstellen? Bereits vorhandene Dienste bleiben unverändert.`}
                confirmText="Ergänzen"
                icon={CalendarDays}
            />

            {/* Modal: Leeren + Neu generieren */}
            <ConfirmModal
                isOpen={confirmReplaceOpen}
                onClose={() => setConfirmReplaceOpen(false)}
                onConfirm={handleReplace}
                title="Monat leeren + neu generieren"
                message={`Alle bestehenden Shifts für ${format(selectedMonth, 'MMMM yyyy', { locale: de })} werden gelöscht und neu aus dem Wochenplan generiert. Dienstzuweisungen gehen verloren.`}
                confirmText="Leeren + Generieren"
                isDestructive={true}
            />
        </div>
    )
}
