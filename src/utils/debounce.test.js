/**
 * Tests for debounce utility
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce } from './debounce'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('debounce', () => {
    it('returns a function', () => {
        const debounced = debounce(() => {}, 100)
        expect(typeof debounced).toBe('function')
    })

    it('does not call immediately', () => {
        const fn = vi.fn()
        const debounced = debounce(fn, 100)

        debounced()
        expect(fn).not.toHaveBeenCalled()
    })

    it('calls after delay', () => {
        const fn = vi.fn()
        const debounced = debounce(fn, 100)

        debounced()
        vi.advanceTimersByTime(100)
        expect(fn).toHaveBeenCalledTimes(1)
    })

    it('resets timer on subsequent calls', () => {
        const fn = vi.fn()
        const debounced = debounce(fn, 100)

        debounced()
        vi.advanceTimersByTime(50)
        debounced() // reset
        vi.advanceTimersByTime(50)
        expect(fn).not.toHaveBeenCalled()

        vi.advanceTimersByTime(50)
        expect(fn).toHaveBeenCalledTimes(1)
    })

    it('passes arguments to the original function', () => {
        const fn = vi.fn()
        const debounced = debounce(fn, 100)

        debounced('a', 'b')
        vi.advanceTimersByTime(100)
        expect(fn).toHaveBeenCalledWith('a', 'b')
    })

    it('only calls once for rapid-fire invocations', () => {
        const fn = vi.fn()
        const debounced = debounce(fn, 100)

        for (let i = 0; i < 10; i++) {
            debounced(i)
        }

        vi.advanceTimersByTime(100)
        expect(fn).toHaveBeenCalledTimes(1)
        expect(fn).toHaveBeenCalledWith(9) // last call wins
    })

    it('can be called multiple times with pauses', () => {
        const fn = vi.fn()
        const debounced = debounce(fn, 100)

        debounced('first')
        vi.advanceTimersByTime(100)
        expect(fn).toHaveBeenCalledWith('first')

        debounced('second')
        vi.advanceTimersByTime(100)
        expect(fn).toHaveBeenCalledWith('second')
        expect(fn).toHaveBeenCalledTimes(2)
    })
})
