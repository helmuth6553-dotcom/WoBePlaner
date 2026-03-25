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
    for (let i = 0; i < (name || '').length; i++) hash = hash * 8 + (name || '').codePointAt(i)
    return colors[Math.abs(hash) % colors.length]
}

export default function MonthView({ shiftsByDate, userId, isAdmin, onToggleInterest, getAbsencesForDate }) {
    const { getHoliday } = useHolidays()

    const getDisplayName = (profile, fullName = false) => {
        const name = profile?.display_name || profile?.full_name
        if (fullName && name) return name
        if (name) return name.split(' ')[0]
        return profile?.email?.split('@')[0] || '?'
    }

    const getInitials = (name) => {
        if (!name) return '?'
        const parts = name.split(' ')
        if (parts.length >= 2) {
            return parts[0][0] + parts[1][0]
        }
        return name.substring(0, 2).toUpperCase()
    }

    const getShift = (shifts, type) => {
        return shifts?.find(s => s.type === type) || null
    }

    const renderCell = (shift, isBlocked = false) => {
        if (!shift) {
            return <div className="border-r border-gray-100 flex items-center justify-center text-gray-300">-</div>
        }

        const myInterest = shift.interests?.find(i => i.user_id === userId)
        const isAssigned = shift.assigned_to === userId
        const isMine = myInterest || isAssigned
        const isUrgent = shift.is_freigabe || shift.urgent_since

        // Get all interested/assigned users
        const assignedUsers = []
        if (shift.assigned_profile) {
            assignedUsers.push(shift.assigned_profile)
        }
        shift.interests?.forEach(i => {
            if (i.profiles && !assignedUsers.find(u => u.email === i.profiles.email)) {
                assignedUsers.push(i.profiles)
            }
        })

        const handleClick = () => {
            if (isBlocked) return
            onToggleInterest(shift.id, isMine)
        }

        // Single user - fill entire cell with color (like DayCard)
        if (assignedUsers.length === 1) {
            const profile = assignedUsers[0]
            // Use first name only for color hash (consistent with DayCard)
            const firstName = getDisplayName(profile) // This returns first name only
            const colorClass = getUserColor(firstName)
            const isMe = profile.email === myInterest?.profiles?.email ||
                (shift.assigned_to === userId && shift.assigned_profile?.email === profile.email)

            return (
                <div
                    onClick={handleClick}
                    className={`border-r border-gray-100 flex items-center justify-center cursor-pointer transition-all h-full
                        ${isBlocked ? 'opacity-30 cursor-not-allowed' : 'hover:opacity-80'}
                        ${colorClass}
                    `}
                >
                    <div className="flex items-center justify-center gap-1 px-1">
                        {isMe && <Check size={14} className="flex-shrink-0" />}
                        <span className="font-bold text-sm lg:text-base truncate">{firstName}</span>
                    </div>
                </div>
            )
        }

        // Multiple users or empty
        return (
            <div
                onClick={handleClick}
                className={`border-r border-gray-100 flex flex-col justify-center items-center cursor-pointer transition-all p-1 lg:p-2 gap-1
                    ${isBlocked ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-50'}
                    ${isUrgent ? 'bg-red-50 animate-pulse' : ''}
                `}
            >
                {assignedUsers.length === 0 ? (
                    <div className={`text-[10px] lg:text-xs font-bold ${isUrgent ? 'text-red-600' : 'text-gray-400'}`}>
                        {isUrgent ? '!' : 'Frei'}
                    </div>
                ) : (
                    assignedUsers.slice(0, 2).map((profile, idx) => {
                        const firstName = getDisplayName(profile)
                        const colorClass = getUserColor(firstName)
                        const isMe = profile.email === myInterest?.profiles?.email ||
                            (shift.assigned_to === userId && shift.assigned_profile?.email === profile.email)

                        return (
                            <div
                                key={idx}
                                className={`w-full rounded-md py-0.5 lg:py-1 text-[10px] lg:text-xs font-bold text-center truncate px-1 lg:px-2 flex items-center justify-center gap-1 ${colorClass}`}
                            >
                                {isMe && <Check size={12} className="flex-shrink-0" />}
                                <span className="lg:hidden">{getInitials(firstName)}</span>
                                <span className="hidden lg:inline">{firstName}</span>
                            </div>
                        )
                    })
                )}
                {assignedUsers.length > 2 && (
                    <div className="text-[9px] text-gray-400 font-bold leading-none">+{assignedUsers.length - 2}</div>
                )}
            </div>
        )
    }

    const renderAbsenceCell = (dateStr) => {
        const absences = getAbsencesForDate ? getAbsencesForDate(dateStr) : []
        if (absences.length === 0) return null

        return (
            <div className="flex flex-col justify-center items-center h-full gap-0.5 p-0.5">
                {absences.slice(0, 2).map((abs) => {
                    // Privacy Logic: Only show "Krank" to Admin or the user themselves
                    const isMe = abs.user_id === userId
                    const canSeeDetails = isAdmin || isMe
                    const _typeDisplay = canSeeDetails ? (abs.type || 'Abwesend') : 'Abwesend'

                    // Visuals: Sick is red, Vacation/Other is orange. 
                    // For privacy, "Abwesend" (hidden sick) should look like Vacation (neutral orange) to outsiders?
                    // Or we keep it red but call it "Abwesend"? 
                    // Better: Neutralize color for outsiders to fully hide distinction.
                    // Implementation: If I can't see details, it's always "neutral" (orange-ish/gray-ish).

                    const isSick = abs.type === 'Krank'

                    // If isSick AND I can see details -> Red.
                    // If isSick AND I can NOT see details -> Orange (look like vacation).
                    const colorClass = (isSick && canSeeDetails) ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'

                    return (
                        <div
                            key={abs.id}
                            className={`w-full rounded text-[8px] lg:text-[10px] font-bold text-center truncate px-0.5 lg:px-1 leading-tight ${colorClass}`}
                            title={canSeeDetails ? `${abs.profiles?.full_name} (${abs.type})` : `${abs.profiles?.full_name} (Abwesend)`}
                        >
                            {/* Mobile: Initials, Desktop: First name */}
                            <span className="lg:hidden">{getInitials(abs.profiles?.full_name)}</span>
                            <span className="hidden lg:inline">{abs.profiles?.full_name?.split(' ')[0] || getInitials(abs.profiles?.full_name)}</span>
                        </div>
                    )
                })}
                {absences.length > 2 && (
                    <div className="text-[8px] text-gray-400 font-bold leading-none">+{absences.length - 2}</div>
                )}
            </div>
        )
        // End of renderAbsenceCell function
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
