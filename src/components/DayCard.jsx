import { useState, useEffect } from 'react'
import { format, isValid } from 'date-fns'
import { de } from 'date-fns/locale'
import { User, Check, Moon, Sun, CalendarOff, Users, Clock, AlertCircle, Thermometer, Plus, BookOpen } from 'lucide-react'
import ActionSheet from './ActionSheet'
import { calculateWorkHours } from '../utils/timeCalculations'

const getUserColor = (name) => {
    const colors = [
        'bg-red-100 border-red-200 text-red-900',
        'bg-orange-100 border-orange-200 text-orange-900',
        'bg-amber-100 border-amber-200 text-amber-900',
        'bg-yellow-100 border-yellow-200 text-yellow-900',
        'bg-lime-100 border-lime-200 text-lime-900',
        'bg-green-100 border-green-200 text-green-900',
        'bg-emerald-100 border-emerald-200 text-emerald-900',
        'bg-teal-100 border-teal-200 text-teal-900',
        'bg-cyan-100 border-cyan-200 text-cyan-900',
        'bg-sky-100 border-sky-200 text-sky-900',
        'bg-blue-100 border-blue-200 text-blue-900',
        'bg-indigo-100 border-indigo-200 text-indigo-900',
        'bg-violet-100 border-violet-200 text-violet-900',
        'bg-purple-100 border-purple-200 text-purple-900',
        'bg-fuchsia-100 border-fuchsia-200 text-fuchsia-900',
        'bg-pink-100 border-pink-200 text-pink-900',
        'bg-rose-100 border-rose-200 text-rose-900'
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i)
    return colors[Math.abs(hash) % colors.length]
}

export default function DayCard({ dateStr, shifts, userId, onToggleInterest, onAssign, onUpdateShift, onDeleteShift, onCreateShift, isAdmin, absenceReason, holiday, absences = [], allProfiles = [] }) {
    const date = new Date(dateStr)
    if (!isValid(date)) return null
    const [selectedShift, setSelectedShift] = useState(null)
    const [isAddMenuOpen, setIsAddMenuOpen] = useState(false)
    const [editStart, setEditStart] = useState('')
    const [editEnd, setEditEnd] = useState('')
    const [editTitle, setEditTitle] = useState('')

    useEffect(() => {
        if (selectedShift) {
            const s = new Date(selectedShift.start_time)
            const e = new Date(selectedShift.end_time)
            setEditStart(isValid(s) ? format(s, 'HH:mm') : '')
            setEditEnd(isValid(e) ? format(e, 'HH:mm') : '')
            setEditTitle(selectedShift.title || '')
        }
    }, [selectedShift])

    // Sync selectedShift with latest data from props (for live updates in modal)
    useEffect(() => {
        if (selectedShift) {
            const freshShift = shifts.find(s => s.id === selectedShift.id)
            if (freshShift) {
                setSelectedShift(prev => {
                    if (!prev) return null  // Safety check
                    return {
                        ...freshShift,
                        label: prev.label,
                        icon: prev.icon
                    }
                })
            }
        }
    }, [shifts])
    const isSick = absenceReason?.type?.toLowerCase() === 'krank'

    const getShiftForSlot = (slotType) => {
        return shifts.find(s => {
            const t = s.type.toUpperCase()
            if (slotType === 'TD1') return t === 'TD1' || t === 'TAGDIENST' || t === 'TAG'
            if (slotType === 'TD2') return t === 'TD2'
            if (slotType === 'ND') return t === 'ND' || t === 'NACHTDIENST' || t === 'NACHT'
            if (slotType === 'DBD') return t === 'DBD' || t === 'DOPPEL'
            return false
        })
    }

    const getDisplayName = (profile) => {
        // Prefer display_name (nickname) for rosters, fallback to full_name
        const name = profile?.display_name || profile?.full_name
        if (name) return name.trim().split(' ')[0]
        return profile?.email?.split('@')[0]
    }

    const handleShiftClick = (shift, label, icon) => {
        if (!shift) return

        // Block interaction if absent (except for details viewing, but logic says 'Keine Eintragung möglich')
        // We allow viewing details for Team/Training even if absent? Yes.
        // But for normal shifts, toggle is blocked.

        if (absenceReason && absenceReason.status === 'genehmigt' && !isAdmin) {
            // Allow viewing Team/Training details even if absent?
            if (shift.type !== 'TEAM' && shift.type !== 'FORTBILDUNG') {
                const msg = absenceReason.type && absenceReason.type.toLowerCase() === 'krank' ? 'Du bist krank gemeldet.' : 'Du bist im Urlaub.'
                alert(msg + ' Keine Eintragung möglich.')
                return
            }
        }

        // Always open details for Admin OR for Special Events (Team/Training)
        if (isAdmin || shift.type === 'TEAM' || shift.type === 'FORTBILDUNG') {
            setSelectedShift({ ...shift, label, icon })
            return
        }

        // Normal Shift toggle for Employees
        const amIInterested = shift.interests?.some(i => i.user_id === userId)
        onToggleInterest(shift.id, amIInterested)
    }

    const formatTime = (isoString) => {
        if (!isoString) return '--:--'
        const d = new Date(isoString)
        if (!isValid(d)) return '--:--'
        return format(d, 'HH:mm')
    }

    const SpecialEventRow = ({ shift }) => {
        const isTeam = shift.type === 'TEAM'
        const label = isTeam ? 'Teamsitzung' : 'Fortbildung'
        const icon = isTeam ? <Users size={18} /> : <BookOpen size={18} />

        let rowBg = isTeam ? "bg-purple-100 border-purple-200" : "bg-teal-50 border-teal-200"
        let iconBg = isTeam ? "bg-purple-200 text-purple-700" : "bg-teal-100 text-teal-700"
        let statusText = ""
        let statusColor = isTeam ? "text-purple-700" : "text-teal-700"

        if (isTeam) {
            statusText = "Pflicht"
        } else {
            const interestedCount = shift.interests?.length || 0
            const amIInterested = shift.interests?.some(i => i.user_id === userId)
            if (amIInterested) {
                rowBg = "bg-teal-100 border-teal-300"
                statusText = "Dabei"
                statusColor = "text-teal-800 font-bold"
            } else {
                statusText = interestedCount > 0 ? `${interestedCount} Pers.` : "Offen"
            }
        }

        return (
            <div
                onClick={() => handleShiftClick(shift, label, icon)}
                className={`flex items-center justify-between p-3 rounded-xl border mb-2 active:scale-[0.98] transition-all cursor-pointer shadow-sm ${rowBg}`}
            >
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className={`p-2.5 rounded-full shrink-0 ${iconBg}`}>
                        {icon}
                    </div>
                    <div className="min-w-0">
                        <div className="font-bold text-sm text-gray-900">{label}</div>
                        {shift.title && <div className="text-xs font-bold text-gray-600 truncate">{shift.title}</div>}
                        <div className="text-xs text-gray-500 flex items-center gap-1 font-medium mt-0.5">
                            <Clock size={10} />
                            {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                        </div>
                    </div>
                </div>
                <div className={`text-xs text-right truncate ml-2 font-bold uppercase tracking-wider ${statusColor}`}>
                    {statusText}
                </div>
            </div>
        )
    }

    const ShiftRow = ({ slotCode, label, icon }) => {
        const shift = getShiftForSlot(slotCode)
        if (!shift) return null

        const amIInterested = shift.interests?.some(i => i.user_id === userId)

        // Flex Logic
        const interestNames = shift.interests?.map(i => {
            // FLEX: Day 0 = sick report, then 3 more days (until end of Day 3)
            const urgentDate = new Date(shift.urgent_since)
            const interestDate = new Date(i.created_at)
            const daysDiff = Math.floor((interestDate - urgentDate) / (24 * 60 * 60 * 1000))
            const isFlex = shift.urgent_since && i.created_at &&
                interestDate > urgentDate && daysDiff <= 3

            return {
                name: getDisplayName(i.profiles),
                isFlex
            }
        }) || []

        let statusText = "Offen"
        let statusColor = "text-gray-400"
        let rowBg = "bg-white hover:bg-gray-50"
        let iconBg = "bg-gray-100 text-gray-500"

        // Urgency Logic - only show as urgent if no one has shown interest yet
        const isUrgent = !!shift.urgent_since && !shift.assigned_to && interestNames.length === 0

        if (interestNames.length === 1) {
            // Single User - Special Display
            const u = interestNames[0]
            const colorClass = getUserColor(u.name)

            rowBg = `${colorClass} shadow-sm`
            statusColor = "text-current"
            iconBg = "bg-white/50 text-current"

            statusText = (
                <div className="flex flex-col items-end justify-center">
                    <span className="text-2xl font-black leading-none tracking-tight">{u.name}</span>
                    {u.isFlex && <span className="mt-0.5 text-[10px] font-bold bg-white/40 px-1.5 rounded">FLEX</span>}
                </div>
            )
        } else if (interestNames.length > 0) {
            statusText = (
                <span className="flex gap-1 items-center justify-end">
                    {interestNames.slice(0, 3).map((u, idx) => (
                        <span key={idx} className="flex items-center">
                            {u.name}
                            {u.isFlex && <span className="ml-1 text-[10px] bg-purple-100 text-purple-700 px-1 rounded font-bold">FLEX</span>}
                            {idx < Math.min(interestNames.length, 3) - 1 && ", "}
                        </span>
                    ))}
                    {interestNames.length > 3 && "..."}
                </span>
            )
            statusColor = "text-gray-700 font-medium"

            if (amIInterested) {
                rowBg = "bg-blue-50 border-blue-200"
                statusColor = "text-blue-700 font-bold"
                iconBg = "bg-blue-100 text-blue-600"
            } else {
                rowBg = "bg-white border-gray-200"
                iconBg = "bg-gray-100 text-gray-600"
            }
        } else if (isUrgent) {
            rowBg = "bg-red-100 border-red-300 animate-pulse ring-2 ring-red-200"
            statusText = "DRINGEND"
            statusColor = "text-red-700 font-bold"
            iconBg = "bg-red-200 text-red-700"
        }

        return (
            <div
                onClick={() => handleShiftClick(shift, label, icon)}
                className={`flex items-center justify-between p-3 rounded-xl border mb-2 last:mb-0 active:scale-[0.98] transition-all cursor-pointer shadow-sm ${rowBg}`}
            >
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className={`p-2.5 rounded-full shrink-0 ${iconBg}`}>
                        {icon}
                    </div>
                    <div className="min-w-0">
                        <div className="font-bold text-sm text-gray-900">{label}</div>
                        <div className="text-xs text-gray-400 flex items-center gap-2">
                            <span className="flex items-center gap-1">
                                <Clock size={10} />
                                {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                            </span>
                            {(() => {
                                const start = new Date(shift.start_time)
                                const end = new Date(shift.end_time)
                                if (isValid(start) && isValid(end)) {
                                    const hours = calculateWorkHours(
                                        start.toISOString(),
                                        end.toISOString(),
                                        shift.type,
                                        []
                                    )
                                    return (
                                        <span className="text-gray-500 font-bold">
                                            {hours.toFixed(2)}h
                                        </span>
                                    )
                                }
                                return null
                            })()}
                        </div>
                    </div>
                </div>
                <div className={`text-sm text-right truncate ml-2 ${statusColor}`}>
                    {statusText}
                </div>
            </div>
        )
    }

    const renderSheetContent = () => {
        if (!selectedShift) return null
        const shift = selectedShift
        const isTeam = shift.type === 'TEAM'
        const isTraining = shift.type === 'FORTBILDUNG'

        let participants = []

        if (isTeam) {
            // Calculate participants: All profiles minus absentees and admins
            // Admins are controllers, not employees - they don't participate in team meetings
            participants = allProfiles.filter(p => {
                const isAbsent = absences.some(a => a.user_id === p.id)
                const isAdmin = p.role === 'admin'
                return !isAbsent && !isAdmin
            }).map(p => ({
                id: p.id,
                name: getDisplayName(p),
                isAuto: true
            }))
        } else {
            // Normal interests
            participants = shift.interests?.map(i => ({
                id: i.user_id,
                name: getDisplayName(i.profiles)
            })) || []
        }

        const amIParticipating = participants.some(p => p.id === userId)

        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-xl">
                    <div className="p-3 bg-white rounded-full shadow-sm text-gray-700">
                        {selectedShift.icon}
                    </div>
                    <div>
                        <h4 className="font-bold text-xl text-gray-900">{selectedShift.label}</h4>
                        <p className="text-gray-500 text-sm">
                            {format(date, 'EEEE, d. MMMM', { locale: de })}
                        </p>
                        {shift.title && <p className="text-indigo-600 font-bold text-sm mt-1">{shift.title}</p>}
                    </div>
                </div>

                {isTraining && !isAdmin && (
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex justify-between items-center">
                        <span className="font-bold text-blue-900">{amIParticipating ? "Du nimmst teil" : "Möchtest du teilnehmen?"}</span>
                        <button
                            onClick={() => onToggleInterest(shift.id, amIParticipating)}
                            className={`px-4 py-2 rounded-lg font-bold transition-colors ${amIParticipating ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                        >
                            {amIParticipating ? "Abmelden" : "Anmelden"}
                        </button>
                    </div>
                )}

                <div className="space-y-3">
                    <h5 className="font-bold text-gray-900 flex items-center gap-2">
                        <Users size={18} />
                        {isTeam ? 'Voraussichtliche Teilnehmer' : 'Angemeldete Teilnehmer'}
                    </h5>
                    {participants.length === 0 ? (
                        <p className="text-gray-400 italic text-sm">Niemand.</p>
                    ) : (
                        <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
                            {participants.map((u, idx) => (
                                <div key={u.id || idx} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100">
                                    <span className="font-medium text-gray-700">{u.name}</span>
                                    {isAdmin && !isTeam && (
                                        <button
                                            onClick={() => onToggleInterest(shift.id, true, u.id)}
                                            className="text-red-500 hover:bg-red-50 p-1 rounded"
                                        >
                                            Entfernen
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {isAdmin && !isTeam && (
                    <div className="space-y-3 pt-4 border-t border-gray-100">
                        <label className="block text-sm font-medium text-gray-700">Mitarbeiter hinzufügen</label>
                        <select
                            onChange={(e) => {
                                if (e.target.value) {
                                    onToggleInterest(shift.id, false, e.target.value)
                                }
                            }}
                            className="w-full p-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-black focus:outline-none"
                            defaultValue=""
                        >
                            <option value="" disabled>Auswählen...</option>
                            {allProfiles
                                .filter(p => !participants.some(u => u.id === p.id))
                                .map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.full_name || p.email}
                                    </option>
                                ))
                            }
                        </select>
                    </div>
                )}

                {isAdmin && (
                    <div className="space-y-3 pt-4 border-t border-gray-100">
                        <h5 className="font-bold text-gray-900">Verwaltung</h5>

                        {isTraining && (
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Thema / Titel</label>
                                <input
                                    type="text"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    placeholder="Thema der Fortbildung"
                                    className="w-full p-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-black focus:outline-none"
                                />
                            </div>
                        )}

                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-gray-500 mb-1">Start</label>
                                <input
                                    type="time"
                                    value={editStart}
                                    onChange={(e) => setEditStart(e.target.value)}
                                    className="w-full p-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-black focus:outline-none"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-gray-500 mb-1">Ende</label>
                                <input
                                    type="time"
                                    value={editEnd}
                                    onChange={(e) => setEditEnd(e.target.value)}
                                    className="w-full p-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-black focus:outline-none"
                                />
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                if (!editStart || !editEnd) return

                                const startDate = new Date(`${dateStr}T${editStart}:00`)
                                let endDate = new Date(`${dateStr}T${editEnd}:00`)

                                if (endDate < startDate) {
                                    endDate.setDate(endDate.getDate() + 1)
                                }

                                onUpdateShift(selectedShift.id, startDate.toISOString(), endDate.toISOString(), editTitle)
                                setSelectedShift(null)
                            }}
                            className="w-full py-3 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-colors"
                        >
                            Speichern
                        </button>
                        <button
                            onClick={() => {
                                onDeleteShift(selectedShift.id)
                                setSelectedShift(null)
                            }}
                            className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-colors mt-2"
                        >
                            Löschen
                        </button>
                    </div>
                )}
            </div>
        )
    }

    const specialShifts = shifts.filter(s => s.type === 'TEAM' || s.type === 'FORTBILDUNG')

    return (
        <>
            <div className={`bg-white shadow-sm rounded-2xl mb-4 overflow-hidden border ${holiday || isSick ? 'border-red-100' : (absenceReason ? 'border-orange-100' : 'border-gray-100')}`}>
                <div className={`px-5 py-4 border-b flex justify-between items-center ${holiday || isSick ? 'bg-red-50/50' : (absenceReason ? 'bg-orange-50/50' : 'bg-white')}`}>
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                            <span className={`text-sm font-bold uppercase tracking-wider ${holiday ? 'text-red-400' : 'text-gray-400'}`}>
                                {format(date, 'EEEE', { locale: de })}
                            </span>
                            <span className={`font-black text-2xl tracking-tight ${holiday ? 'text-red-600' : 'text-gray-900'}`}>
                                {format(date, 'd. MMMM', { locale: de })}
                            </span>
                        </div>
                        {isAdmin && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setIsAddMenuOpen(!isAddMenuOpen)
                                }}
                                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors mt-1"
                            >
                                <Plus size={18} />
                            </button>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        {holiday && (
                            <span className="text-xs font-bold text-red-500 bg-red-100 px-2 py-1 rounded-lg text-right max-w-[120px] truncate">
                                {holiday.name}
                            </span>
                        )}
                        {absenceReason && (
                            <span className={`text-xs font-bold px-2 py-1 rounded-lg flex items-center gap-1 
                                ${isSick
                                    ? 'bg-red-100 text-red-700'
                                    : (absenceReason.status === 'genehmigt' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700')
                                }`}>
                                {isSick ? <Thermometer size={12} /> : <CalendarOff size={12} />}
                                {isSick ? 'Krankenstand' : (absenceReason.type || 'Urlaub')}
                            </span>
                        )}
                        {/* Show all absences for this day */}
                        {absences && absences.length > 0 && (
                            <div className="flex flex-wrap gap-1 justify-end mt-1">
                                {absences.map((abs, idx) => {
                                    const name = abs.profiles?.full_name || abs.profiles?.email?.split('@')[0] || '?'
                                    const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                                    return (
                                        <span key={idx} className="text-[10px] font-bold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded" title={name}>
                                            {initials}
                                        </span>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
                <div className="p-3 bg-gray-50/30">
                    {specialShifts.map(s => (
                        <SpecialEventRow key={s.id} shift={s} />
                    ))}

                    <ShiftRow slotCode="TD1" label="Tagdienst 1" icon={<Sun size={18} />} />
                    <ShiftRow slotCode="TD2" label="Tagdienst 2" icon={<Sun size={18} />} />
                    <ShiftRow slotCode="ND" label="Nachtdienst" icon={<Moon size={18} />} />
                    <ShiftRow slotCode="DBD" label="DBD" icon={<Users size={18} />} />

                    {isAdmin && isAddMenuOpen && (
                        <div className="mt-2 border-t border-dashed border-gray-200 pt-2 grid grid-cols-3 gap-1 animate-in slide-in-from-top-2 fade-in duration-200">
                            {['TD1', 'TD2', 'ND', 'DBD', 'TEAM', 'FORTBILDUNG'].map(type => (
                                <button
                                    key={type}
                                    onClick={() => {
                                        onCreateShift(dateStr, type)
                                        setIsAddMenuOpen(false)
                                    }}
                                    className={`py-2 text-xs font-bold border rounded-lg hover:text-white transition-colors
                                        ${type === 'TEAM' || type === 'FORTBILDUNG' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-600' : 'bg-white border-gray-200 hover:bg-black'}
                                    `}
                                >
                                    {type === 'TEAM' ? 'Teamsitzung' : (type === 'FORTBILDUNG' ? 'Fortbildung' : type)}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <ActionSheet
                isOpen={!!selectedShift}
                onClose={() => setSelectedShift(null)}
                title="Dienst-Details"
            >
                {renderSheetContent()}
            </ActionSheet>
        </>
    )
}
