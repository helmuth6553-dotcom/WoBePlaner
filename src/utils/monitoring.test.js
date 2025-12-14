/**
 * MONITORING UTILITIES TESTS
 * 
 * Tests for the production monitoring module.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    verifyBalanceIntegrity,
    areBalancesEqual,
    generateSyncReport,
    withBalanceVerification
} from './monitoring'

describe('verifyBalanceIntegrity', () => {
    it('returns empty array for valid balance', () => {
        const validBalance = {
            target: 176,
            actual: 160,
            vacation: 16,
            diff: 0,  // (160 + 16) - 176 = 0
            carryover: 10,
            correction: 0,
            total: 10  // 0 + 10 = 10
        }

        const issues = verifyBalanceIntegrity(validBalance)
        expect(issues).toHaveLength(0)
    })

    it('detects null balance', () => {
        const issues = verifyBalanceIntegrity(null)
        expect(issues.length).toBeGreaterThan(0)
        expect(issues[0].type).toBe('ERROR')
    })

    it('detects NaN values', () => {
        const badBalance = {
            target: NaN,
            actual: 160,
            vacation: 16,
            diff: 0,
            carryover: 10,
            correction: 0,
            total: 10
        }

        const issues = verifyBalanceIntegrity(badBalance)
        expect(issues.some(i => i.field === 'target' && i.type === 'ERROR')).toBe(true)
    })

    it('warns on negative target', () => {
        const badBalance = {
            target: -10,
            actual: 0,
            vacation: 0,
            diff: 10,  // 0 - (-10) = 10
            carryover: 0,
            correction: 0,
            total: 10
        }

        const issues = verifyBalanceIntegrity(badBalance)
        expect(issues.some(i => i.field === 'target' && i.type === 'WARNING')).toBe(true)
    })

    it('detects diff calculation mismatch', () => {
        const badBalance = {
            target: 100,
            actual: 80,
            vacation: 10,
            diff: 50,  // WRONG: should be (80+10)-100 = -10
            carryover: 0,
            correction: 0,
            total: 50
        }

        const issues = verifyBalanceIntegrity(badBalance)
        expect(issues.some(i => i.field === 'diff' && i.type === 'ERROR')).toBe(true)
    })

    it('detects total calculation mismatch', () => {
        const badBalance = {
            target: 100,
            actual: 80,
            vacation: 10,
            diff: -10,  // Correct: (80+10)-100 = -10
            carryover: 5,
            correction: 0,
            total: 100  // WRONG: should be -10 + 5 = -5
        }

        const issues = verifyBalanceIntegrity(badBalance)
        expect(issues.some(i => i.field === 'total' && i.type === 'ERROR')).toBe(true)
    })
})

describe('areBalancesEqual', () => {
    it('returns true for identical balances', () => {
        const balance1 = { target: 100, actual: 80, vacation: 10, diff: -10, carryover: 5, total: -5 }
        const balance2 = { target: 100, actual: 80, vacation: 10, diff: -10, carryover: 5, total: -5 }

        expect(areBalancesEqual(balance1, balance2)).toBe(true)
    })

    it('returns true for nearly equal balances (within tolerance)', () => {
        const balance1 = { target: 100, actual: 80.001, vacation: 10, diff: -9.999, carryover: 5, total: -4.999 }
        const balance2 = { target: 100, actual: 80, vacation: 10, diff: -10, carryover: 5, total: -5 }

        expect(areBalancesEqual(balance1, balance2, 0.01)).toBe(true)
    })

    it('returns false for different balances', () => {
        const balance1 = { target: 100, actual: 80, vacation: 10, diff: -10, carryover: 5, total: -5 }
        const balance2 = { target: 100, actual: 90, vacation: 10, diff: 0, carryover: 5, total: 5 }

        expect(areBalancesEqual(balance1, balance2)).toBe(false)
    })

    it('returns false if one balance is null', () => {
        const balance1 = { target: 100, actual: 80, vacation: 10, diff: -10, carryover: 5, total: -5 }

        expect(areBalancesEqual(balance1, null)).toBe(false)
        expect(areBalancesEqual(null, balance1)).toBe(false)
    })
})

describe('generateSyncReport', () => {
    it('reports synced for identical balances', () => {
        const balance = { target: 100, actual: 80, vacation: 10, diff: -10, carryover: 5, correction: 0, total: -5 }

        const report = generateSyncReport('View1', balance, 'View2', balance)

        expect(report.isSynced).toBe(true)
        expect(report.differences).toHaveLength(0)
    })

    it('reports differences for mismatched balances', () => {
        const balance1 = { target: 100, actual: 80, vacation: 10, diff: -10, carryover: 5, correction: 0, total: -5 }
        const balance2 = { target: 100, actual: 90, vacation: 10, diff: 0, carryover: 5, correction: 0, total: 5 }

        const report = generateSyncReport('Employee', balance1, 'Admin', balance2)

        expect(report.isSynced).toBe(false)
        expect(report.differences.length).toBeGreaterThan(0)

        // Check that the difference is documented
        const actualDiff = report.differences.find(d => d.field === 'actual')
        expect(actualDiff).toBeDefined()
        expect(actualDiff.Employee).toBe(80)
        expect(actualDiff.Admin).toBe(90)
    })

    it('handles null balances', () => {
        const balance = { target: 100, actual: 80, vacation: 10, diff: -10, carryover: 5, correction: 0, total: -5 }

        const report = generateSyncReport('View1', null, 'View2', balance)

        expect(report.isSynced).toBe(false)
    })

    it('includes timestamp', () => {
        const balance = { target: 100, actual: 80, vacation: 10, diff: -10, carryover: 5, correction: 0, total: -5 }

        const report = generateSyncReport('View1', balance, 'View2', balance)

        expect(report.timestamp).toBeDefined()
        expect(new Date(report.timestamp).getTime()).not.toBeNaN()
    })
})

describe('withBalanceVerification', () => {
    it('returns the balance unchanged when valid', () => {
        const validBalance = {
            target: 176,
            actual: 160,
            vacation: 16,
            diff: 0,
            carryover: 10,
            correction: 0,
            total: 10
        }

        const result = withBalanceVerification(validBalance, 'TestContext')
        expect(result).toBe(validBalance)
    })

    it('still returns balance even when invalid (logs error)', () => {
        const invalidBalance = {
            target: NaN,
            actual: 160,
            vacation: 16,
            diff: 0,
            carryover: 10,
            correction: 0,
            total: 10
        }

        // Mock console to avoid noise
        const spy = vi.spyOn(console, 'log').mockImplementation(() => { })

        const result = withBalanceVerification(invalidBalance, 'TestContext')
        expect(result).toBe(invalidBalance)

        spy.mockRestore()
    })
})
