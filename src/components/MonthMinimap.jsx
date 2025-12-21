import { useEffect, useState, useCallback } from 'react'
import { getDaysInMonth, getDate, isSameMonth, isValid, getDay, format } from 'date-fns'
import { de } from 'date-fns/locale'

export default function MonthMinimap({ shifts, currentDate, userId, absences = [] }) {
    const [progress, setProgress] = useState(0)
    const [isVisible, setIsVisible] = useState(true)
    const [hideTimeout, setHideTimeout] = useState(null)

    // Scroll to specific day when clicking minimap
    const scrollToDay = useCallback((dayNumber) => {
        const container = document.getElementById('roster-scroll-container')
        if (!container) return

        const dateStr = format(new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNumber), 'yyyy-MM-dd')
        const dayCard = container.querySelector(`[data-date="${dateStr}"]`)

        if (dayCard) {
            dayCard.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
    }, [currentDate])

    useEffect(() => {
        const container = document.getElementById('roster-scroll-container')

        const handleScroll = () => {
            const target = container || document.documentElement
            const totalHeight = container
                ? container.scrollHeight - container.clientHeight
                : document.documentElement.scrollHeight - window.innerHeight
            const scrollPos = container ? container.scrollTop : window.scrollY
            const p = totalHeight > 0 ? (scrollPos / totalHeight) * 100 : 0
            setProgress(Math.min(100, Math.max(0, p)))

            setIsVisible(true)
            if (hideTimeout) clearTimeout(hideTimeout)
            setHideTimeout(setTimeout(() => setIsVisible(false), 2000))
        }

        const scrollTarget = container || window
        scrollTarget.addEventListener('scroll', handleScroll)
        handleScroll()

        return () => {
            scrollTarget.removeEventListener('scroll', handleScroll)
            if (hideTimeout) clearTimeout(hideTimeout)
        }
    }, [hideTimeout])

    const daysInMonth = getDaysInMonth(currentDate)
    const today = new Date()
    const todayDay = isSameMonth(today, currentDate) ? getDate(today) : null

    // Filter shifts for this user
    const myShifts = shifts.filter(s => {
        if (!s.start_time) return false
        const d = new Date(s.start_time)
        return isValid(d) && isSameMonth(d, currentDate) && (
            (s.interests && s.interests.some(i => i.user_id === userId)) ||
            s.assigned_to === userId
        )
    })

    // Filter absences for this user
    const myAbsences = absences.filter(a =>
        a.user_id === userId && a.status === 'genehmigt'
    )

    // Get label for shift type
    const getShiftLabel = (type) => {
        switch (type?.toUpperCase()) {
            case 'ND': return 'ND'
            case 'TD1': return 'TD1'
            case 'TD2': return 'TD2'
            case 'DBD': return 'D'
            case 'TEAM': return 'T'
            case 'FORTBILDUNG': return 'F'
            default: return '?'
        }
    }

    // Check if a day has absence
    const getAbsenceForDay = (dayNumber) => {
        const dateStr = format(new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNumber), 'yyyy-MM-dd')
        return myAbsences.find(a => dateStr >= a.start_date && dateStr <= a.end_date)
    }

    const getPosition = (day) => ((day - 1) / (daysInMonth - 1)) * 100

    // Group items by day to avoid duplicates
    const dayItems = {}

    // Add shifts
    myShifts.forEach(s => {
        const day = getDate(new Date(s.start_time))
        if (!dayItems[day]) dayItems[day] = []
        dayItems[day].push({ type: 'shift', label: getShiftLabel(s.type) })
    })

    // Add absences
    for (let d = 1; d <= daysInMonth; d++) {
        const absence = getAbsenceForDay(d)
        if (absence) {
            if (!dayItems[d]) dayItems[d] = []
            const label = absence.type?.toLowerCase() === 'krank' ? 'K' : 'U'
            dayItems[d].push({ type: 'absence', label })
        }
    }

    return (
        <div
            className={`fixed right-2 top-56 bottom-24 w-8 z-[9999] transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-30'}`}
            onMouseEnter={() => setIsVisible(true)}
        >
            {/* Month label */}
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 font-medium">
                {format(currentDate, 'MMM', { locale: de })}
            </div>

            {/* Start/End labels */}
            <div className="absolute -top-0.5 -left-2 text-[8px] text-gray-400">1</div>
            <div className="absolute -bottom-0.5 -left-2 text-[8px] text-gray-400">{daysInMonth}</div>

            {/* Main track */}
            <div
                className="absolute left-1/2 -translate-x-1/2 w-1 h-full bg-gray-300 rounded-full cursor-pointer pointer-events-auto"
                onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const clickY = e.clientY - rect.top
                    const percentage = clickY / rect.height
                    const dayNumber = Math.round(percentage * (daysInMonth - 1)) + 1
                    scrollToDay(dayNumber)
                }}
            >
                {/* Week separator lines */}
                {[7, 14, 21, 28].filter(day => day <= daysInMonth).map(day => (
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

                {/* Scroll Indicator */}
                <div
                    className="absolute w-2.5 h-4 bg-gray-600 rounded-full left-1/2 -translate-x-1/2 transition-all duration-75 shadow border border-white"
                    style={{ top: `calc(${progress}% - 8px)` }}
                />
            </div>

            {/* Text labels on the right side of the track */}
            {Object.entries(dayItems).map(([day, items]) => {
                const position = getPosition(parseInt(day))

                // Combine labels for same day (e.g., "TD1 K" if sick during TD1)
                const labels = items.map(i => i.label).join(' ')
                const hasAbsence = items.some(i => i.type === 'absence')

                return (
                    <div
                        key={`label-${day}`}
                        className={`absolute left-5 text-[7px] font-bold px-0.5 rounded whitespace-nowrap
                            ${hasAbsence ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}
                        style={{ top: `calc(${position}% - 5px)` }}
                    >
                        {labels}
                    </div>
                )
            })}
        </div>
    )
}
