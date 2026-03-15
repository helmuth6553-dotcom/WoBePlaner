/**
 * Tests for Skeleton loading components
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
    Skeleton,
    DayCardSkeleton,
    RosterFeedSkeleton,
    TimeTrackingSkeleton,
    ProfileSkeleton,
    PageSkeleton,
} from './Skeleton'

describe('Skeleton', () => {
    it('renders with default class', () => {
        const { container } = render(<Skeleton />)
        const el = container.firstChild
        expect(el.className).toContain('animate-pulse')
        expect(el.className).toContain('bg-gray-200')
    })

    it('accepts custom className', () => {
        const { container } = render(<Skeleton className="h-8 w-32" />)
        expect(container.firstChild.className).toContain('h-8')
        expect(container.firstChild.className).toContain('w-32')
    })

    it('passes through extra props', () => {
        const { container } = render(<Skeleton data-testid="skel" />)
        expect(container.firstChild.getAttribute('data-testid')).toBe('skel')
    })
})

describe('DayCardSkeleton', () => {
    it('renders without crashing', () => {
        const { container } = render(<DayCardSkeleton />)
        expect(container.firstChild).toBeTruthy()
    })

    it('contains pulse animations', () => {
        const { container } = render(<DayCardSkeleton />)
        const pulseElements = container.querySelectorAll('.animate-pulse')
        expect(pulseElements.length).toBeGreaterThan(0)
    })
})

describe('RosterFeedSkeleton', () => {
    it('renders default 5 day cards', () => {
        const { container } = render(<RosterFeedSkeleton />)
        // Should have multiple skeleton elements
        const pulseElements = container.querySelectorAll('.animate-pulse')
        expect(pulseElements.length).toBeGreaterThan(5)
    })

    it('accepts custom count', () => {
        const { container: c3 } = render(<RosterFeedSkeleton count={3} />)
        const { container: c7 } = render(<RosterFeedSkeleton count={7} />)
        // More count = more elements
        const el3 = c3.querySelectorAll('.animate-pulse').length
        const el7 = c7.querySelectorAll('.animate-pulse').length
        expect(el7).toBeGreaterThan(el3)
    })
})

describe('TimeTrackingSkeleton', () => {
    it('renders without crashing', () => {
        const { container } = render(<TimeTrackingSkeleton />)
        expect(container.firstChild).toBeTruthy()
    })
})

describe('ProfileSkeleton', () => {
    it('renders without crashing', () => {
        const { container } = render(<ProfileSkeleton />)
        expect(container.firstChild).toBeTruthy()
    })
})

describe('PageSkeleton', () => {
    it('renders without crashing', () => {
        const { container } = render(<PageSkeleton />)
        expect(container.firstChild).toBeTruthy()
    })
})
