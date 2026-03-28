/**
 * Skeleton Loading Components
 * 
 * Provides shimmer/pulse animations for content placeholders
 * while data is loading. Better UX than spinners.
 */

import React from 'react'

// Base skeleton element with shimmer animation
export function Skeleton({ className = '', ...props }) {
    return (
        <div
            className={`bg-gray-200 animate-pulse rounded ${className}`}
            {...props}
        />
    )
}

// Skeleton for a single DayCard
export function DayCardSkeleton() {
    return (
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            {/* Date header */}
            <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-32 rounded-lg" />
                <Skeleton className="h-5 w-16 rounded-full" />
            </div>

            {/* Shift rows */}
            <div className="space-y-2 pt-2">
                {/* TD1 Row */}
                <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <div className="flex-1">
                        <Skeleton className="h-4 w-20 mb-1" />
                        <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-8 w-8 rounded-full" />
                </div>

                {/* TD2 Row */}
                <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <div className="flex-1">
                        <Skeleton className="h-4 w-20 mb-1" />
                        <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-8 w-8 rounded-full" />
                </div>

                {/* ND Row */}
                <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <div className="flex-1">
                        <Skeleton className="h-4 w-24 mb-1" />
                        <Skeleton className="h-3 w-36" />
                    </div>
                    <Skeleton className="h-8 w-8 rounded-full" />
                </div>
            </div>
        </div>
    )
}

// Skeleton for RosterFeed (multiple DayCards)
export function RosterFeedSkeleton({ count = 5 }) {
    return (
        <div className="space-y-4 p-4">
            {/* Balance header skeleton */}
            <div className="bg-gradient-to-r from-gray-100 to-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <Skeleton className="h-4 w-24 mb-2" />
                        <Skeleton className="h-8 w-20" />
                    </div>
                    <Skeleton className="h-10 w-10 rounded-full" />
                </div>
            </div>

            {/* DayCard skeletons */}
            {Array.from({ length: count }).map((_, i) => (
                <DayCardSkeleton key={i} />
            ))}
        </div>
    )
}

// Skeleton for TimeTracking view
export function TimeTrackingSkeleton() {
    return (
        <div className="p-4 space-y-4">
            {/* Month header */}
            <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-8 w-8 rounded-lg" />
            </div>

            {/* Balance cards */}
            <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
            </div>

            {/* Entries list */}
            <div className="space-y-2 pt-4">
                {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
            </div>
        </div>
    )
}

// Skeleton for Profile view
export function ProfileSkeleton() {
    return (
        <div className="p-4 space-y-6">
            {/* Avatar area */}
            <div className="flex flex-col items-center gap-3">
                <Skeleton className="h-20 w-20 rounded-full" />
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
            </div>

            {/* Settings list */}
            <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
            </div>
        </div>
    )
}

// Generic page skeleton fallback
export function PageSkeleton() {
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[200px] p-8">
            <div className="w-full max-w-md space-y-4">
                <Skeleton className="h-8 w-3/4 mx-auto" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
            </div>
        </div>
    )
}

export default Skeleton
