/**
 * Tests for Soli-Punkte (Fairness Index) Calculation
 *
 * Ensures shift-coverage fairness: the greedy algorithm assigns shifts
 * to whoever has contributed LEAST (lowest Soli-Punkte).
 */
import { describe, it, expect } from 'vitest'
import {
    calculateFairnessIndex,
    calculateAllFairnessIndices,
    getReadableBreakdown,
} from './fairnessIndex'

// =============================================================================
// calculateFairnessIndex — single user
// =============================================================================

describe('calculateFairnessIndex', () => {
    it('returns 0 when user has no flex coverage and no votes', () => {
        const result = calculateFairnessIndex({ userFlexCount: 0, participatedVotes: 0 })
        expect(result.total).toBe(0)
        expect(result.breakdown.flexComponent).toBe(0)
        expect(result.breakdown.participationBonus).toBe(0)
    })

    it('awards 10 points per flex coverage', () => {
        const result = calculateFairnessIndex({ userFlexCount: 1, participatedVotes: 0 })
        expect(result.total).toBe(10)
        expect(result.breakdown.flexComponent).toBe(10)
    })

    it('awards 2 points per participated vote', () => {
        const result = calculateFairnessIndex({ userFlexCount: 0, participatedVotes: 1 })
        expect(result.total).toBe(2)
        expect(result.breakdown.participationBonus).toBe(2)
    })

    it('correctly combines flex and vote components', () => {
        const result = calculateFairnessIndex({ userFlexCount: 3, participatedVotes: 5 })
        // 3*10 + 5*2 = 40
        expect(result.total).toBe(40)
        expect(result.breakdown.flexComponent).toBe(30)
        expect(result.breakdown.participationBonus).toBe(10)
    })

    it('scales correctly for heavy contributors', () => {
        const result = calculateFairnessIndex({ userFlexCount: 10, participatedVotes: 20 })
        // 10*10 + 20*2 = 140
        expect(result.total).toBe(140)
    })

    it('returns rounded values (no floating point noise)', () => {
        const result = calculateFairnessIndex({ userFlexCount: 1, participatedVotes: 1 })
        expect(result.total).toBe(12)
        expect(Number.isInteger(result.total * 10)).toBe(true)
    })

    it('includes raw counts in breakdown', () => {
        const result = calculateFairnessIndex({ userFlexCount: 4, participatedVotes: 7 })
        expect(result.breakdown.flexCount).toBe(4)
        expect(result.breakdown.participatedVotes).toBe(7)
    })

    it('returns correct structure', () => {
        const result = calculateFairnessIndex({ userFlexCount: 1, participatedVotes: 1 })
        expect(result).toHaveProperty('total')
        expect(result).toHaveProperty('breakdown')
        expect(result.breakdown).toHaveProperty('flexComponent')
        expect(result.breakdown).toHaveProperty('participationBonus')
        expect(result.breakdown).toHaveProperty('flexCount')
        expect(result.breakdown).toHaveProperty('participatedVotes')
    })
})

// =============================================================================
// calculateAllFairnessIndices — multiple users
// =============================================================================

describe('calculateAllFairnessIndices', () => {
    const userA = 'user-a'
    const userB = 'user-b'
    const userC = 'user-c'

    it('returns empty array for empty eligible list', () => {
        const result = calculateAllFairnessIndices([], [], [])
        expect(result).toEqual([])
    })

    it('returns zero scores when no history exists', () => {
        const result = calculateAllFairnessIndices([userA, userB], [], [])
        expect(result).toHaveLength(2)
        result.forEach(r => expect(r.index.total).toBe(0))
    })

    it('counts flex coverages per user correctly', () => {
        const flexHistory = [
            { user_id: userA },
            { user_id: userA },
            { user_id: userB },
        ]
        const result = calculateAllFairnessIndices([userA, userB], flexHistory, [])
        const scoreA = result.find(r => r.userId === userA).index.total
        const scoreB = result.find(r => r.userId === userB).index.total
        expect(scoreA).toBe(20) // 2 × 10
        expect(scoreB).toBe(10) // 1 × 10
    })

    it('counts only eligible and responded votes', () => {
        const voteHistory = [
            { user_id: userA, was_eligible: true, responded: true },
            { user_id: userA, was_eligible: true, responded: false }, // did not respond
            { user_id: userA, was_eligible: false, responded: true }, // not eligible
            { user_id: userB, was_eligible: true, responded: true },
        ]
        const result = calculateAllFairnessIndices([userA, userB], [], voteHistory)
        const scoreA = result.find(r => r.userId === userA).index.total
        const scoreB = result.find(r => r.userId === userB).index.total
        expect(scoreA).toBe(2) // only 1 qualifying vote
        expect(scoreB).toBe(2)
    })

    it('sorts descending by total (highest contributor first)', () => {
        const flexHistory = [
            { user_id: userA },
            { user_id: userB },
            { user_id: userB },
            { user_id: userB },
        ]
        const result = calculateAllFairnessIndices([userA, userB, userC], flexHistory, [])
        expect(result[0].userId).toBe(userB) // 30 points
        expect(result[1].userId).toBe(userA) // 10 points
        expect(result[2].userId).toBe(userC) // 0 points
    })

    it('ignores flex entries from non-eligible users', () => {
        const flexHistory = [
            { user_id: 'unknown-user' },
            { user_id: userA },
        ]
        const result = calculateAllFairnessIndices([userA], flexHistory, [])
        expect(result).toHaveLength(1)
        expect(result[0].index.total).toBe(10)
    })

    it('ignores votes from non-eligible users', () => {
        const voteHistory = [
            { user_id: 'unknown-user', was_eligible: true, responded: true },
        ]
        const result = calculateAllFairnessIndices([userA], [], voteHistory)
        expect(result[0].index.total).toBe(0)
    })

    it('combines flex and votes for realistic scenario', () => {
        const flexHistory = [
            { user_id: userA },
            { user_id: userA },
            { user_id: userB },
        ]
        const voteHistory = [
            { user_id: userA, was_eligible: true, responded: true },
            { user_id: userB, was_eligible: true, responded: true },
            { user_id: userB, was_eligible: true, responded: true },
            { user_id: userB, was_eligible: true, responded: true },
        ]
        const result = calculateAllFairnessIndices([userA, userB], flexHistory, voteHistory)
        const scoreA = result.find(r => r.userId === userA).index.total // 2*10 + 1*2 = 22
        const scoreB = result.find(r => r.userId === userB).index.total // 1*10 + 3*2 = 16
        expect(scoreA).toBe(22)
        expect(scoreB).toBe(16)
        // A contributed more → rank 1
        expect(result[0].userId).toBe(userA)
    })

    it('handles tie-breaking (equal scores)', () => {
        const flexHistory = [
            { user_id: userA },
            { user_id: userB },
        ]
        const result = calculateAllFairnessIndices([userA, userB], flexHistory, [])
        expect(result[0].index.total).toBe(result[1].index.total)
        expect(result).toHaveLength(2)
    })
})

// =============================================================================
// getReadableBreakdown — UI display formatting
// =============================================================================

describe('getReadableBreakdown', () => {
    it('returns array with exactly 2 items', () => {
        const breakdown = {
            flexComponent: 20,
            participationBonus: 4,
            flexCount: 2,
            participatedVotes: 2,
        }
        const items = getReadableBreakdown(breakdown)
        expect(items).toHaveLength(2)
    })

    it('formats flex coverage line correctly', () => {
        const breakdown = { flexComponent: 30, participationBonus: 0, flexCount: 3, participatedVotes: 0 }
        const items = getReadableBreakdown(breakdown)
        expect(items[0].label).toContain('Flex-Einsätze')
        expect(items[0].detail).toBe('3× eingesprungen')
        expect(items[0].points).toBe('+30')
    })

    it('formats vote participation line correctly', () => {
        const breakdown = { flexComponent: 0, participationBonus: 6, flexCount: 0, participatedVotes: 3 }
        const items = getReadableBreakdown(breakdown)
        expect(items[1].label).toContain('Abstimmungs-Teilnahme')
        expect(items[1].detail).toBe('3× abgestimmt')
        expect(items[1].points).toBe('+6')
    })

    it('shows zero values correctly', () => {
        const breakdown = { flexComponent: 0, participationBonus: 0, flexCount: 0, participatedVotes: 0 }
        const items = getReadableBreakdown(breakdown)
        expect(items[0].detail).toBe('0× eingesprungen')
        expect(items[0].points).toBe('+0')
        expect(items[1].detail).toBe('0× abgestimmt')
        expect(items[1].points).toBe('+0')
    })

    it('returns items with correct structure', () => {
        const breakdown = { flexComponent: 10, participationBonus: 2, flexCount: 1, participatedVotes: 1 }
        const items = getReadableBreakdown(breakdown)
        items.forEach(item => {
            expect(item).toHaveProperty('label')
            expect(item).toHaveProperty('detail')
            expect(item).toHaveProperty('points')
        })
    })
})
