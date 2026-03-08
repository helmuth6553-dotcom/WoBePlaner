import React, { useState } from 'react'
import { ChevronDown, ChevronUp, Vote, CheckCircle2 } from 'lucide-react'
import { getReadableBreakdown } from '../utils/fairnessIndex'

/**
 * CoverageVotingPanel - Displayed on urgent shifts for the Soli-Punkte voting system.
 * 
 * All users see anonymized Soli-Punkte values.
 * Users vote with 3 preference levels.
 * Any on-duty employee or admin can close the vote.
 */
export default function CoverageVotingPanel({
    id,
    shift,
    userId,
    isAdmin,
    coverageRequest,        // { id, status, shift_id, assigned_to, resolved_by }
    allVotes,               // [{ user_id, responded, availability_preference }]
    fairnessIndices,        // [{ userId, index: { total, breakdown } }]
    userBalance,            // { total: number } current user's hour balance
    shiftHours,             // number - hours this shift is worth
    onVote,                 // (shiftId, preference) => void
    onResolve,              // (shiftId) => void
    assignedUserName,       // string - name shown after resolution
}) {
    const [showBreakdown, setShowBreakdown] = useState(false)
    const [showConfirmResolve, setShowConfirmResolve] = useState(false)

    const isResolved = coverageRequest?.status === 'assigned'
    const myVote = allVotes?.find(v => v.user_id === userId)
    const myIndex = fairnessIndices?.find(f => f.userId === userId)

    // Count responses
    const totalEligible = allVotes?.length || 0
    const totalResponded = allVotes?.filter(v => v.responded).length || 0

    // Build anonymized list sorted by preference then Soli-Punkte (ascending)
    const PREF_ORDER = { available: 0, reluctant: 1, emergency_only: 2 }
    const votingList = fairnessIndices?.map(fi => {
        const vote = allVotes?.find(v => v.user_id === fi.userId)
        return {
            userId: fi.userId,
            indexTotal: fi.index.total,
            preference: vote?.availability_preference || null,
            responded: vote?.responded || false,
            isMe: fi.userId === userId,
        }
    })
        .sort((a, b) => {
            // Sort: responded first, then by preference (available > reluctant > emergency_only), then by Soli-Punkte asc
            if (a.responded && !b.responded) return -1
            if (!a.responded && b.responded) return 1
            if (a.responded && b.responded) {
                const prefA = PREF_ORDER[a.preference] ?? 99
                const prefB = PREF_ORDER[b.preference] ?? 99
                if (prefA !== prefB) return prefA - prefB
            }
            return a.indexTotal - b.indexTotal
        }) || []

    // Find the recommended person (lowest Soli-Punkte among best preference)
    const bestPreference = votingList.find(v => v.responded)?.preference
    const recommended = bestPreference
        ? votingList.find(v => v.preference === bestPreference)
        : null

    // Preference labels and colors
    const PREF_CONFIG = {
        available: { emoji: '🟢', label: 'Kann ich machen', bg: 'bg-green-100 border-green-300 text-green-800' },
        reluctant: { emoji: '🟡', label: 'Ungern, aber möglich', bg: 'bg-yellow-100 border-yellow-300 text-yellow-800' },
        emergency_only: { emoji: '🔴', label: 'Nur im Notfall', bg: 'bg-red-100 border-red-300 text-red-800' },
    }

    // Calculate projected balance after taking shift
    const projectedBalance = userBalance ? userBalance.total + (shiftHours || 0) : null

    if (isResolved) {
        return (
            <div id={id} className="bg-green-50 border border-green-200 rounded-xl p-4 mb-2">
                <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 size={18} className="text-green-600" />
                    <span className="font-bold text-green-800">Dienst besetzt</span>
                </div>
                <p className="text-sm text-green-700">
                    <span className="font-bold">{assignedUserName || 'Zugewiesen'}</span> übernimmt diesen Dienst.
                </p>
            </div>
        )
    }

    return (
        <div id={id} className="bg-red-50 border border-red-200 rounded-xl p-4 mb-2 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Vote size={18} className="text-red-600" />
                    <span className="font-bold text-red-800 text-sm">Dienst muss besetzt werden</span>
                </div>
                <span className="text-xs text-red-500 font-medium">
                    {totalResponded} von {totalEligible} abgestimmt
                </span>
            </div>

            {/* Anonymized voting list */}
            <div className="space-y-1.5">
                {votingList.map((entry, idx) => {
                    const pref = entry.preference ? PREF_CONFIG[entry.preference] : null
                    const isRecommended = entry === recommended

                    return (
                        <div
                            key={idx}
                            className={`flex items-center justify-between p-2 rounded-lg text-xs border transition-all
                                ${entry.isMe ? 'ring-2 ring-blue-400 bg-blue-50 border-blue-200' :
                                    entry.responded ? 'bg-white border-gray-200' :
                                        'bg-gray-50 border-gray-100 text-gray-400'}`}
                        >
                            <div className="flex items-center gap-2">
                                {pref ? (
                                    <span>{pref.emoji}</span>
                                ) : (
                                    <span className="text-gray-300">⬜</span>
                                )}
                                <span className={`font-bold ${entry.isMe ? 'text-blue-700' : ''}`}>
                                    Soli-Punkte {entry.indexTotal.toFixed(1)}
                                    {entry.isMe && <span className="ml-1 text-blue-500 font-normal">(Du)</span>}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {pref && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${pref.bg}`}>
                                        {pref.label}
                                    </span>
                                )}
                                {!entry.responded && (
                                    <span className="text-[10px] text-gray-400">Keine Antwort</span>
                                )}
                                {isRecommended && (
                                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold border border-amber-200">
                                        ⭐ Empfehlung
                                    </span>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* My Soli-Punkte breakdown (expandable) */}
            {myIndex && (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <button
                        onClick={() => setShowBreakdown(!showBreakdown)}
                        className="w-full flex items-center justify-between p-3 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        <span>Dein Soli-Punkte: {myIndex.index.total.toFixed(1)}</span>
                        {showBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {showBreakdown && (
                        <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2">
                            {getReadableBreakdown(myIndex.index.breakdown).map((item, idx) => (
                                <div key={idx} className="flex justify-between text-xs">
                                    <div>
                                        <div className="font-medium text-gray-700">{item.label}</div>
                                        <div className="text-gray-400">{item.detail}</div>
                                    </div>
                                    <span className="font-bold text-gray-600">{item.points}</span>
                                </div>
                            ))}
                            {projectedBalance !== null && (
                                <div className="pt-2 border-t border-gray-100 flex justify-between text-xs">
                                    <span className="text-gray-500">Bei Übernahme</span>
                                    <span className={`font-bold ${projectedBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {userBalance.total >= 0 ? '+' : ''}{userBalance.total}h → {projectedBalance >= 0 ? '+' : ''}{projectedBalance}h
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Voting buttons */}
            {!myVote?.responded ? (
                <div className="grid grid-cols-3 gap-2">
                    <button
                        onClick={() => onVote(shift.id, 'available')}
                        className="py-2.5 px-2 text-xs font-bold rounded-xl border-2 border-green-300 bg-green-50 text-green-700 hover:bg-green-100 active:scale-95 transition-all"
                    >
                        🟢 Kann ich
                    </button>
                    <button
                        onClick={() => onVote(shift.id, 'reluctant')}
                        className="py-2.5 px-2 text-xs font-bold rounded-xl border-2 border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 active:scale-95 transition-all"
                    >
                        🟡 Ungern
                    </button>
                    <button
                        onClick={() => onVote(shift.id, 'emergency_only')}
                        className="py-2.5 px-2 text-xs font-bold rounded-xl border-2 border-red-300 bg-red-50 text-red-700 hover:bg-red-100 active:scale-95 transition-all"
                    >
                        🔴 Notfall
                    </button>
                </div>
            ) : (
                <div className={`text-center py-2 rounded-xl text-xs font-bold border ${PREF_CONFIG[myVote.availability_preference]?.bg || 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                    ✓ Deine Antwort: {PREF_CONFIG[myVote.availability_preference]?.label || 'Abgestimmt'}
                    <button
                        onClick={() => onVote(shift.id, null)}
                        className="ml-2 underline text-gray-500 hover:text-gray-700"
                    >
                        Ändern
                    </button>
                </div>
            )}

            {/* Resolve button (with confirmation) */}
            {!showConfirmResolve ? (
                <button
                    onClick={() => setShowConfirmResolve(true)}
                    className="w-full py-2.5 text-xs font-bold rounded-xl border-2 border-gray-300 bg-white text-gray-700 hover:bg-gray-100 active:scale-95 transition-all"
                    disabled={totalResponded === 0}
                >
                    Alle offenen Abstimmungen optimal besetzen
                </button>
            ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-bold text-amber-800">
                        Bist du sicher? Dies wird alle aktuell offenen Dienste bestmöglich verteilen.
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                onResolve(shift.id)
                                setShowConfirmResolve(false)
                            }}
                            className="flex-1 py-2 text-xs font-bold rounded-lg bg-green-600 text-white hover:bg-green-700 active:scale-95 transition-all"
                        >
                            Ja, abschließen
                        </button>
                        <button
                            onClick={() => setShowConfirmResolve(false)}
                            className="flex-1 py-2 text-xs font-bold rounded-lg bg-gray-200 text-gray-600 hover:bg-gray-300 active:scale-95 transition-all"
                        >
                            Abbrechen
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
