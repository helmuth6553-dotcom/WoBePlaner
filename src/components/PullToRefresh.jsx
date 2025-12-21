import { useState, useRef, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'

/**
 * PullToRefresh Component
 * 
 * Wraps content and enables pull-to-refresh gesture on mobile devices.
 * Shows a visual indicator when pulling and a spinner while refreshing.
 * 
 * Usage:
 *   <PullToRefresh onRefresh={async () => await fetchData()}>
 *     <YourContent />
 *   </PullToRefresh>
 */
export default function PullToRefresh({ children, onRefresh, threshold = 80 }) {
    const [pullDistance, setPullDistance] = useState(0)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [isPulling, setIsPulling] = useState(false)

    const containerRef = useRef(null)
    const startY = useRef(0)
    const currentY = useRef(0)

    const handleTouchStart = useCallback((e) => {
        // Only enable if scrolled to top
        if (containerRef.current?.scrollTop === 0) {
            startY.current = e.touches[0].clientY
            setIsPulling(true)
        }
    }, [])

    const handleTouchMove = useCallback((e) => {
        if (!isPulling || isRefreshing) return

        currentY.current = e.touches[0].clientY
        const distance = currentY.current - startY.current

        // Only count downward swipes
        if (distance > 0) {
            // Apply resistance (diminishing returns)
            const resistedDistance = Math.min(distance * 0.5, threshold * 1.5)
            setPullDistance(resistedDistance)

            // Prevent scroll while pulling
            if (resistedDistance > 10) {
                e.preventDefault()
            }
        }
    }, [isPulling, isRefreshing, threshold])

    const handleTouchEnd = useCallback(async () => {
        if (!isPulling) return

        if (pullDistance >= threshold && !isRefreshing) {
            // Trigger refresh
            setIsRefreshing(true)
            setPullDistance(threshold) // Hold at threshold during refresh

            try {
                await onRefresh()
            } catch (error) {
                console.error('Refresh failed:', error)
            }

            setIsRefreshing(false)
        }

        // Reset
        setPullDistance(0)
        setIsPulling(false)
    }, [isPulling, pullDistance, threshold, isRefreshing, onRefresh])

    // Calculate visual states
    const progress = Math.min(pullDistance / threshold, 1)
    const rotation = progress * 180
    const opacity = Math.min(progress * 1.5, 1)
    const showIndicator = pullDistance > 10 || isRefreshing

    return (
        <div
            ref={containerRef}
            id="roster-scroll-container"
            className="relative h-full overflow-y-auto scrollbar-hide"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >


            {/* Pull Indicator */}
            {showIndicator && (
                <div
                    className="absolute left-0 right-0 flex justify-center items-center z-50 pointer-events-none"
                    style={{
                        top: 0,
                        height: `${Math.max(pullDistance, isRefreshing ? 60 : 0)}px`,
                        opacity,
                        transition: isRefreshing ? 'none' : 'height 0.1s ease-out'
                    }}
                >
                    <div
                        className={`
                            flex items-center justify-center 
                            w-10 h-10 rounded-full 
                            bg-white shadow-lg border border-gray-200
                            ${isRefreshing ? 'animate-spin' : ''}
                        `}
                        style={{
                            transform: isRefreshing ? 'none' : `rotate(${rotation}deg)`,
                            transition: 'transform 0.1s ease-out'
                        }}
                    >
                        <RefreshCw
                            className={`w-5 h-5 ${progress >= 1 || isRefreshing ? 'text-blue-500' : 'text-gray-400'}`}
                        />
                    </div>
                </div>
            )}

            {/* Content - only apply transform during pull/refresh, otherwise no wrapper style to avoid stacking context issues */}
            <div
                style={
                    (isPulling || isRefreshing || pullDistance > 0)
                        ? {
                            transform: `translateY(${isRefreshing ? 60 : pullDistance}px)`,
                            transition: isPulling ? 'none' : 'transform 0.2s ease-out'
                        }
                        : undefined
                }
            >
                {children}
            </div>

            {/* Refreshing text */}
            {isRefreshing && (
                <div className="absolute top-2 left-0 right-0 flex justify-center pointer-events-none">
                    <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded shadow">
                        Aktualisiere...
                    </span>
                </div>
            )}
        </div>
    )
}
