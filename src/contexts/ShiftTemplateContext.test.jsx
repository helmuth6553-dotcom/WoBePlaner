/**
 * Tests for ShiftTemplateContext
 *
 * Verifies shift templates, default times, weekday rules,
 * and private shift type detection.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { ShiftTemplateProvider, useShiftTemplates, PRIVATE_SHIFT_TYPES } from './ShiftTemplateContext'

// Mock Supabase — DB-Konfigurationen werden in diesen Tests nicht benötigt
vi.mock('../supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => Promise.resolve({ data: null, error: null }))
        }))
    }
}))

const wrapper = ({ children }) => (
    <ShiftTemplateProvider>{children}</ShiftTemplateProvider>
)

describe('ShiftTemplateContext', () => {
    // =============================================================================
    // templates
    // =============================================================================

    it('provides all expected shift templates', () => {
        const { result } = renderHook(() => useShiftTemplates(), { wrapper })

        const codes = result.current.templates.map(t => t.code)
        expect(codes).toContain('TD1')
        expect(codes).toContain('TD2')
        expect(codes).toContain('ND')
        expect(codes).toContain('DBD')
        expect(codes).toContain('TEAM')
        expect(codes).toContain('FORTBILDUNG')
        expect(codes).toContain('EINSCHULUNG')
        expect(codes).toContain('MITARBEITERGESPRAECH')
        expect(codes).toContain('SONSTIGES')
    })

    it('each template has required fields', () => {
        const { result } = renderHook(() => useShiftTemplates(), { wrapper })

        result.current.templates.forEach(t => {
            expect(t.code).toBeTruthy()
            expect(t.name).toBeTruthy()
            expect(t.start_time).toMatch(/^\d{2}:\d{2}$/)
            expect(t.end_time).toMatch(/^\d{2}:\d{2}$/)
            expect(typeof t.spans_midnight).toBe('boolean')
            expect(t.color).toMatch(/^#[0-9a-f]{6}$/)
            expect(typeof t.has_standby).toBe('boolean')
        })
    })

    // =============================================================================
    // getTemplate
    // =============================================================================

    it('getTemplate returns correct template by code', () => {
        const { result } = renderHook(() => useShiftTemplates(), { wrapper })

        const nd = result.current.getTemplate('ND')
        expect(nd).not.toBeNull()
        expect(nd.name).toBe('Nachtdienst')
        expect(nd.spans_midnight).toBe(true)
        expect(nd.has_standby).toBe(true)
    })

    it('getTemplate is case-insensitive', () => {
        const { result } = renderHook(() => useShiftTemplates(), { wrapper })

        expect(result.current.getTemplate('nd')).not.toBeNull()
        expect(result.current.getTemplate('Nd')).not.toBeNull()
        expect(result.current.getTemplate('ND')).not.toBeNull()
    })

    it('getTemplate returns null for unknown code', () => {
        const { result } = renderHook(() => useShiftTemplates(), { wrapper })
        expect(result.current.getTemplate('UNKNOWN')).toBeNull()
    })

    it('getTemplate returns null for null/empty', () => {
        const { result } = renderHook(() => useShiftTemplates(), { wrapper })
        expect(result.current.getTemplate(null)).toBeNull()
        expect(result.current.getTemplate('')).toBeNull()
    })

    // =============================================================================
    // getDefaultTimes
    // =============================================================================

    it('returns correct default times for TD1', () => {
        const { result } = renderHook(() => useShiftTemplates(), { wrapper })

        // Wednesday (normal weekday)
        const times = result.current.getDefaultTimes('2025-01-08', 'TD1')
        expect(times.start).toBeInstanceOf(Date)
        expect(times.end).toBeInstanceOf(Date)
        expect(times.start.getHours()).toBe(7)
        expect(times.start.getMinutes()).toBe(30)
        expect(times.end.getHours()).toBe(14)
        expect(times.end.getMinutes()).toBe(30)
    })

    it('applies Saturday rules for TD1', () => {
        const { result } = renderHook(() => useShiftTemplates(), { wrapper })

        // Saturday Jan 11, 2025
        const times = result.current.getDefaultTimes('2025-01-11', 'TD1')
        expect(times.start.getHours()).toBe(9)
        expect(times.start.getMinutes()).toBe(30)
    })

    it('applies Sunday rules for TD1', () => {
        const { result } = renderHook(() => useShiftTemplates(), { wrapper })

        // Sunday Jan 12, 2025
        const times = result.current.getDefaultTimes('2025-01-12', 'TD1')
        expect(times.start.getHours()).toBe(9)
        expect(times.start.getMinutes()).toBe(30)
    })

    it('applies holiday rules for TD1', () => {
        const { result } = renderHook(() => useShiftTemplates(), { wrapper })

        // Jan 1 is Neujahr
        const holidays = [{ date: new Date(2025, 0, 1) }]
        const times = result.current.getDefaultTimes('2025-01-01', 'TD1', holidays)
        expect(times.start.getHours()).toBe(9)
        expect(times.start.getMinutes()).toBe(30)
    })

    it('handles midnight-spanning shifts (ND)', () => {
        const { result } = renderHook(() => useShiftTemplates(), { wrapper })

        // Wed Jan 8 → ND starts 19:00 ends next day 08:00
        const times = result.current.getDefaultTimes('2025-01-08', 'ND')
        expect(times.start.getHours()).toBe(19)
        expect(times.end.getDate()).toBe(9) // next day
        expect(times.end.getHours()).toBe(8)
    })

    it('applies Friday ND rules (end 10:00)', () => {
        const { result } = renderHook(() => useShiftTemplates(), { wrapper })

        // Friday Jan 10, 2025
        const times = result.current.getDefaultTimes('2025-01-10', 'ND')
        expect(times.end.getHours()).toBe(10) // Friday rule: end at 10:00
    })

    it('returns null times for unknown shift code', () => {
        const { result } = renderHook(() => useShiftTemplates(), { wrapper })
        const times = result.current.getDefaultTimes('2025-01-08', 'NONEXISTENT')
        expect(times.start).toBeNull()
        expect(times.end).toBeNull()
    })

    // =============================================================================
    // isPrivateType
    // =============================================================================

    it('MITARBEITERGESPRAECH is private', () => {
        const { result } = renderHook(() => useShiftTemplates(), { wrapper })
        expect(result.current.isPrivateType('MITARBEITERGESPRAECH')).toBe(true)
    })

    it('TD1 is not private', () => {
        const { result } = renderHook(() => useShiftTemplates(), { wrapper })
        expect(result.current.isPrivateType('TD1')).toBe(false)
    })

    it('isPrivateType handles null', () => {
        const { result } = renderHook(() => useShiftTemplates(), { wrapper })
        expect(result.current.isPrivateType(null)).toBe(false)
    })

    // =============================================================================
    // PRIVATE_SHIFT_TYPES export
    // =============================================================================

    it('PRIVATE_SHIFT_TYPES contains MITARBEITERGESPRAECH', () => {
        expect(PRIVATE_SHIFT_TYPES).toContain('MITARBEITERGESPRAECH')
    })

    it('PRIVATE_SHIFT_TYPES does not contain regular shifts', () => {
        expect(PRIVATE_SHIFT_TYPES).not.toContain('TD1')
        expect(PRIVATE_SHIFT_TYPES).not.toContain('ND')
        expect(PRIVATE_SHIFT_TYPES).not.toContain('TEAM')
    })

    // =============================================================================
    // ND shift specifics (standby config)
    // =============================================================================

    it('ND template has correct standby configuration', () => {
        const { result } = renderHook(() => useShiftTemplates(), { wrapper })

        const nd = result.current.getTemplate('ND')
        expect(nd.standby_start).toBe('00:30')
        expect(nd.standby_end).toBe('06:00')
        expect(nd.standby_factor).toBe(0.5)
        expect(nd.interruption_min_minutes).toBe(30)
    })
})

describe('useShiftTemplates outside provider', () => {
    it('returns default context when used outside ShiftTemplateProvider', () => {
        // The context has a default value, so it doesn't throw but returns defaults
        const { result } = renderHook(() => useShiftTemplates())
        expect(result.current.templates).toEqual([])
        expect(result.current.getTemplate('TD1')).toBeNull()
    })
})
