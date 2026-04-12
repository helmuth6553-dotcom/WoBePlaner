import { describe, it, expect } from 'vitest'
import {
    ACTION_CATALOG,
    ACTION_ALIASES,
    normalizeActionKey,
    getCatalogEntry,
    formatValue,
    formatAuditEntry,
} from './auditFormatting'

describe('normalizeActionKey', () => {
    it('returns canonical key for known aliases', () => {
        expect(normalizeActionKey('absence_approved')).toBe('absence_genehmigt')
        expect(normalizeActionKey('absence_rejected')).toBe('absence_abgelehnt')
        expect(normalizeActionKey('urlaub_genehmigt')).toBe('absence_genehmigt')
        expect(normalizeActionKey('bericht_genehmigt')).toBe('approve_report')
        expect(normalizeActionKey('employee_deactivated')).toBe('deactivate_user')
        expect(normalizeActionKey('krankmeldung')).toBe('sick_report_created')
    })

    it('returns input unchanged for canonical keys', () => {
        expect(normalizeActionKey('shift_created')).toBe('shift_created')
        expect(normalizeActionKey('approve_report')).toBe('approve_report')
    })

    it('returns null for falsy input', () => {
        expect(normalizeActionKey(null)).toBe(null)
        expect(normalizeActionKey(undefined)).toBe(null)
        expect(normalizeActionKey('')).toBe(null)
    })

    it('all aliases resolve to catalog entries', () => {
        for (const alias of Object.keys(ACTION_ALIASES)) {
            const key = normalizeActionKey(alias)
            expect(ACTION_CATALOG[key], `alias ${alias} -> ${key}`).toBeDefined()
        }
    })
})

describe('getCatalogEntry', () => {
    it('returns entry for canonical action', () => {
        const entry = getCatalogEntry('shift_created')
        expect(entry.label).toBe('Schicht erstellt')
        expect(entry.category).toBe('shifts')
    })

    it('resolves alias before lookup', () => {
        const entry = getCatalogEntry('absence_approved')
        expect(entry.label).toBe('Urlaub genehmigt')
    })

    it('returns null for unknown action', () => {
        expect(getCatalogEntry('totally_unknown')).toBe(null)
    })
})

describe('formatValue', () => {
    it('translates status values to German', () => {
        expect(formatValue('status', 'pending')).toBe('Ausstehend')
        expect(formatValue('status', 'approved')).toBe('Genehmigt')
        expect(formatValue('status', 'rejected')).toBe('Abgelehnt')
        expect(formatValue('status', 'genehmigt')).toBe('Genehmigt')
    })

    it('translates role values to German', () => {
        expect(formatValue('role', 'admin')).toBe('Administrator')
        expect(formatValue('role', 'employee')).toBe('Mitarbeiter')
    })

    it('formats is_active as Ja/Nein', () => {
        expect(formatValue('is_active', true)).toBe('Ja')
        expect(formatValue('is_active', false)).toBe('Nein')
    })

    it('formats shift type codes to full names', () => {
        expect(formatValue('type', 'ND')).toBe('Nachtdienst')
        expect(formatValue('type', 'TD1')).toBe('Tagdienst 1')
        expect(formatValue('type', 'AST')).toBe('Anlaufstelle')
    })

    it('formats absence type passthrough', () => {
        expect(formatValue('type', 'Urlaub')).toBe('Urlaub')
        expect(formatValue('type', 'Krank')).toBe('Krankmeldung')
    })

    it('formats date fields as German date', () => {
        expect(formatValue('start_date', '2026-04-15')).toBe('15.04.2026')
        expect(formatValue('end_date', '2026-12-01')).toBe('01.12.2026')
    })

    it('formats time fields as HH:mm', () => {
        expect(formatValue('start_time', '2026-04-15T07:30:00Z')).toMatch(/^\d{2}:\d{2}$/)
    })

    it('formats weekly_hours with unit', () => {
        expect(formatValue('weekly_hours', 40)).toBe('40 h')
    })

    it('formats correction_hours with sign', () => {
        expect(formatValue('correction_hours', 4.5)).toBe('+4,5 h')
        expect(formatValue('correction_hours', -2)).toBe('-2,0 h')
    })

    it('formats vacation_days with unit', () => {
        expect(formatValue('vacation_days_per_year', 25)).toBe('25 Tage')
    })

    it('handles null/undefined gracefully', () => {
        expect(formatValue('anything', null)).toBe('—')
        expect(formatValue('anything', undefined)).toBe('—')
        expect(formatValue('anything', '')).toBe('—')
    })
})

describe('formatAuditEntry — shift actions', () => {
    it('shift_created: shows type + date + time', () => {
        const log = {
            action: 'shift_created',
            changes: { date: '2026-04-15', type: 'ND', start_time: '2026-04-15T22:00:00Z', end_time: '2026-04-16T06:00:00Z' },
        }
        const r = formatAuditEntry(log)
        expect(r.label).toBe('Schicht erstellt')
        expect(r.category).toBe('shifts')
        expect(r.headline).toContain('Nachtdienst')
        expect(r.headline).toContain('15.04.2026')
    })

    it('shift_updated: returns before/after diffs', () => {
        const log = {
            action: 'shift_updated',
            changes: {
                before: { start_time: '2026-04-15T22:00:00Z', end_time: '2026-04-16T06:00:00Z', type: 'ND' },
                after: { start_time: '2026-04-15T23:00:00Z', end_time: '2026-04-16T07:00:00Z', type: 'ND' },
            },
        }
        const r = formatAuditEntry(log)
        expect(r.headline).toContain('bearbeitet')
        expect(r.diffs.length).toBe(2)
        expect(r.diffs.find(d => d.field === 'start_time')).toBeDefined()
    })

    it('shift_deleted: shows deleted shift info', () => {
        const log = {
            action: 'shift_deleted',
            changes: { deleted: { type: 'AST', start_time: '2026-04-12T09:00:00Z' } },
        }
        const r = formatAuditEntry(log)
        expect(r.headline).toContain('Anlaufstelle')
        expect(r.headline).toContain('gelöscht')
    })

    it('generate_roster: shows month + stats chips', () => {
        const log = {
            action: 'generate_roster',
            metadata: { month: '2026-03', created: 20, skipped: 2 },
        }
        const r = formatAuditEntry(log)
        expect(r.headline).toContain('März 2026')
        expect(r.headline).toContain('generiert')
        expect(r.chips.some(c => c.label === '20 erstellt')).toBe(true)
        expect(r.chips.some(c => c.label === '2 übersprungen')).toBe(true)
    })

    it('replace_roster: shows deleted + created chips', () => {
        const log = {
            action: 'replace_roster',
            metadata: { month: '2026-05', created: 23, deleted: 5 },
        }
        const r = formatAuditEntry(log)
        expect(r.headline).toContain('Mai 2026')
        expect(r.headline).toContain('ersetzt')
        expect(r.chips.some(c => c.label === '23 erstellt')).toBe(true)
        expect(r.chips.some(c => c.label === '5 gelöscht')).toBe(true)
    })
})

describe('formatAuditEntry — absence actions', () => {
    it('absence_genehmigt: shows date range + status diff', () => {
        const log = {
            action: 'absence_genehmigt',
            changes: {
                before: { status: 'pending' },
                after: { status: 'genehmigt' },
                context: { type: 'Urlaub', start_date: '2026-04-12', end_date: '2026-04-15' },
            },
        }
        const r = formatAuditEntry(log)
        expect(r.headline).toContain('Urlaub')
        expect(r.headline).toContain('12.04.2026')
        expect(r.headline).toContain('15.04.2026')
        expect(r.headline).toContain('genehmigt')
        expect(r.diffs[0].before).toBe('Ausstehend')
        expect(r.diffs[0].after).toBe('Genehmigt')
    })

    it('absence_approved (alias) resolves to same formatter', () => {
        const log = {
            action: 'absence_approved',
            changes: {
                before: { status: 'pending' },
                after: { status: 'approved' },
                context: { type: 'Urlaub', start_date: '2026-04-12', end_date: '2026-04-15' },
            },
        }
        const r = formatAuditEntry(log)
        expect(r.actionKey).toBe('absence_genehmigt')
        expect(r.label).toBe('Urlaub genehmigt')
    })

    it('absence_storniert: shows storniert verb', () => {
        const log = {
            action: 'absence_storniert',
            changes: {
                before: { status: 'genehmigt' },
                after: { status: 'storniert' },
                context: { type: 'Urlaub', start_date: '2026-04-12', end_date: '2026-04-15' },
            },
        }
        const r = formatAuditEntry(log)
        expect(r.headline).toContain('storniert')
    })

    it('sick_report_created: shows range + hours + affected shifts', () => {
        const log = {
            action: 'sick_report_created',
            changes: {
                after: {
                    start_date: '2026-04-12',
                    end_date: '2026-04-15',
                    type: 'Krank',
                    planned_hours: 24,
                    affected_shifts: ['s1', 's2', 's3'],
                },
            },
        }
        const r = formatAuditEntry(log)
        expect(r.headline).toContain('Krankmeldung')
        expect(r.headline).toContain('24 h')
        expect(r.headline).toContain('3 Schichten')
    })

    it('sick_leave_deleted: shows range + reason', () => {
        const log = {
            action: 'sick_leave_deleted',
            changes: { before: { start_date: '2026-04-12', end_date: '2026-04-15' } },
            metadata: { reason: 'Versehentlich erfasst' },
        }
        const r = formatAuditEntry(log)
        expect(r.headline).toContain('gelöscht')
        expect(r.diffs.some(d => d.fieldLabel === 'Grund')).toBe(true)
    })

    it('sick_leave_shortened: shows end_date diff', () => {
        const log = {
            action: 'sick_leave_shortened',
            changes: {
                before: { start_date: '2026-04-12', end_date: '2026-04-15' },
                after: { end_date: '2026-04-13' },
            },
        }
        const r = formatAuditEntry(log)
        expect(r.headline).toContain('gekürzt')
        expect(r.diffs.find(d => d.field === 'end_date').before).toBe('15.04.2026')
        expect(r.diffs.find(d => d.field === 'end_date').after).toBe('13.04.2026')
    })
})

describe('formatAuditEntry — report actions', () => {
    it('approve_report: shows month + status diff', () => {
        const log = {
            action: 'approve_report',
            changes: { before: { status: 'submitted' }, after: { status: 'genehmigt' } },
            metadata: { year: 2026, month: 3 },
        }
        const r = formatAuditEntry(log)
        expect(r.headline).toContain('März 2026')
        expect(r.headline).toContain('genehmigt')
    })

    it('reject_report: shows month + abgelehnt', () => {
        const log = {
            action: 'reject_report',
            changes: { before: { status: 'submitted' }, after: { status: 'abgelehnt' } },
            metadata: { year: 2026, month: 4 },
        }
        const r = formatAuditEntry(log)
        expect(r.headline).toContain('April 2026')
        expect(r.headline).toContain('abgelehnt')
    })

    it('time_entry_approved: shows diffs', () => {
        const log = {
            action: 'time_entry_approved',
            changes: {
                before: { start_time: '2026-04-12T07:00:00Z' },
                after: { start_time: '2026-04-12T07:15:00Z' },
            },
        }
        const r = formatAuditEntry(log)
        expect(r.headline).toContain('Zeiteintrag')
        expect(r.diffs.length).toBe(1)
    })
})

describe('formatAuditEntry — correction actions', () => {
    it('create_correction: shows hours + month + reason diff', () => {
        const log = {
            action: 'create_correction',
            changes: { correction_hours: 4.5, previous_total: 10, target_total: 14.5, reason: 'Ausgleich' },
            metadata: { month: '2026-03' },
        }
        const r = formatAuditEntry(log)
        expect(r.headline).toContain('Saldo-Korrektur')
        expect(r.headline).toContain('+4,5 h')
        expect(r.headline).toContain('März 2026')
        expect(r.diffs.some(d => d.fieldLabel === 'Saldo')).toBe(true)
        expect(r.diffs.some(d => d.fieldLabel === 'Grund')).toBe(true)
    })

    it('balance_correction_deleted: shows hours', () => {
        const log = {
            action: 'balance_correction_deleted',
            changes: { before: { correction_hours: -2, reason: 'Falsch eingetragen' } },
        }
        const r = formatAuditEntry(log)
        expect(r.headline).toContain('gelöscht')
        expect(r.headline).toContain('-2,0 h')
    })
})

describe('formatAuditEntry — employee actions', () => {
    it('employee_created: shows name + key fields', () => {
        const log = {
            action: 'employee_created',
            changes: {
                after: {
                    full_name: 'Anna Muster',
                    email: 'anna@example.com',
                    role: 'employee',
                    weekly_hours: 40,
                    vacation_days_per_year: 25,
                    initial_balance: 0,
                },
            },
        }
        const r = formatAuditEntry(log)
        expect(r.headline).toContain('Anna Muster')
        expect(r.headline).toContain('angelegt')
        expect(r.diffs.find(d => d.field === 'email').after).toBe('anna@example.com')
        expect(r.diffs.find(d => d.field === 'role').after).toBe('Mitarbeiter')
        expect(r.diffs.find(d => d.field === 'weekly_hours').after).toBe('40 h')
        expect(r.diffs.find(d => d.field === 'vacation_days_per_year').after).toBe('25 Tage')
    })

    it('employee_updated: returns diffs', () => {
        const log = {
            action: 'employee_updated',
            changes: {
                before: { weekly_hours: 40, vacation_days_per_year: 25 },
                after: { weekly_hours: 30, vacation_days_per_year: 25 },
            },
        }
        const r = formatAuditEntry(log)
        expect(r.diffs.length).toBe(1)
        expect(r.diffs[0].field).toBe('weekly_hours')
        expect(r.diffs[0].before).toBe('40 h')
        expect(r.diffs[0].after).toBe('30 h')
    })

    it('deactivate_user: simple headline', () => {
        const r = formatAuditEntry({ action: 'deactivate_user' })
        expect(r.headline).toBe('Mitarbeiter deaktiviert')
    })

    it('reactivate_user: simple headline', () => {
        const r = formatAuditEntry({ action: 'reactivate_user' })
        expect(r.headline).toBe('Mitarbeiter reaktiviert')
    })
})

describe('formatAuditEntry — robustness', () => {
    it('handles unknown action gracefully', () => {
        const r = formatAuditEntry({ action: 'foo_bar_unknown' })
        expect(r.actionKey).toBe('foo_bar_unknown')
        expect(r.label).toBe('foo_bar_unknown')
        expect(r.category).toBe('other')
    })

    it('handles missing changes/metadata', () => {
        const r = formatAuditEntry({ action: 'shift_created' })
        expect(r).toBeDefined()
        expect(r.diffs).toEqual([])
    })

    it('every catalog action has a catalog entry with label, category, color, icon', () => {
        for (const [key, entry] of Object.entries(ACTION_CATALOG)) {
            expect(entry.label, `${key} label`).toBeTruthy()
            expect(entry.category, `${key} category`).toBeTruthy()
            expect(entry.color, `${key} color`).toBeTruthy()
            expect(entry.icon, `${key} icon`).toBeTruthy()
        }
    })
})
