import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { User, Check } from 'lucide-react'

export default function ShiftCard({ shift, userId, onToggleInterest, onAssign, isAdmin }) {
    // Checks
    const interests = shift.interests || []
    const amIInterested = interests.some(i => i.user_id === userId)
    const interestCount = interests.length
    const isAssigned = interestCount === 1

    // Styles basierend auf Status
    let borderColor = "border-gray-200"
    if (isAssigned) borderColor = "border-green-500 border-l-4"
    else if (interestCount >= 3) borderColor = "border-yellow-400 border-l-4"

    return (
        <div className={`bg-white shadow rounded-lg p-4 mb-3 border ${borderColor} transition-all`}>
            <div className="flex justify-between items-start mb-2">
                <div>
                    <p className="font-bold text-lg">
                        {format(new Date(shift.start_time), 'EEEE, dd.MM.', { locale: de })}
                    </p>
                    <p className="text-sm text-gray-500">
                        {format(new Date(shift.start_time), 'HH:mm')} - {format(new Date(shift.end_time), 'HH:mm')}
                    </p>
                    <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded mt-1">
                        {shift.type}
                    </span>
                </div>

                {/* Status Icon */}
                {isAssigned ? (
                    <div className="text-green-600 flex flex-col items-center">
                        <Check size={24} />
                        <span className="text-xs font-bold">Fixiert</span>
                    </div>
                ) : (
                    <div className="text-gray-400">
                        <span className="text-xs">{interestCount}/3 Interessenten</span>
                    </div>
                )}
            </div>

            {/* Interessenten Liste (Avatare) */}
            <div className="flex -space-x-2 overflow-hidden my-3">
                {interests.map((interest) => (
                    <div key={interest.id} className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-gray-300 flex items-center justify-center text-xs font-bold" title={interest.user_id}>
                        {/* Hier würde man Initialen anzeigen, wir nutzen Dummy Icons */}
                        <User size={14} />
                    </div>
                ))}
            </div>

            {/* Action Buttons */}
            <div className="mt-2">
                {!isAssigned && (
                    <button
                        onClick={() => onToggleInterest(shift.id, amIInterested)}
                        className={`w-full py-2 rounded font-medium text-sm flex items-center justify-center gap-2
              ${amIInterested
                                ? 'bg-red-50 text-red-600 border border-red-200'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                        {amIInterested ? 'Interesse zurückziehen' : 'Interesse melden'}
                    </button>
                )}

                {/* ADMIN CONTROLS (Nur sichtbar wenn Admin Mode an) */}
                {isAdmin && !isAssigned && interestCount > 0 && (
                    <div className="mt-2 border-t pt-2">
                        <p className="text-xs text-gray-500 mb-1">Admin: Zuweisen an:</p>
                        <div className="flex gap-2 overflow-x-auto">
                            {interests.map(i => (
                                <button
                                    key={i.id}
                                    onClick={() => onAssign(shift.id, i.user_id)}
                                    className="text-xs bg-blue-600 text-white px-2 py-1 rounded"
                                >
                                    User {i.user_id.slice(0, 4)}...
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {isAssigned && (
                    <div className="bg-green-50 text-green-800 p-2 rounded text-sm text-center">
                        Dienst vergeben an: {amIInterested ? <strong>DICH</strong> : 'Kollege'}
                    </div>
                )}
            </div>
        </div>
    )
}
