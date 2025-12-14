/* eslint-disable no-undef */
import { describe, it, expect, beforeAll } from 'vitest'
import { generateReportHash } from './security'

// Mock crypto.subtle for Node.js environment (Vitest runs in Node)
beforeAll(() => {
    if (!global.crypto) {
        const { webcrypto } = require('crypto')
        global.crypto = webcrypto
    }
})

describe('generateReportHash', () => {
    // Fixed test data for deterministic testing
    const testUserId = 'test-user-123'
    const testMonth = '2024-05'

    const sampleEntries = [
        {
            id: 'entry-1',
            actual_start: '2024-05-01T08:00:00.000Z',
            actual_end: '2024-05-01T16:00:00.000Z',
            calculated_hours: 8,
            interruptions: []
        },
        {
            id: 'entry-2',
            actual_start: '2024-05-02T09:00:00.000Z',
            actual_end: '2024-05-02T17:00:00.000Z',
            calculated_hours: 8,
            interruptions: []
        }
    ]

    it('returns empty string for empty entries', async () => {
        const hash = await generateReportHash([], testUserId, testMonth)
        expect(hash).toBe('')
    })

    it('returns empty string for null/undefined entries', async () => {
        const hash = await generateReportHash(null, testUserId, testMonth)
        expect(hash).toBe('')
    })

    it('generates a valid SHA-256 hash (64 hex characters)', async () => {
        const hash = await generateReportHash(sampleEntries, testUserId, testMonth)

        // SHA-256 produces 256 bits = 64 hex characters
        expect(hash).toHaveLength(64)
        // Only contains valid hex characters
        expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('produces DETERMINISTIC output (same input = same hash)', async () => {
        const hash1 = await generateReportHash(sampleEntries, testUserId, testMonth)
        const hash2 = await generateReportHash(sampleEntries, testUserId, testMonth)
        const hash3 = await generateReportHash(sampleEntries, testUserId, testMonth)

        expect(hash1).toBe(hash2)
        expect(hash2).toBe(hash3)
    })

    it('produces DIFFERENT hash when data changes (tamper detection)', async () => {
        const originalHash = await generateReportHash(sampleEntries, testUserId, testMonth)

        // Modify one entry slightly (1 minute difference)
        const tamperedEntries = [
            { ...sampleEntries[0], actual_start: '2024-05-01T08:01:00.000Z' }, // Changed!
            sampleEntries[1]
        ]

        const tamperedHash = await generateReportHash(tamperedEntries, testUserId, testMonth)

        expect(tamperedHash).not.toBe(originalHash)
    })

    it('produces DIFFERENT hash when hours change (even by 0.01)', async () => {
        const originalHash = await generateReportHash(sampleEntries, testUserId, testMonth)

        const alteredEntries = [
            { ...sampleEntries[0], calculated_hours: 8.01 }, // 0.01h difference
            sampleEntries[1]
        ]

        const alteredHash = await generateReportHash(alteredEntries, testUserId, testMonth)

        expect(alteredHash).not.toBe(originalHash)
    })

    it('produces DIFFERENT hash when userId changes', async () => {
        const hash1 = await generateReportHash(sampleEntries, 'user-A', testMonth)
        const hash2 = await generateReportHash(sampleEntries, 'user-B', testMonth)

        expect(hash1).not.toBe(hash2)
    })

    it('produces DIFFERENT hash when month changes', async () => {
        const hash1 = await generateReportHash(sampleEntries, testUserId, '2024-05')
        const hash2 = await generateReportHash(sampleEntries, testUserId, '2024-06')

        expect(hash1).not.toBe(hash2)
    })

    it('sorts entries by start time (order-independent)', async () => {
        // Same entries, different order
        const entriesAB = [sampleEntries[0], sampleEntries[1]]
        const entriesBA = [sampleEntries[1], sampleEntries[0]]

        const hashAB = await generateReportHash(entriesAB, testUserId, testMonth)
        const hashBA = await generateReportHash(entriesBA, testUserId, testMonth)

        // Hash should be the same regardless of input order
        expect(hashAB).toBe(hashBA)
    })

    it('handles interruptions correctly in hash', async () => {
        const entryWithBreaks = [
            {
                id: 'entry-night',
                actual_start: '2024-05-10T18:00:00.000Z',
                actual_end: '2024-05-11T08:00:00.000Z',
                calculated_hours: 11.25,
                interruptions: [
                    { start: '2024-05-11T02:00:00.000Z', end: '2024-05-11T02:30:00.000Z' }
                ]
            }
        ]

        const entryWithoutBreaks = [
            {
                id: 'entry-night',
                actual_start: '2024-05-10T18:00:00.000Z',
                actual_end: '2024-05-11T08:00:00.000Z',
                calculated_hours: 11.25,
                interruptions: []
            }
        ]

        const hashWithBreaks = await generateReportHash(entryWithBreaks, testUserId, testMonth)
        const hashWithoutBreaks = await generateReportHash(entryWithoutBreaks, testUserId, testMonth)

        // Different because interruptions are included in hash
        expect(hashWithBreaks).not.toBe(hashWithoutBreaks)
    })

    it('handles absence entries with null times', async () => {
        const absenceEntries = [
            {
                id: 'abs-2024-05-15',
                actual_start: null,
                actual_end: null,
                calculated_hours: 4,
                interruptions: []
            }
        ]

        const hash = await generateReportHash(absenceEntries, testUserId, testMonth)

        // Should not throw and should produce valid hash
        expect(hash).toHaveLength(64)
        expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('throws error for unsupported hash version', async () => {
        await expect(
            generateReportHash(sampleEntries, testUserId, testMonth, 'v99')
        ).rejects.toThrow('Unsupported hash version: v99')
    })

    // GOLDEN TEST: This specific hash value should NEVER change
    // If this test fails, existing signed reports may become unverifiable!
    it('GOLDEN TEST: produces consistent hash for known data', async () => {
        const goldenEntries = [
            {
                id: 'golden-1',
                actual_start: '2024-01-15T08:00:00.000Z',
                actual_end: '2024-01-15T16:00:00.000Z',
                calculated_hours: 8,
                interruptions: []
            }
        ]

        const hash = await generateReportHash(goldenEntries, 'golden-user', '2024-01')

        // This hash should NEVER change if the algorithm is stable
        // If you need to update the algorithm, you MUST update hash_version
        expect(hash).toBe('2073932011c3463f30ff7629019b69412032c15b595fe57919a53d7c929bd6fc')
    })
})
