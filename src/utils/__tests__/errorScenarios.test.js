/**
 * Error Scenario Tests
 *
 * Tests the REAL error handling functions from errorHandler.js.
 * Verifies proper error categorization, user-friendly messages,
 * retry logic, and Supabase error formatting.
 *
 * Run with: npx vitest run src/utils/__tests__/errorScenarios.test.js
 */

import { describe, it, expect, vi } from 'vitest'
import {
    ErrorTypes,
    categorizeError,
    getUserFriendlyError,
    withRetry,
    isRecoverableError,
    formatSupabaseError
} from '../errorHandler'
import { calculateWorkHours, calculateDailyAbsenceHours } from '../timeCalculations'
import { calculateGenericBalance } from '../balanceHelpers'

// Mock Sentry to avoid actual error reporting in tests
vi.mock('../../lib/sentry', () => ({
    captureError: vi.fn(),
    addBreadcrumb: vi.fn()
}))

describe('Error Categorization', () => {

    it('should categorize network errors', () => {
        expect(categorizeError({ message: 'Network request failed' })).toBe(ErrorTypes.NETWORK)
        expect(categorizeError({ message: 'Failed to fetch' })).toBe(ErrorTypes.NETWORK)
        expect(categorizeError({ message: 'Connection refused' })).toBe(ErrorTypes.NETWORK)
    })

    it('should categorize auth/JWT errors', () => {
        expect(categorizeError({ message: 'JWT expired', code: 'PGRST301' })).toBe(ErrorTypes.AUTH)
        expect(categorizeError({ message: 'Token expired' })).toBe(ErrorTypes.AUTH)
        expect(categorizeError({ code: 'pgrst301' })).toBe(ErrorTypes.AUTH)
    })

    it('should categorize timeout errors', () => {
        expect(categorizeError({ message: 'Request timeout' })).toBe(ErrorTypes.TIMEOUT)
        expect(categorizeError({ code: 'timeout' })).toBe(ErrorTypes.TIMEOUT)
    })

    it('should categorize permission errors', () => {
        expect(categorizeError({ code: '42501' })).toBe(ErrorTypes.PERMISSION)
        expect(categorizeError({ message: 'permission denied' })).toBe(ErrorTypes.PERMISSION)
        expect(categorizeError({ message: 'violates policy' })).toBe(ErrorTypes.PERMISSION)
    })

    it('should categorize not-found errors', () => {
        expect(categorizeError({ code: 'PGRST116' })).toBe(ErrorTypes.NOT_FOUND)
        expect(categorizeError({ message: 'The result contains 0 rows' })).toBe(ErrorTypes.NOT_FOUND)
    })

    it('should categorize validation errors', () => {
        expect(categorizeError({ code: '23505' })).toBe(ErrorTypes.VALIDATION)
        expect(categorizeError({ message: 'validation failed' })).toBe(ErrorTypes.VALIDATION)
    })

    it('should categorize server errors', () => {
        expect(categorizeError({ code: '500' })).toBe(ErrorTypes.SERVER)
        expect(categorizeError({ message: 'Internal server error' })).toBe(ErrorTypes.SERVER)
    })

    it('should return UNKNOWN for null/undefined errors', () => {
        expect(categorizeError(null)).toBe(ErrorTypes.UNKNOWN)
        expect(categorizeError(undefined)).toBe(ErrorTypes.UNKNOWN)
    })

    it('should return UNKNOWN for unrecognized errors', () => {
        expect(categorizeError({ message: 'something weird happened' })).toBe(ErrorTypes.UNKNOWN)
        expect(categorizeError({})).toBe(ErrorTypes.UNKNOWN)
    })
})

describe('User-Friendly Error Messages', () => {

    it('should return German-language messages for network errors', () => {
        const result = getUserFriendlyError({ message: 'Network request failed' })

        expect(result.type).toBe(ErrorTypes.NETWORK)
        expect(result.title).toBe('Verbindungsproblem')
        expect(result.message).toContain('Verbindung')
        expect(result.action).toBe('Nochmal versuchen')
    })

    it('should return auth message for JWT errors', () => {
        const result = getUserFriendlyError({ message: 'JWT expired' })

        expect(result.type).toBe(ErrorTypes.AUTH)
        expect(result.title).toBe('Anmeldung erforderlich')
    })

    it('should use error.details as message when available', () => {
        const result = getUserFriendlyError({
            message: 'Network error',
            details: 'Spezifische Fehlerbeschreibung'
        })

        expect(result.message).toBe('Spezifische Fehlerbeschreibung')
    })

    it('should preserve original error reference', () => {
        const original = { message: 'test error', code: 'TEST' }
        const result = getUserFriendlyError(original)

        expect(result.originalError).toBe(original)
    })

    it('should handle all error types without throwing', () => {
        Object.values(ErrorTypes).forEach(type => {
            // Create an error that maps to each type
            const errors = {
                [ErrorTypes.NETWORK]: { message: 'network error' },
                [ErrorTypes.AUTH]: { message: 'jwt expired' },
                [ErrorTypes.VALIDATION]: { message: 'validation error' },
                [ErrorTypes.PERMISSION]: { message: 'permission denied' },
                [ErrorTypes.NOT_FOUND]: { message: 'not found' },
                [ErrorTypes.SERVER]: { message: 'server error' },
                [ErrorTypes.TIMEOUT]: { message: 'timeout' },
                [ErrorTypes.UNKNOWN]: { message: 'unknown issue' }
            }

            const result = getUserFriendlyError(errors[type])
            expect(result.title).toBeTruthy()
            expect(result.message).toBeTruthy()
            expect(result.action).toBeTruthy()
        })
    })
})

describe('Retry Logic (withRetry)', () => {

    it('should succeed on first try without retrying', async () => {
        let attempts = 0
        const result = await withRetry(() => {
            attempts++
            return 'success'
        })

        expect(result).toBe('success')
        expect(attempts).toBe(1)
    })

    it('should retry on failure and succeed', async () => {
        let attempts = 0
        const result = await withRetry(() => {
            attempts++
            if (attempts < 3) throw new Error('fail')
            return 'success'
        }, { maxRetries: 3, baseDelay: 1 })

        expect(result).toBe('success')
        expect(attempts).toBe(3)
    })

    it('should throw after max retries exhausted', async () => {
        let attempts = 0
        await expect(
            withRetry(() => {
                attempts++
                throw new Error('always fails')
            }, { maxRetries: 3, baseDelay: 1 })
        ).rejects.toThrow('always fails')

        expect(attempts).toBe(3)
    })

    it('should call onRetry callback with attempt info', async () => {
        const retryInfos = []
        let attempts = 0

        await withRetry(() => {
            attempts++
            if (attempts < 3) throw new Error('retry me')
            return 'done'
        }, {
            maxRetries: 3,
            baseDelay: 1,
            onRetry: (info) => retryInfos.push(info)
        })

        expect(retryInfos).toHaveLength(2) // 2 retries before success
        expect(retryInfos[0].attempt).toBe(1)
        expect(retryInfos[1].attempt).toBe(2)
    })
})

describe('Recoverable Error Detection', () => {

    it('should mark network errors as recoverable', () => {
        expect(isRecoverableError({ message: 'network error' })).toBe(true)
    })

    it('should mark timeout errors as recoverable', () => {
        expect(isRecoverableError({ message: 'timeout' })).toBe(true)
    })

    it('should mark auth errors as NOT recoverable', () => {
        expect(isRecoverableError({ message: 'jwt expired' })).toBe(false)
    })

    it('should mark permission errors as NOT recoverable', () => {
        expect(isRecoverableError({ code: '42501' })).toBe(false)
    })

    it('should mark validation errors as NOT recoverable', () => {
        expect(isRecoverableError({ message: 'validation error' })).toBe(false)
    })
})

describe('Supabase Error Formatting', () => {

    it('should return null for PGRST116 (empty result)', () => {
        expect(formatSupabaseError({ code: 'PGRST116' })).toBeNull()
    })

    it('should format duplicate key error (23505)', () => {
        const result = formatSupabaseError({ code: '23505' })
        expect(result).toContain('existiert bereits')
    })

    it('should format foreign key error (23503)', () => {
        const result = formatSupabaseError({ code: '23503' })
        expect(result).toContain('verwendet')
    })

    it('should format permission error (42501)', () => {
        const result = formatSupabaseError({ code: '42501' })
        expect(result).toContain('Berechtigung')
    })

    it('should return error message for unknown errors', () => {
        const result = formatSupabaseError({ message: 'Something went wrong' })
        expect(result).toBe('Something went wrong')
    })

    it('should return generic message when no message available', () => {
        const result = formatSupabaseError({ code: '99999' })
        expect(result).toBe('Ein Fehler ist aufgetreten.')
    })

    it('should return null for null/undefined input', () => {
        expect(formatSupabaseError(null)).toBeNull()
        expect(formatSupabaseError(undefined)).toBeNull()
    })
})

describe('Data Validation with Real Functions', () => {

    it('should handle calculateWorkHours with null inputs', () => {
        expect(calculateWorkHours(null, null, 'TD1')).toBe(0)
        expect(calculateWorkHours(undefined, undefined, 'ND')).toBe(0)
    })

    it('should handle calculateDailyAbsenceHours with missing profile', () => {
        const absence = { reason: 'vacation', type: 'Urlaub' }
        // Should use default weekly_hours (40) when profile is null
        const hours = calculateDailyAbsenceHours('2025-01-15', absence, [], null)

        // Wednesday = workday, default 40/5 = 8h
        expect(hours).toBe(8)
    })

    it('should handle calculateDailyAbsenceHours on weekend', () => {
        const absence = { reason: 'vacation', type: 'Urlaub' }
        // Jan 18, 2025 is a Saturday
        const hours = calculateDailyAbsenceHours('2025-01-18', absence, [], { weekly_hours: 38.5 })

        expect(hours).toBe(0)
    })

    it('should handle sick leave with no shifts and no snapshot', () => {
        const absence = {
            reason: 'sick',
            type: 'Krank',
            start_date: '2025-01-15',
            end_date: '2025-01-15'
            // No planned_shifts_snapshot, no planned_hours
        }

        const hours = calculateDailyAbsenceHours('2025-01-15', absence, [], { weekly_hours: 38.5 })

        // No planned shifts = 0h sick credit
        expect(hours).toBe(0)
    })
})

describe('Balance Edge Cases with Real calculateGenericBalance', () => {

    it('should return null for null profile', () => {
        const result = calculateGenericBalance(null, [], [], [])
        expect(result).toBeNull()
    })

    it('should handle empty data gracefully', () => {
        const profile = { weekly_hours: 38.5, start_date: '2025-01-01' }
        const result = calculateGenericBalance(profile, [], [], [], new Date('2025-01-15'))

        expect(result).not.toBeNull()
        expect(result.actual).toBe(0)
        expect(result.vacation).toBe(0)
        expect(result.target).toBeGreaterThan(0)
    })

    it('should handle profile with missing weekly_hours (defaults to 40)', () => {
        const profile = { start_date: '2025-01-01' }
        const result = calculateGenericBalance(profile, [], [], [], new Date('2025-01-15'))

        expect(result).not.toBeNull()
        // Default 40h/week, target should reflect that
        expect(result.target).toBeGreaterThan(0)
    })
})
