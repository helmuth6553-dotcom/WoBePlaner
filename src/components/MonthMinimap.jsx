import { useEffect, useState } from 'react'
import { getDaysInMonth, getDate, isSameMonth, isValid, format } from 'date-fns'
import { de } from 'date-fns/locale'

export default function MonthMinimap({ shifts, currentDate, userId, absences = [] }) {
    const [progress, setProgress] = useState(0)

    useEffect(() => {
        const container = document.getElementById('roster-scroll-container')

        if (!container) {
            const handleWindowScroll = () => {
                const totalHeight = document.documentElement.scrollHeight - window.innerHeight
                const p = totalHeight > 0 ? (window.scrollY / totalHeight) * 100 : 0
                setProgress(Math.min(100, Math.max(0, p)))
            }
            window.addEventListener('scroll', handleWindowScroll)
            handleWindowScroll()
            return () => window.removeEventListener('scroll', handleWindowScroll)
        }

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
    const today = new Date()
    const todayDay = isSameMonth(today, currentDate) ? getDate(today) : null

    // Get my shifts
    const myShifts = shifts.filter(s => {
        if (!s.start_time) return false
        const d = new Date(s.start_time)
        return isValid(d) && isSameMonth(d, currentDate) && (
            s.interests?.some(i => i.user_id === userId) || s.assigned_to === userId
        )
    })

    // Get my absences
    const myAbsences = absences.filter(a => a.user_id === userId && a.status === 'genehmigt')

    const getPosition = (day) => ((day - 1) / (daysInMonth - 1)) * 100

    // Check if day has absence
    const hasAbsence = (day) => {
        const dateStr = format(new Date(currentDate.getFullYear(), currentDate.getMonth(), day), 'yyyy-MM-dd')
        return myAbsences.some(a => dateStr >= a.start_date && dateStr <= a.end_date)
    }

    return (
        <div className="fixed right-4 top-56 bottom-24 w-1.5 bg-gray-300 rounded-full z-[9999] pointer-events-none md:hidden">
            {/* Week separators */}
            {[7, 14, 21, 28].filter(d => d <= daysInMonth).map(day => (
                <div
                    key={`week-${day}`}
                    className="absolute w-3 h-px bg-gray-400 left-1/2 -translate-x-1/2"
                    style={{ top: `${getPosition(day)}%` }}
                />
            ))}

            {/* Today marker */}
            {todayDay && (
                <div
                    className="absolute w-4 h-0.5 bg-red-500 left-1/2 -translate-x-1/2 rounded-full"
                    style={{ top: `${getPosition(todayDay)}%` }}
                />
            )}

            {/* Absence dots (orange for vacation/sick) */}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                if (!hasAbsence(day)) return null
                return (
                    <div
                        key={`absence-${day}`}
                        className="absolute w-2 h-2 bg-orange-400 rounded-full left-1/2 -translate-x-1/2 border border-white"
                        style={{ top: `${getPosition(day)}%` }}
                    />
                )
            })}

            {/* Shift dots */}
            {myShifts.map(s => {
                const day = getDate(new Date(s.start_time))
                const interestCount = s.interests?.length || 0
                const isOnlyMe = interestCount === 1

                // Green = only me, Yellow = others also interested
                const colorClass = isOnlyMe ? 'bg-green-500' : 'bg-yellow-400'

                return (
                    <div
                        key={s.id}
                        className={`absolute w-2 h-2 rounded-full left-1/2 -translate-x-1/2 border border-white ${colorClass}`}
                        style={{ top: `${getPosition(day)}%` }}
                    />
                )
            })}

            {/* Scroll Indicator */}
            <div
                className="absolute w-3 h-5 bg-gray-600 rounded-full left-1/2 -translate-x-1/2 shadow border-2 border-white"
                style={{ top: `calc(${getPosition(Math.max(1, Math.round(progress / 100 * (daysInMonth - 1)) + 1))}% - 10px)` }}
            />
        </div>
    )
}
