import { format, parseISO, isValid, differenceInCalendarDays } from 'date-fns'
import { de } from 'date-fns/locale'

export const ACTION_CATALOG = {
    shift_created: { label: 'Schicht erstellt', category: 'shifts', color: 'green', icon: 'Plus' },
    shift_updated: { label: 'Schicht bearbeitet', category: 'shifts', color: 'blue', icon: 'Edit' },
    shift_deleted: { label: 'Schicht gelöscht', category: 'shifts', color: 'red', icon: 'Trash2' },
    generate_roster: { label: 'Dienstplan generiert', category: 'shifts', color: 'green', icon: 'Calendar' },
    replace_roster: { label: 'Dienstplan ersetzt', category: 'shifts', color: 'orange', icon: 'Calendar' },
    absence_genehmigt: { label: 'Urlaub genehmigt', category: 'absences', color: 'green', icon: 'UserCheck' },
    absence_abgelehnt: { label: 'Urlaub abgelehnt', category: 'absences', color: 'red', icon: 'UserX' },
    absence_storniert: { label: 'Urlaub storniert', category: 'absences', color: 'orange', icon: 'UserX' },
    sick_report_created: { label: 'Krankmeldung erfasst', category: 'absences', color: 'orange', icon: 'Thermometer' },
    sick_leave_deleted: { label: 'Krankmeldung gelöscht', category: 'absences', color: 'red', icon: 'Trash2' },
    sick_leave_shortened: { label: 'Krankmeldung gekürzt', category: 'absences', color: 'amber', icon: 'Edit' },
    approve_report: { label: 'Monatsbericht genehmigt', category: 'reports', color: 'green', icon: 'FileCheck' },
    reject_report: { label: 'Monatsbericht abgelehnt', category: 'reports', color: 'red', icon: 'FileX' },
    time_entry_approved: { label: 'Zeiteintrag bearbeitet', category: 'reports', color: 'teal', icon: 'Clock' },
    create_correction: { label: 'Saldo-Korrektur', category: 'corrections', color: 'amber', icon: 'Plus' },
    balance_correction_deleted: { label: 'Saldo-Korrektur gelöscht', category: 'corrections', color: 'red', icon: 'Trash2' },
    employee_created: { label: 'Mitarbeiter angelegt', category: 'employees', color: 'purple', icon: 'UserPlus' },
    employee_updated: { label: 'Mitarbeiter bearbeitet', category: 'employees', color: 'blue', icon: 'Edit' },
    deactivate_user: { label: 'Mitarbeiter deaktiviert', category: 'employees', color: 'red', icon: 'UserMinus' },
    reactivate_user: { label: 'Mitarbeiter reaktiviert', category: 'employees', color: 'green', icon: 'UserCheck' },
}

export const ACTION_ALIASES = {
    absence_approved: 'absence_genehmigt',
    absence_rejected: 'absence_abgelehnt',
    urlaub_genehmigt: 'absence_genehmigt',
    urlaub_abgelehnt: 'absence_abgelehnt',
    report_approved: 'approve_report',
    bericht_genehmigt: 'approve_report',
    correction_added: 'create_correction',
    korrektur: 'create_correction',
    employee_invited: 'employee_created',
    employee_deactivated: 'deactivate_user',
    employee_reactivated: 'reactivate_user',
    krankmeldung: 'sick_report_created',
}

export const CATEGORY_LABELS = {
    shifts: 'Schichten',
    absences: 'Urlaub & Krankmeldung',
    reports: 'Berichte & Zeiteinträge',
    corrections: 'Saldo-Korrekturen',
    employees: 'Mitarbeiter',
}

export const CATEGORY_COLORS = {
    shifts: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'bg-blue-100' },
    absences: { bg: 'bg-orange-50', text: 'text-orange-700', ring: 'bg-orange-100' },
    reports: { bg: 'bg-teal-50', text: 'text-teal-700', ring: 'bg-teal-100' },
    corrections: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'bg-amber-100' },
    employees: { bg: 'bg-purple-50', text: 'text-purple-700', ring: 'bg-purple-100' },
}

export const COLOR_CLASSES = {
    green: { bg: 'bg-green-50', text: 'text-green-700', ring: 'bg-green-100', border: 'border-green-200' },
    red: { bg: 'bg-red-50', text: 'text-red-700', ring: 'bg-red-100', border: 'border-red-200' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'bg-blue-100', border: 'border-blue-200' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-700', ring: 'bg-orange-100', border: 'border-orange-200' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'bg-amber-100', border: 'border-amber-200' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-700', ring: 'bg-purple-100', border: 'border-purple-200' },
    teal: { bg: 'bg-teal-50', text: 'text-teal-700', ring: 'bg-teal-100', border: 'border-teal-200' },
    gray: { bg: 'bg-gray-50', text: 'text-gray-700', ring: 'bg-gray-100', border: 'border-gray-200' },
}

export const FIELD_LABELS = {
    start_time: 'Startzeit',
    end_time: 'Endzeit',
    start_date: 'Von',
    end_date: 'Bis',
    type: 'Typ',
    status: 'Status',
    title: 'Titel',
    full_name: 'Name',
    email: 'E-Mail',
    role: 'Rolle',
    weekly_hours: 'Wochenstunden',
    vacation_days_per_year: 'Urlaubstage/Jahr',
    initial_balance: 'Startsaldo',
    is_active: 'Aktiv',
    correction_hours: 'Korrekturstunden',
    previous_total: 'Saldo vorher',
    target_total: 'Saldo nachher',
    reason: 'Grund',
    planned_hours: 'Geplante Stunden',
    affected_shifts: 'Betroffene Schichten',
    shifts_marked_urgent: 'Als dringend markiert',
    date: 'Datum',
}

export const STATUS_LABELS = {
    pending: 'Ausstehend',
    approved: 'Genehmigt',
    genehmigt: 'Genehmigt',
    rejected: 'Abgelehnt',
    abgelehnt: 'Abgelehnt',
    cancelled: 'Storniert',
    storniert: 'Storniert',
    submitted: 'Eingereicht',
    eingereicht: 'Eingereicht',
    draft: 'Entwurf',
    offen: 'Offen',
    open: 'Offen',
    true: 'Ja',
    false: 'Nein',
}

export const ROLE_LABELS = {
    admin: 'Administrator',
    employee: 'Mitarbeiter',
}

export const SHIFT_TYPE_NAMES = {
    TD1: 'Tagdienst 1',
    TD2: 'Tagdienst 2',
    ND: 'Nachtdienst',
    DBD: 'Doppelbesetzter Dienst',
    TEAM: 'Teamsitzung',
    FORTBILDUNG: 'Fortbildung',
    EINSCHULUNG: 'Einschulungstermin',
    MITARBEITERGESPRAECH: 'Mitarbeitergespräch',
    SONSTIGES: 'Sonstiges',
    SUPERVISION: 'Supervision',
    AST: 'Anlaufstelle',
}

export const ABSENCE_TYPE_LABELS = {
    Urlaub: 'Urlaub',
    Zeitausgleich: 'Zeitausgleich',
    Krank: 'Krankmeldung',
    Sonstiges: 'Sonstiges',
}

const MONTH_NAMES = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

export function normalizeActionKey(action) {
    if (!action) return null
    return ACTION_ALIASES[action] || action
}

export function getCatalogEntry(action) {
    const key = normalizeActionKey(action)
    return ACTION_CATALOG[key] || null
}

function tryParseDate(value) {
    if (!value) return null
    if (value instanceof Date) return isValid(value) ? value : null
    if (typeof value !== 'string') return null
    const d = parseISO(value)
    return isValid(d) ? d : null
}

function formatDate(value) {
    const d = tryParseDate(value)
    if (!d) return value ?? '—'
    return format(d, 'dd.MM.yyyy', { locale: de })
}

function formatTime(value) {
    const d = tryParseDate(value)
    if (!d) return value ?? '—'
    return format(d, 'HH:mm', { locale: de })
}

function formatDateTime(value) {
    const d = tryParseDate(value)
    if (!d) return value ?? '—'
    return format(d, 'dd.MM.yyyy HH:mm', { locale: de })
}

function formatMonthLabel(yearOrStr, month) {
    // Accepts (2026, 3) or ('2026-03') or ('2026-03-01')
    let y, m
    if (typeof yearOrStr === 'string') {
        const parts = yearOrStr.split('-')
        y = parseInt(parts[0], 10)
        m = parseInt(parts[1], 10)
    } else {
        y = yearOrStr
        m = month
    }
    if (!y || !m || m < 1 || m > 12) return null
    return `${MONTH_NAMES[m - 1]} ${y}`
}

function formatHours(hours) {
    if (hours === null || hours === undefined) return '—'
    const n = Number(hours)
    if (Number.isNaN(n)) return String(hours)
    const sign = n > 0 ? '+' : ''
    return `${sign}${n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} h`
}

function formatDateRange(startValue, endValue) {
    const start = tryParseDate(startValue)
    const end = tryParseDate(endValue)
    if (!start) return null
    const startStr = format(start, 'dd.MM.yyyy', { locale: de })
    if (!end) return startStr
    const endStr = format(end, 'dd.MM.yyyy', { locale: de })
    if (startStr === endStr) return startStr
    const days = differenceInCalendarDays(end, start) + 1
    return `${startStr} – ${endStr} (${days} ${days === 1 ? 'Tag' : 'Tage'})`
}

function shiftTypeLabel(type) {
    if (!type) return null
    return SHIFT_TYPE_NAMES[type] || null
}

function absenceTypeLabel(type) {
    if (!type) return null
    return ABSENCE_TYPE_LABELS[type] || null
}

export function formatValue(key, value) {
    if (value === null || value === undefined || value === '') return '—'

    if (key === 'status') return STATUS_LABELS[String(value).toLowerCase()] || String(value)
    if (key === 'role') return ROLE_LABELS[String(value).toLowerCase()] || String(value)
    if (key === 'is_active') return STATUS_LABELS[String(value)] || (value ? 'Ja' : 'Nein')
    if (key === 'type') {
        return shiftTypeLabel(value) || absenceTypeLabel(value) || String(value)
    }
    if (key?.endsWith?.('_date') || key === 'date') return formatDate(value)
    if (key?.endsWith?.('_time')) return formatTime(value)
    if (key === 'weekly_hours' || key === 'planned_hours') {
        const n = Number(value)
        if (Number.isNaN(n)) return String(value)
        return `${n.toLocaleString('de-DE')} h`
    }
    if (key === 'correction_hours' || key === 'previous_total' || key === 'target_total' || key === 'initial_balance') {
        return formatHours(value)
    }
    if (key === 'vacation_days_per_year') return `${Number(value).toLocaleString('de-DE')} Tage`
    if (typeof value === 'boolean') return value ? 'Ja' : 'Nein'
    if (Array.isArray(value)) return `${value.length} Einträge`
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
}

export function getFieldLabel(key) {
    return FIELD_LABELS[key] || key
}

function buildDiffs(before, after, keysAllowList = null) {
    if (!before || !after) return []
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])
    const result = []
    for (const key of allKeys) {
        if (keysAllowList && !keysAllowList.includes(key)) continue
        if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue
        result.push({
            field: key,
            fieldLabel: getFieldLabel(key),
            before: formatValue(key, before[key]),
            after: formatValue(key, after[key]),
        })
    }
    return result
}

function formatShiftEntry(actionKey, log) {
    const changes = log.changes || {}
    const metadata = log.metadata || {}

    if (actionKey === 'shift_created') {
        const date = changes.date || changes.after?.date
        const type = changes.type || changes.after?.type
        const start = changes.start_time || changes.after?.start_time
        const end = changes.end_time || changes.after?.end_time
        const typeLbl = shiftTypeLabel(type) || 'Schicht'
        const dateStr = date ? formatDate(date) : (start ? formatDate(start) : null)
        const timeStr = start && end ? `${formatTime(start)}–${formatTime(end)}` : null
        const headline = [typeLbl, dateStr && `am ${dateStr}`, timeStr && `(${timeStr})`].filter(Boolean).join(' ')
        return {
            headline: headline || 'Schicht erstellt',
            chips: [],
            diffs: [],
            summary: `${typeLbl}${dateStr ? ` am ${dateStr}` : ''}${timeStr ? ` ${timeStr}` : ''} erstellt`,
        }
    }

    if (actionKey === 'shift_updated') {
        const before = changes.before || {}
        const after = changes.after || {}
        const type = after.type || before.type
        const date = after.start_time || before.start_time
        const typeLbl = shiftTypeLabel(type) || 'Schicht'
        const dateStr = date ? formatDate(date) : null
        const diffs = buildDiffs(before, after, ['start_time', 'end_time', 'type', 'title'])
        const headline = `${typeLbl}${dateStr ? ` am ${dateStr}` : ''} bearbeitet`
        return {
            headline,
            chips: [],
            diffs,
            summary: diffs.length
                ? `${typeLbl}${dateStr ? ` am ${dateStr}` : ''}: ${diffs.map(d => `${d.fieldLabel} ${d.before} → ${d.after}`).join(', ')}`
                : headline,
        }
    }

    if (actionKey === 'shift_deleted') {
        const deleted = changes.deleted || changes || {}
        const type = deleted.type
        const start = deleted.start_time
        const typeLbl = shiftTypeLabel(type) || 'Schicht'
        const dateStr = start ? formatDate(start) : null
        return {
            headline: `${typeLbl}${dateStr ? ` am ${dateStr}` : ''} gelöscht`,
            chips: [],
            diffs: [],
            summary: `${typeLbl}${dateStr ? ` am ${dateStr}` : ''} gelöscht`,
        }
    }

    if (actionKey === 'generate_roster' || actionKey === 'replace_roster') {
        const monthStr = metadata.month ? formatMonthLabel(metadata.month) : null
        const created = metadata.created ?? 0
        const skipped = metadata.skipped ?? 0
        const deleted = metadata.deleted ?? 0
        const chips = []
        if (created) chips.push({ label: `${created} erstellt`, color: 'green' })
        if (skipped) chips.push({ label: `${skipped} übersprungen`, color: 'gray' })
        if (deleted) chips.push({ label: `${deleted} gelöscht`, color: 'red' })
        const verb = actionKey === 'generate_roster' ? 'generiert' : 'ersetzt'
        const headline = `Dienstplan${monthStr ? ` für ${monthStr}` : ''} ${verb}`
        return {
            headline,
            chips,
            diffs: [],
            summary: `${headline} — ${chips.map(c => c.label).join(', ') || 'keine Änderungen'}`,
        }
    }

    return null
}

function formatAbsenceEntry(actionKey, log) {
    const changes = log.changes || {}
    const context = changes.context || {}
    const beforeStatus = changes.before?.status
    const afterStatus = changes.after?.status

    if (actionKey === 'absence_genehmigt' || actionKey === 'absence_abgelehnt' || actionKey === 'absence_storniert') {
        const rangeStr = context.start_date ? formatDateRange(context.start_date, context.end_date) : null
        const typeLbl = absenceTypeLabel(context.type) || 'Urlaub'
        const verb = actionKey === 'absence_genehmigt' ? 'genehmigt'
            : actionKey === 'absence_abgelehnt' ? 'abgelehnt' : 'storniert'
        const headline = `${typeLbl}${rangeStr ? ` ${rangeStr}` : ''} ${verb}`
        const diffs = beforeStatus && afterStatus ? [{
            field: 'status',
            fieldLabel: 'Status',
            before: formatValue('status', beforeStatus),
            after: formatValue('status', afterStatus),
        }] : []
        return {
            headline,
            chips: context.type ? [{ label: typeLbl, color: 'blue' }] : [],
            diffs,
            summary: headline,
        }
    }

    if (actionKey === 'sick_report_created') {
        const after = changes.after || {}
        const rangeStr = after.start_date ? formatDateRange(after.start_date, after.end_date) : null
        const hours = after.planned_hours
        const affected = Array.isArray(after.affected_shifts) ? after.affected_shifts.length : null
        const parts = []
        if (rangeStr) parts.push(rangeStr)
        if (hours) parts.push(`${Number(hours).toLocaleString('de-DE')} h`)
        if (affected !== null) parts.push(`${affected} ${affected === 1 ? 'Schicht' : 'Schichten'} betroffen`)
        const headline = `Krankmeldung ${parts.join(' · ') || 'erfasst'}`
        return {
            headline,
            chips: [],
            diffs: [],
            summary: headline,
        }
    }

    if (actionKey === 'sick_leave_deleted') {
        const before = changes.before || {}
        const rangeStr = before.start_date ? formatDateRange(before.start_date, before.end_date) : null
        const reason = log.metadata?.reason
        return {
            headline: `Krankmeldung${rangeStr ? ` ${rangeStr}` : ''} gelöscht`,
            chips: [],
            diffs: reason ? [{ field: 'reason', fieldLabel: 'Grund', before: '—', after: reason }] : [],
            summary: `Krankmeldung${rangeStr ? ` ${rangeStr}` : ''} gelöscht${reason ? ` (${reason})` : ''}`,
        }
    }

    if (actionKey === 'sick_leave_shortened') {
        const before = changes.before || {}
        const after = changes.after || {}
        const rangeStr = before.start_date ? formatDateRange(before.start_date, before.end_date) : null
        const diffs = []
        if (before.end_date && after.end_date) {
            diffs.push({
                field: 'end_date',
                fieldLabel: 'Bis',
                before: formatDate(before.end_date),
                after: formatDate(after.end_date),
            })
        }
        return {
            headline: `Krankmeldung${rangeStr ? ` (${rangeStr})` : ''} gekürzt`,
            chips: [],
            diffs,
            summary: diffs.length
                ? `Krankmeldung gekürzt — Bis: ${diffs[0].before} → ${diffs[0].after}`
                : 'Krankmeldung gekürzt',
        }
    }

    return null
}

function formatReportEntry(actionKey, log) {
    const changes = log.changes || {}
    const metadata = log.metadata || {}

    if (actionKey === 'approve_report' || actionKey === 'reject_report') {
        const monthStr = metadata.year && metadata.month ? formatMonthLabel(metadata.year, metadata.month) : null
        const verb = actionKey === 'approve_report' ? 'genehmigt' : 'abgelehnt'
        const diffs = []
        if (changes.before?.status && changes.after?.status) {
            diffs.push({
                field: 'status',
                fieldLabel: 'Status',
                before: formatValue('status', changes.before.status),
                after: formatValue('status', changes.after.status),
            })
        }
        return {
            headline: `Monatsbericht${monthStr ? ` ${monthStr}` : ''} ${verb}`,
            chips: [],
            diffs,
            summary: `Monatsbericht${monthStr ? ` ${monthStr}` : ''} ${verb}`,
        }
    }

    if (actionKey === 'time_entry_approved') {
        const before = changes.before || {}
        const after = changes.after || {}
        const dayStr = before.start_time || after.start_time
            ? formatDate(before.start_time || after.start_time)
            : null
        const diffs = buildDiffs(before, after)
        return {
            headline: `Zeiteintrag${dayStr ? ` am ${dayStr}` : ''} bearbeitet`,
            chips: [],
            diffs,
            summary: diffs.length
                ? `Zeiteintrag${dayStr ? ` ${dayStr}` : ''}: ${diffs.map(d => `${d.fieldLabel} ${d.before} → ${d.after}`).join(', ')}`
                : `Zeiteintrag${dayStr ? ` ${dayStr}` : ''} bearbeitet`,
        }
    }

    return null
}

function formatCorrectionEntry(actionKey, log) {
    const changes = log.changes || {}
    const metadata = log.metadata || {}

    if (actionKey === 'create_correction') {
        const hours = changes.correction_hours
        const reason = changes.reason
        const monthStr = metadata.month ? formatMonthLabel(metadata.month) : null
        const hoursStr = hours !== undefined ? formatHours(hours) : null
        const diffs = []
        if (changes.previous_total !== undefined && changes.target_total !== undefined) {
            diffs.push({
                field: 'balance',
                fieldLabel: 'Saldo',
                before: formatHours(changes.previous_total),
                after: formatHours(changes.target_total),
            })
        }
        if (reason) {
            diffs.push({ field: 'reason', fieldLabel: 'Grund', before: '—', after: reason })
        }
        return {
            headline: `Saldo-Korrektur ${hoursStr || ''}${monthStr ? ` (${monthStr})` : ''}`.trim(),
            chips: [],
            diffs,
            summary: `Saldo-Korrektur ${hoursStr || ''}${monthStr ? ` (${monthStr})` : ''}${reason ? ` — ${reason}` : ''}`.trim(),
        }
    }

    if (actionKey === 'balance_correction_deleted') {
        const before = changes.before || {}
        const hoursStr = before.correction_hours !== undefined ? formatHours(before.correction_hours) : null
        const reason = before.reason
        return {
            headline: `Saldo-Korrektur${hoursStr ? ` ${hoursStr}` : ''} gelöscht`,
            chips: [],
            diffs: reason ? [{ field: 'reason', fieldLabel: 'Grund', before: '—', after: reason }] : [],
            summary: `Saldo-Korrektur${hoursStr ? ` ${hoursStr}` : ''} gelöscht${reason ? ` (${reason})` : ''}`,
        }
    }

    return null
}

function formatEmployeeEntry(actionKey, log) {
    const changes = log.changes || {}
    const after = changes.after || {}

    if (actionKey === 'employee_created') {
        const nameChip = after.full_name ? after.full_name : null
        const headline = nameChip ? `${nameChip} angelegt` : 'Mitarbeiter angelegt'
        const diffs = []
        const fields = ['email', 'role', 'weekly_hours', 'vacation_days_per_year', 'initial_balance']
        for (const key of fields) {
            if (after[key] !== undefined && after[key] !== null && after[key] !== '') {
                diffs.push({
                    field: key,
                    fieldLabel: getFieldLabel(key),
                    before: '—',
                    after: formatValue(key, after[key]),
                })
            }
        }
        return {
            headline,
            chips: [],
            diffs,
            summary: `${headline}${diffs.length ? ` — ${diffs.map(d => `${d.fieldLabel}: ${d.after}`).join(', ')}` : ''}`,
        }
    }

    if (actionKey === 'employee_updated') {
        const before = changes.before || {}
        const diffs = buildDiffs(before, after)
        return {
            headline: 'Mitarbeiter bearbeitet',
            chips: [],
            diffs,
            summary: diffs.length
                ? `Mitarbeiter bearbeitet — ${diffs.map(d => `${d.fieldLabel}: ${d.before} → ${d.after}`).join(', ')}`
                : 'Mitarbeiter bearbeitet',
        }
    }

    if (actionKey === 'deactivate_user') {
        return {
            headline: 'Mitarbeiter deaktiviert',
            chips: [],
            diffs: [],
            summary: 'Mitarbeiter deaktiviert',
        }
    }

    if (actionKey === 'reactivate_user') {
        return {
            headline: 'Mitarbeiter reaktiviert',
            chips: [],
            diffs: [],
            summary: 'Mitarbeiter reaktiviert',
        }
    }

    return null
}

function formatGenericEntry(log) {
    const changes = log.changes || {}
    if (changes.before && changes.after) {
        const diffs = buildDiffs(changes.before, changes.after)
        return {
            headline: log.action || 'Aktion',
            chips: [],
            diffs,
            summary: diffs.map(d => `${d.fieldLabel}: ${d.before} → ${d.after}`).join(', ') || (log.action || ''),
        }
    }
    return { headline: log.action || 'Aktion', chips: [], diffs: [], summary: log.action || '' }
}

export function formatAuditEntry(log) {
    const actionKey = normalizeActionKey(log.action)
    const catalog = ACTION_CATALOG[actionKey]

    const base = {
        actionKey,
        rawAction: log.action,
        label: catalog?.label || log.action || 'Unbekannte Aktion',
        category: catalog?.category || 'other',
        color: catalog?.color || 'gray',
        icon: catalog?.icon || 'Activity',
        adminName: log.admin?.full_name || null,
        targetName: log.target?.full_name || null,
        createdAt: log.created_at,
    }

    const category = catalog?.category
    let formatted = null
    if (category === 'shifts') formatted = formatShiftEntry(actionKey, log)
    else if (category === 'absences') formatted = formatAbsenceEntry(actionKey, log)
    else if (category === 'reports') formatted = formatReportEntry(actionKey, log)
    else if (category === 'corrections') formatted = formatCorrectionEntry(actionKey, log)
    else if (category === 'employees') formatted = formatEmployeeEntry(actionKey, log)

    if (!formatted) formatted = formatGenericEntry(log)

    return {
        ...base,
        headline: formatted.headline,
        chips: formatted.chips || [],
        diffs: formatted.diffs || [],
        summary: formatted.summary || formatted.headline,
    }
}

export { formatDate, formatTime, formatDateTime, formatDateRange, formatMonthLabel, formatHours }
