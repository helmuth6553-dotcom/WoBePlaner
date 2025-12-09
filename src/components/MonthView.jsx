import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { User, Check } from 'lucide-react'
import { useHolidays } from '../hooks/useHolidays'

const getUserColor = (name) => {
    const colors = [
        'bg-red-100 text-red-900',
        'bg-orange-100 text-orange-900',
        'bg-amber-100 text-amber-900',
        'bg-yellow-100 text-yellow-900',
        'bg-lime-100 text-lime-900',
        'bg-green-100 text-green-900',
        'bg-emerald-100 text-emerald-900',
        'bg-teal-100 text-teal-900',
        'bg-cyan-100 text-cyan-900',
        'bg-sky-100 text-sky-900',
        'bg-blue-100 text-blue-900',
        'bg-indigo-100 text-indigo-900',
        'bg-violet-100 text-violet-900',
        'bg-purple-100 text-purple-900',
        'bg-fuchsia-100 text-fuchsia-900',
        'bg-pink-100 text-pink-900',
        'bg-rose-100 text-rose-900'
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i)
    return colors[Math.abs(hash) % colors.length]
}

export default function MonthView({ shiftsByDate, userId, onToggleInterest, getAbsencesForDate }) {
    const { getHoliday } = useHolidays()

    const getDisplayName = (profile, fullName = false) => {
        if (fullName && profile?.full_name) return profile.full_name
        if (profile?.full_name) return profile.full_name.split(' ')[0]
        return profile?.email?.split('@')[0] || '?'
    }

    const getInitials = (name) => {
        if (!name) return '?'
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    }

    const getShift = (shifts, type) => {
        if (!shifts) return null
        return shifts.find(s => {
            const t = s.type.toUpperCase()
            if (type === 'TD1') return t === 'TD1' || t === 'TAGDIENST'
            if (type === 'TD2') return t === 'TD2'
            if (type === 'ND') return t === 'ND' || t === 'NACHTDIENST'
            if (type === 'DBD') return t === 'DBD'
            return false
        })
    }

    const renderCell = (shift, isBlocked = false) => {
        if (!shift) return <div className="bg-gray-50/30 h-full w-full border-r border-gray-100"></div>

        const interestCount = shift.interests?.length || 0
        const isUrgent = !!shift.urgent_since && interestCount === 0
        const amIInterested = shift.interests?.some(i => i.user_id === userId)

        // Determine who to show (Assigned OR Single Interest)
        let displayProfile = null
        let isAssignedState = false

        if (shift.assigned_to) {
            displayProfile = shift.assigned_profile
            isAssignedState = true
        } else if (interestCount === 1) {
            displayProfile = shift.interests[0].profiles
        }

        if (displayProfile) {
            const name = getDisplayName(displayProfile)
            const colorClass = getUserColor(name)
            const interactiveClass = !isAssignedState && !isBlocked ? 'cursor-pointer hover:brightness-95' : 'cursor-not-allowed'

            return (
                <div
                    onClick={() => !isAssignedState && !isBlocked && onToggleInterest(shift.id, amIInterested)}
                    className={`h-full w-full border-r border-gray-100 flex items-center justify-center p-1 transition-all ${colorClass} ${interactiveClass} ${isBlocked ? 'opacity-50 grayscale' : ''} overflow-hidden`}
                    title={isBlocked ? "Keine Eintragung möglich (Abwesenheit)" : displayProfile.full_name}
                >
                    {/* Mobile: First name only, truncated */}
                    <span className="text-[11px] font-black leading-tight text-center w-full lg:hidden truncate">
                        {name}
                    </span>
                    {/* Desktop: Full name, multi-line if needed */}
                    <span className="hidden lg:block text-xs font-bold leading-tight text-center w-full break-words px-0.5">
                        {displayProfile.full_name || name}
                    </span>
                </div>
            )
        }

        // Multiple Interests or Empty
        let cellClass = "bg-white"
        let content = null

        if (interestCount > 1) {
            if (amIInterested) {
                cellClass = "bg-blue-50 text-blue-600"
                content = <span className="text-[10px] font-bold">+{interestCount} (Ich)</span>
            } else {
                cellClass = "bg-yellow-50 text-yellow-600"
                content = <span className="text-[10px] font-bold">{interestCount}</span>
            }
        } else if (isUrgent) {
            cellClass = "bg-red-100 text-red-700 animate-pulse font-bold border-red-200 border"
            content = "!"
        }

        const interactiveClass = isBlocked ? 'cursor-not-allowed opacity-40 bg-gray-50' : 'cursor-pointer hover:bg-gray-50'

        return (
            <div
                onClick={() => !isBlocked && onToggleInterest(shift.id, amIInterested)}
                className={`h-full w-full border-r border-gray-100 flex items-center justify-center transition-colors ${cellClass} ${interactiveClass}`}
                title={isBlocked ? "Keine Eintragung möglich (Abwesenheit)" : (isUrgent ? "DRINGEND - Krankheitsausfall" : "Offen - Klicken für Interesse")}
            >
                {content}
            </div>
        )
    }

    const renderAbsenceCell = (dateStr) => {
        const absences = getAbsencesForDate ? getAbsencesForDate(dateStr) : []
        if (absences.length === 0) return null

        return (
            <div className="flex flex-col justify-center items-center h-full gap-0.5 p-0.5">
                {absences.slice(0, 2).map((abs, i) => (
                    <div
                        key={abs.id}
                        className={`w-full rounded text-[8px] lg:text-[10px] font-bold text-center truncate px-0.5 lg:px-1 leading-tight ${abs.type === 'Krank' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`}
                        title={`${abs.profiles?.full_name} (${abs.type})`}
                    >
                        {/* Mobile: Initials, Desktop: First name */}
                        <span className="lg:hidden">{getInitials(abs.profiles?.full_name)}</span>
                        <span className="hidden lg:inline">{abs.profiles?.full_name?.split(' ')[0] || getInitials(abs.profiles?.full_name)}</span>
                    </div>
                ))}
                {absences.length > 2 && (
                    <div className="text-[8px] text-gray-400 font-bold leading-none">+{absences.length - 2}</div>
                )}
            </div>
        )
    }

    const dates = Object.keys(shiftsByDate).sort()

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden font-sans text-xs">
            {/* Header - Desktop responsive grid */}
            <div className="grid grid-cols-[35px_1fr_1fr_1fr_1fr_35px] lg:grid-cols-[60px_1fr_1fr_1fr_1fr_100px] bg-gray-50 border-b border-gray-200 font-bold text-gray-500 text-center py-2 lg:py-4 lg:text-sm">
                <div>Tag</div>
                <div>TD1</div>
                <div>TD2</div>
                <div>ND</div>
                <div>DBD</div>
                <div className="lg:hidden">Abw.</div>
                <div className="hidden lg:block">Abwesend</div>
            </div>

            {/* Rows */}
            {dates.map(dateStr => {
                const date = new Date(dateStr)
                const isWeekend = date.getDay() === 0 || date.getDay() === 6
                const shifts = shiftsByDate[dateStr]
                const holiday = getHoliday(date)

                return (
                    <div
                        key={dateStr}
                        className={`grid grid-cols-[35px_1fr_1fr_1fr_1fr_35px] lg:grid-cols-[60px_1fr_1fr_1fr_1fr_100px] border-b border-gray-100 min-h-[36px] lg:min-h-[56px]
                            ${holiday ? 'bg-red-50/30' : (isWeekend ? 'bg-gray-50/50' : 'bg-white')}
                        `}
                    >
                        {/* Datum */}
                        <div className={`border-r border-gray-100 flex flex-col items-center justify-center leading-none ${holiday ? 'text-red-500' : 'text-gray-500'}`}>
                            <span className="text-sm font-bold">{format(date, 'dd')}</span>
                            <span className="text-[9px] uppercase">{format(date, 'EE', { locale: de })}</span>
                        </div>

                        {/* Shift Spalten */}
                        {(() => {
                            const dayAbsences = getAbsencesForDate ? getAbsencesForDate(dateStr) : []
                            const myAbsence = dayAbsences.find(a => a.user_id === userId && (a.status === 'genehmigt' || a.type === 'Krank'))
                            const isBlocked = !!myAbsence

                            return (
                                <>
                                    {renderCell(getShift(shifts, 'TD1'), isBlocked)}
                                    {renderCell(getShift(shifts, 'TD2'), isBlocked)}
                                    {renderCell(getShift(shifts, 'ND'), isBlocked)}
                                    {renderCell(getShift(shifts, 'DBD'), isBlocked)}
                                </>
                            )
                        })()}

                        {/* Urlaub Spalte */}
                        {renderAbsenceCell(dateStr)}
                    </div>
                )
            })}
        </div>
    )
}
