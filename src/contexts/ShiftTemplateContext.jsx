import { createContext, useContext, useMemo } from 'react'

/**
 * ShiftTemplateContext
 * 
 * Provides shift templates to all components.
 * Templates are defined locally (no DB dependency for single-team mode).
 * 
 * NOTE: Multi-Tenancy was paused (Dec 2025). If needed in the future,
 * this can be extended to load templates from Supabase shift_templates table.
 * 
 * Usage:
 *   const { templates, getTemplate } = useShiftTemplates()
 *   const ndTemplate = getTemplate('ND')
 */

const ShiftTemplateContext = createContext({
    templates: [],
    getTemplate: () => null,
    getDefaultTimes: () => ({ start: null, end: null }),
})

// Shift Templates for WoBe-Team (Single Source of Truth)
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
]

// Shift types that are only visible to assigned participants and admins
export const PRIVATE_SHIFT_TYPES = SHIFT_TEMPLATES.filter(t => t.private).map(t => t.code)

export function ShiftTemplateProvider({ children }) {
    /**
     * Get a template by its code
     */
    const getTemplate = (code) => {
        if (!code) return null
        return SHIFT_TEMPLATES.find(t => t.code?.toUpperCase() === code.toUpperCase()) || null
    }

    /**
     * Get default start/end times for a shift type on a given date
     * Respects weekday_rules for special times on weekends/holidays
     */
    const getDefaultTimes = (dateStr, code, holidays = []) => {
        const template = getTemplate(code)
        if (!template) return { start: null, end: null }

        const date = new Date(dateStr)
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()

        // Check for holiday
        const isHoliday = holidays.some(h => {
            const hDate = new Date(h.date || h)
            return hDate.toDateString() === date.toDateString()
        })

        // Determine which rules to apply
        let startTime = template.start_time
        let endTime = template.end_time

        const rules = template.weekday_rules || {}

        // Priority: Holiday > Specific Day > Default
        if (isHoliday && rules.holiday) {
            startTime = rules.holiday.start || startTime
            endTime = rules.holiday.end || endTime
        } else if (rules[dayName]) {
            startTime = rules[dayName].start || startTime
            endTime = rules[dayName].end || endTime
        }

        // Convert time strings to full datetime strings
        const createDateTime = (timeStr, addDays = 0) => {
            const [hours, minutes] = timeStr.split(':').map(Number)
            const d = new Date(date)
            d.setHours(hours, minutes, 0, 0)
            if (addDays > 0) d.setDate(d.getDate() + addDays)
            return d
        }

        const start = createDateTime(startTime)
        let end = createDateTime(endTime)

        // If spans midnight, add 1 day to end time
        if (template.spans_midnight) {
            end = createDateTime(endTime, 1)
        }

        return { start, end }
    }

    const isPrivateType = (code) => {
        if (!code) return false
        return PRIVATE_SHIFT_TYPES.includes(code.toUpperCase())
    }

    // Memoize the value to prevent unnecessary re-renders
    const value = useMemo(() => ({
        templates: SHIFT_TEMPLATES,
        getTemplate,
        getDefaultTimes,
        isPrivateType,
    }), [])

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
