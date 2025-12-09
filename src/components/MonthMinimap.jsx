import { useEffect, useState } from 'react'
import { getDaysInMonth, getDate, isSameMonth, isValid } from 'date-fns'

export default function MonthMinimap({ shifts, currentDate, userId }) {
    const [progress, setProgress] = useState(0)

    useEffect(() => {
        const container = document.querySelector('.overflow-y-auto')
        if (!container) return

        const handleScroll = () => {
            const totalHeight = container.scrollHeight - container.clientHeight
            const p = totalHeight > 0 ? (container.scrollTop / totalHeight) * 100 : 0
            setProgress(Math.min(100, Math.max(0, p)))
        }

        container.addEventListener('scroll', handleScroll)
        handleScroll()

        return () => container.removeEventListener('scroll', handleScroll)
    }, [])

    const daysInMonth = getDaysInMonth(currentDate)

    const relevantShifts = shifts.filter(s => {
        if (!s.start_time) return false
        const d = new Date(s.start_time)
        return isValid(d) && isSameMonth(d, currentDate) && (
            s.interests && s.interests.some(i => i.user_id === userId)
        )
    })

    return (
        <div className="fixed right-4 top-32 bottom-24 w-1.5 bg-gray-400 rounded-full z-[9999] pointer-events-none">
            {/* Scroll Indicator */}
            <div
                className="absolute w-2.5 h-6 bg-gray-600 rounded-full left-1/2 -translate-x-1/2 transition-all duration-75 shadow-sm"
                style={{ top: `${progress}%` }}
            ></div>

            {/* Shift Dots */}
            {relevantShifts.map(s => {
                const day = getDate(new Date(s.start_time))
                const position = ((day - 1) / (daysInMonth - 1)) * 100

                const interestCount = s.interests?.length || 0
                const isOnlyMe = interestCount === 1

                // Green if I am the only one, Yellow if others are interested too
                const colorClass = isOnlyMe ? 'bg-green-500 z-20' : 'bg-yellow-400 z-10'

                return (
                    <div
                        key={s.id}
                        className={`absolute w-2 h-2 rounded-full left-1/2 -translate-x-1/2 border border-white shadow-sm ${colorClass}`}
                        style={{ top: `${position}%` }}
                    ></div>
                )
            })}
        </div>
    )
}
