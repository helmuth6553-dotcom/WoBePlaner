import { describe, it, expect } from 'vitest'
import { calculateWorkHours } from './timeCalculations'

describe('calculateWorkHours', () => {
    it('calculates simple day shift duration', () => {
        const start = '2025-05-10T08:00:00'
        const end = '2025-05-10T16:00:00'
        const hours = calculateWorkHours(start, end, 'Tag')
        expect(hours).toBe(8.0)
    })

    it('handles night duty (ND) readiness window logic', () => {
        // Start 18:00, End 08:00 next day
        // Readiness: 00:30 - 06:00 (5.5 hours) -> Credited at 50% = 2.75h
        // Active: 18:00-00:30 (6.5h) + 06:00-08:00 (2h) = 8.5h
        // Total Expected: 8.5 + 2.75 = 11.25h

        const start = '2025-05-10T18:00:00'
        const end = '2025-05-11T08:00:00'
        const hours = calculateWorkHours(start, end, 'ND')
        expect(hours).toBe(11.25)
    })

    it('inflates short interruptions during readiness to 30 mins', () => {
        // Readiness window is 00:30-06:00
        // Interruption: 02:00 - 02:10 (10 mins)
        // Inflated: 02:00 - 02:30 (30 mins)
        // Credit: 30 mins active (0.5h)
        // Deduction from passive: 10 mins (0.166h)
        // We need to be careful with the exact logic in implementation.
        // Let's assume the function handles it.

        const start = '2025-05-10T18:00:00'
        const end = '2025-05-11T08:00:00'

        const interruptionStart = '2025-05-11T02:00:00'
        const interruptionEnd = '2025-05-11T02:10:00'

        const hours = calculateWorkHours(start, end, 'ND', [
            { start: interruptionStart, end: interruptionEnd }
        ])

        // Base ND (without interruption): 11.25
        // Change:
        // + 30 mins active (0.5h)
        // - 10 mins passive (10 mins * 0.5 = 5 mins = 0.0833h lost from passive)
        // Net Change: +0.5 - 0.0833 = +0.4166
        // Expected: 11.25 + 0.4166 = 11.666... -> 11.67

        expect(hours).toBe(11.67)
    })
})
