import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabase'

/**
 * ShiftTemplateContext
 *
 * Shift-Zeiten werden aus der DB (`shift_time_configs`) geladen und mit den
 * hardcodierten SHIFT_TEMPLATES gemergt. DB hat Vorrang — solange die DB
 * noch lädt, werden die Hardcode-Defaults als Fallback verwendet.
 *
 * Admin kann Zeiten über AdminRosterPlanner → Dienstzeiten konfigurieren.
 */

const ShiftTemplateContext = createContext({
    templates: [],
    getTemplate: () => null,
    getDefaultTimes: () => ({ start: null, end: null }),
    isPrivateType: () => false,
    dbConfigs: {},
    updateShiftTimeConfig: async () => false,
})

// Hardcodierte Defaults — Fallback wenn DB leer/nicht erreichbar
const SHIFT_TEMPLATES = [
    {
        code: 'TD1',
        name: 'Tagdienst 1',
        start_time: '07:30',
        end_time: '14:30',
        spans_midnight: false,
        color: '#22c55e',
        has_standby: false,
        weekday_rules: {
            saturday: { start: '09:30', end: '14:30' },
            sunday: { start: '09:30', end: '14:30' },
            holiday: { start: '09:30', end: '14:30' },
        },
    },
    {
        code: 'TD2',
        name: 'Tagdienst 2',
        start_time: '14:00',
        end_time: '19:30',
        spans_midnight: false,
        color: '#3b82f6',
        has_standby: false,
        weekday_rules: {},
    },
    {
        code: 'ND',
        name: 'Nachtdienst',
        start_time: '19:00',
        end_time: '08:00',
        spans_midnight: true,
        color: '#6366f1',
        has_standby: true,
        standby_start: '00:30',
        standby_end: '06:00',
        standby_factor: 0.5,
        interruption_min_minutes: 30,
        weekday_rules: {
            friday: { end: '10:00' },
            saturday: { end: '10:00' },
        },
    },
    {
        code: 'DBD',
        name: 'Doppeltbesetzter Dienst',
        start_time: '20:00',
        end_time: '00:00',
        spans_midnight: true,
        color: '#8b5cf6',
        has_standby: false,
        weekday_rules: {},
    },
    {
        code: 'AST',
        name: 'Anlaufstelle',
        start_time: '16:45',
        end_time: '19:45',
        spans_midnight: false,
        color: '#14b8a6',
        has_standby: false,
        weekday_rules: {},
    },
    {
        code: 'TEAM',
        name: 'Teamsitzung',
        start_time: '09:30',
        end_time: '11:30',
        spans_midnight: false,
        color: '#f59e0b',
        has_standby: false,
        weekday_rules: {},
    },
    {
        code: 'FORTBILDUNG',
        name: 'Fortbildung',
        start_time: '09:00',
        end_time: '17:00',
        spans_midnight: false,
        color: '#ec4899',
        has_standby: false,
        weekday_rules: {},
    },
    {
        code: 'EINSCHULUNG',
        name: 'Einschulungstermin',
        start_time: '13:00',
        end_time: '15:00',
        spans_midnight: false,
        color: '#06b6d4',
        has_standby: false,
        weekday_rules: {},
    },
    {
        code: 'MITARBEITERGESPRAECH',
        name: 'Mitarbeitergespräch',
        start_time: '10:00',
        end_time: '11:00',
        spans_midnight: false,
        color: '#f97316',
        has_standby: false,
        weekday_rules: {},
        private: true,
    },
    {
        code: 'SONSTIGES',
        name: 'Sonstiges',
        start_time: '10:00',
        end_time: '11:00',
        spans_midnight: false,
        color: '#64748b',
        has_standby: false,
        weekday_rules: {},
    },
    {
        code: 'SUPERVISION',
        name: 'Supervision',
        start_time: '09:00',
        end_time: '10:30',
        spans_midnight: false,
        color: '#8b5cf6',
        has_standby: false,
        weekday_rules: {},
    },
]

// Shift types that are only visible to assigned participants and admins
export const PRIVATE_SHIFT_TYPES = SHIFT_TEMPLATES.filter(t => t.private).map(t => t.code)

// Pure-Function-Kern der Zeitberechnung — arbeitet mit einem Template-Objekt
function computeDefaultTimes(template, dateStr, holidays = []) {
    if (!template) return { start: null, end: null }

    const date = new Date(dateStr)
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()

    const isHoliday = holidays.some(h => {
        const hDate = new Date(h.date || h)
        return hDate.toDateString() === date.toDateString()
    })

    let startTime = template.start_time
    let endTime = template.end_time
    const rules = template.weekday_rules || {}

    if (isHoliday && rules.holiday) {
        startTime = rules.holiday.start || startTime
        endTime = rules.holiday.end || endTime
    } else if (rules[dayName]) {
        startTime = rules[dayName].start || startTime
        endTime = rules[dayName].end || endTime
    }

    // Vorfeiertag-Regel für Nachtdienst
    if (template.code === 'ND' && holidays.length > 0) {
        const nextDay = new Date(date)
        nextDay.setDate(nextDay.getDate() + 1)
        const nextDayIsHoliday = holidays.some(h => {
            const hDate = new Date(h.date || h)
            return hDate.toDateString() === nextDay.toDateString()
        })
        if (nextDayIsHoliday) {
            endTime = rules.friday?.end || '10:00'
        }
    }

    const createDateTime = (timeStr, addDays = 0) => {
        const [hours, minutes] = timeStr.split(':').map(Number)
        const d = new Date(date)
        d.setHours(hours, minutes, 0, 0)
        if (addDays > 0) d.setDate(d.getDate() + addDays)
        return d
    }

    const start = createDateTime(startTime)
    const end = template.spans_midnight
        ? createDateTime(endTime, 1)
        : createDateTime(endTime)

    return { start, end }
}

// Standalone-Export für Tests und externe Nutzung (nutzt Hardcode-Defaults)
export function getDefaultTimes(dateStr, code, holidays = []) {
    const template = SHIFT_TEMPLATES.find(t => t.code?.toUpperCase() === code?.toUpperCase())
    return computeDefaultTimes(template, dateStr, holidays)
}

// Erkennt automatisch ob ein Dienst über Mitternacht geht
function detectSpansMidnight(startTime, endTime) {
    if (!startTime || !endTime) return false
    if (endTime === '00:00') return true
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    return eh * 60 + em < sh * 60 + sm
}

// Merged einen DB-Config-Eintrag in das hardcodierte Template
function mergeDbConfig(tmpl, db) {
    if (!db) return tmpl

    const start_time = db.start_time?.slice(0, 5) ?? tmpl.start_time
    const end_time = db.end_time?.slice(0, 5) ?? tmpl.end_time
    const spans_midnight = detectSpansMidnight(start_time, end_time)

    // weekday_rules aus DB-Flat-Feldern rekonstruieren
    const rules = { ...tmpl.weekday_rules }

    const ws = db.weekend_start?.slice(0, 5)
    const we = db.weekend_end?.slice(0, 5)
    if (ws || we) {
        rules.saturday = { start: ws ?? rules.saturday?.start, end: we ?? rules.saturday?.end }
        rules.sunday = { start: ws ?? rules.sunday?.start, end: we ?? rules.sunday?.end }
    }

    const hs = db.holiday_start?.slice(0, 5)
    const he = db.holiday_end?.slice(0, 5)
    if (hs || he) {
        rules.holiday = { start: hs ?? rules.holiday?.start, end: he ?? rules.holiday?.end }
    }

    const fse = db.fri_sat_end?.slice(0, 5)
    if (fse) {
        rules.friday = { ...rules.friday, end: fse }
        // Samstag: weekend_end hat Vorrang über fri_sat_end für die Endzeit
        rules.saturday = { ...rules.saturday, end: we ?? fse }
    }

    return { ...tmpl, start_time, end_time, spans_midnight, weekday_rules: rules }
}

export function ShiftTemplateProvider({ children }) {
    // DB-Konfigurationen — keyed by shift_type
    const [dbConfigs, setDbConfigs] = useState({})

    useEffect(() => {
        supabase
            .from('shift_time_configs')
            .select('*')
            .then(({ data }) => {
                if (data?.length) {
                    const map = {}
                    data.forEach(row => { map[row.shift_type] = row })
                    setDbConfigs(map)
                }
            })
    }, [])

    // Templates mit DB-Werten gemergt (Fallback: Hardcode)
    const mergedTemplates = useMemo(() =>
        SHIFT_TEMPLATES.map(tmpl => mergeDbConfig(tmpl, dbConfigs[tmpl.code])),
        [dbConfigs]
    )

    const getTemplate = useCallback((code) => {
        if (!code) return null
        return mergedTemplates.find(t => t.code?.toUpperCase() === code.toUpperCase()) || null
    }, [mergedTemplates])

    const getDefaultTimes = useCallback((dateStr, code, holidays = []) => {
        return computeDefaultTimes(getTemplate(code), dateStr, holidays)
    }, [getTemplate])

    // Dienstzeit in DB speichern und lokalen State aktualisieren
    const updateShiftTimeConfig = useCallback(async (shiftType, updates) => {
        const { error } = await supabase
            .from('shift_time_configs')
            .upsert(
                { shift_type: shiftType, ...updates, updated_at: new Date().toISOString() },
                { onConflict: 'shift_type' }
            )
        if (!error) {
            setDbConfigs(prev => ({
                ...prev,
                [shiftType]: { ...(prev[shiftType] || { shift_type: shiftType }), ...updates },
            }))
        }
        return !error
    }, [])

    const isPrivateType = useCallback((code) => {
        if (!code) return false
        return PRIVATE_SHIFT_TYPES.includes(code.toUpperCase())
    }, [])

    const value = useMemo(() => ({
        templates: mergedTemplates,
        getTemplate,
        getDefaultTimes,
        isPrivateType,
        dbConfigs,
        updateShiftTimeConfig,
    }), [mergedTemplates, getTemplate, getDefaultTimes, isPrivateType, dbConfigs, updateShiftTimeConfig])

    return (
        <ShiftTemplateContext.Provider value={value}>
            {children}
        </ShiftTemplateContext.Provider>
    )
}

export function useShiftTemplates() {
    const context = useContext(ShiftTemplateContext)
    if (!context) {
        throw new Error('useShiftTemplates must be used within a ShiftTemplateProvider')
    }
    return context
}

export default ShiftTemplateContext
