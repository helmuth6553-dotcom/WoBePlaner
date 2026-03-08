import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import { Trophy, Zap, MessageSquare, ChevronDown, ChevronUp, ShieldCheck, AlertTriangle, Flame } from 'lucide-react'
import { calculateFairnessIndex, calculateAllFairnessIndices } from '../utils/fairnessIndex'

const RANK_TIERS = {
    safe: { label: 'Top-Beitragender', icon: ShieldCheck, bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    mid: { label: 'Mittelfeld', icon: AlertTriangle, bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    risk: { label: 'Du bist bald dran', icon: Flame, bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
}

function getTier(rank, total) {
    const third = Math.ceil(total / 3)
    if (rank <= third) return 'safe'       // top ranks = most contributed = safe
    if (rank <= third * 2) return 'mid'
    return 'risk'                           // bottom ranks = least contributed = next up
}

export default function SoliPunktePanel() {
    const { user } = useAuth()
    const [allIndices, setAllIndices] = useState([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState(false)
    const [myFlexCount, setMyFlexCount] = useState(0)
    const [myVoteStats, setMyVoteStats] = useState({ participated: 0, eligible: 0 })
    const [teamAvgFlex, setTeamAvgFlex] = useState(0)
    const [prevMonthRank, setPrevMonthRank] = useState(null)

    useEffect(() => {
        if (!user) return
        fetchTeamData()
    }, [user])

    const fetchTeamData = async () => {
        setLoading(true)
        try {
            // 1. Get all non-admin profiles
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, role')
                .or('is_active.eq.true,is_active.is.null')
            const nonAdminIds = (profiles || []).filter(p => p.role !== 'admin').map(p => p.id)
            if (nonAdminIds.length === 0) { setLoading(false); return }

            // 2. Fetch all flex history
            const { data: flexData } = await supabase
                .from('shift_interests')
                .select('user_id, is_flex, shift:shifts(start_time)')
                .eq('is_flex', true)

            // 3. Fetch all vote history
            const { data: voteData } = await supabase
                .from('coverage_votes')
                .select('user_id, was_eligible, responded')

            // 4. Calculate indices for all users
            const indices = calculateAllFairnessIndices(nonAdminIds, flexData || [], voteData || [])
            setAllIndices(indices)

            // 5. My personal stats
            const myFlex = (flexData || []).filter(f => f.user_id === user.id).length
            setMyFlexCount(myFlex)

            const myVotes = (voteData || []).filter(v => v.user_id === user.id)
            const myEligible = myVotes.filter(v => v.was_eligible).length
            const myParticipated = myVotes.filter(v => v.was_eligible && v.responded).length
            setMyVoteStats({ participated: myParticipated, eligible: myEligible })

            // Team average flex
            const totalTeamFlex = (flexData || []).filter(f => nonAdminIds.includes(f.user_id)).length
            setTeamAvgFlex(nonAdminIds.length > 0 ? Math.round((totalTeamFlex / nonAdminIds.length) * 10) / 10 : 0)

            // 6. Previous month comparison (filter flex/votes by shift start_time)
            const now = new Date()
            const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
            const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

            const prevFlexData = (flexData || []).filter(f => {
                const st = f.shift?.start_time
                if (!st) return false
                const d = new Date(st)
                return d <= prevMonthEnd
            })

            // For votes we don't have timestamps on the votes themselves,
            // so previous month comparison is approximate (all votes up to prev month end)
            // This is a best-effort approximation
            const prevIndices = calculateAllFairnessIndices(nonAdminIds, prevFlexData, voteData || [])
            const prevMyIdx = prevIndices.findIndex(i => i.userId === user.id)
            if (prevMyIdx >= 0) {
                setPrevMonthRank(prevMyIdx + 1)
            }
        } catch (err) {
            console.error('SoliPunktePanel error:', err)
        } finally {
            setLoading(false)
        }
    }

    const myIndex = allIndices.findIndex(i => i.userId === user.id)
    const myRank = myIndex >= 0 ? myIndex + 1 : null
    const totalMembers = allIndices.length
    const tier = myRank ? getTier(myRank, totalMembers) : null
    const tierConfig = tier ? RANK_TIERS[tier] : null
    const TierIcon = tierConfig?.icon

    // Segment data for stacked bar chart
    const chartData = useMemo(() => {
        if (allIndices.length === 0) return []
        return allIndices.map((entry, idx) => {
            const bd = entry.index.breakdown
            const flexPart = bd.flexComponent
            const votePart = bd.participationBonus
            const total = entry.index.total
            return {
                rank: idx + 1,
                isMe: entry.userId === user?.id,
                total,
                flexPart,
                votePart,
            }
        })
    }, [allIndices, user])

    const maxScore = useMemo(() => {
        return Math.max(...chartData.map(d => d.total), 1)
    }, [chartData])

    if (loading) {
        return <div className="animate-pulse bg-gray-100 rounded-2xl h-48"></div>
    }

    if (!myRank) return null

    const rankDiff = prevMonthRank ? prevMonthRank - myRank : null

    return (
        <div className="space-y-4">
            {/* 1. Rang-Karte */}
            <div className={`p-5 rounded-2xl border ${tierConfig.bg} ${tierConfig.border}`}>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Trophy size={20} className={tierConfig.text} />
                        <h3 className="font-bold text-gray-900">Dein Soli-Rang</h3>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${tierConfig.bg} ${tierConfig.text} border ${tierConfig.border}`}>
                        <TierIcon size={12} />
                        {tierConfig.label}
                    </span>
                </div>
                <p className="text-2xl font-black text-gray-900">
                    Platz {myRank} <span className="text-base font-medium text-gray-500">von {totalMembers}</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                    {tier === 'safe' && 'Du hast viel beigetragen — weiter so! Beim nächsten offenen Dienst sind andere zuerst dran.'}
                    {tier === 'mid' && 'Du bist im Mittelfeld — ein paar Einsätze oder Abstimmungen bringen dich weiter nach oben.'}
                    {tier === 'risk' && 'Du hast wenig beigetragen — beim nächsten offenen Dienst wirst du wahrscheinlich empfohlen.'}
                </p>
            </div>

            {/* 2. Team-Vergleich Balkendiagramm */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-900 text-sm">Team-Vergleich</h3>
                    <div className="flex gap-3 text-[10px]">
                        <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400"></span>
                            Einspringen
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-sm bg-teal-400"></span>
                            Abstimmungen
                        </span>
                    </div>
                </div>

                <div className="space-y-1.5">
                    {chartData.map((d, idx) => {
                        const flexWidth = maxScore > 0 ? (d.flexPart / maxScore) * 100 : 0
                        const voteWidth = maxScore > 0 ? (d.votePart / maxScore) * 100 : 0
                        const totalWidth = flexWidth + voteWidth

                        return (
                            <div key={idx}>
                                {/* Separator line between ranks above and below me */}
                                {d.isMe && idx > 0 && (
                                    <div className="border-t-2 border-dashed border-gray-300 my-2"></div>
                                )}
                                <div className={`flex items-center gap-2 py-1.5 px-2 rounded-lg transition-all ${d.isMe ? 'bg-blue-50 ring-2 ring-blue-300' : ''}`}>
                                    <span className={`text-[10px] font-bold w-8 text-right shrink-0 ${d.isMe ? 'text-blue-700' : 'text-gray-400'}`}>
                                        {d.isMe ? 'DU' : `#${d.rank}`}
                                    </span>
                                    <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden relative">
                                        <div
                                            className="h-full flex rounded-full overflow-hidden"
                                            style={{ width: `${Math.max(totalWidth, 2)}%` }}
                                        >
                                            {flexWidth > 0 && (
                                                <div
                                                    className="h-full bg-emerald-400"
                                                    style={{ width: `${(flexWidth / totalWidth) * 100}%` }}
                                                />
                                            )}
                                            {voteWidth > 0 && (
                                                <div
                                                    className="h-full bg-teal-400"
                                                    style={{ width: `${(voteWidth / totalWidth) * 100}%` }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {d.isMe && idx < chartData.length - 1 && (
                                    <div className="border-t-2 border-dashed border-gray-300 my-2"></div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* 3. Faktor-Aufschlüsselung */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
                >
                    <h3 className="font-bold text-gray-900 text-sm">Warum Platz {myRank}?</h3>
                    {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </button>

                {expanded && (
                    <div className="px-5 pb-5 space-y-3 border-t border-gray-100 pt-4">
                        {/* Einspringen */}
                        <div className="flex items-start gap-3">
                            <div className="bg-emerald-50 p-2 rounded-lg shrink-0">
                                <Zap size={16} className="text-emerald-600" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <p className="font-bold text-sm text-gray-900">Einspringen</p>
                                    <span className="text-xs font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                                        +{(myFlexCount * 10).toFixed(0)} Pkt
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500">
                                    Du bist {myFlexCount}× eingesprungen — Team-Schnitt {teamAvgFlex}×
                                </p>
                                {myFlexCount < teamAvgFlex && (
                                    <span className="text-[10px] text-red-500 font-medium">↓ unter Schnitt</span>
                                )}
                                {myFlexCount > teamAvgFlex && (
                                    <span className="text-[10px] text-emerald-500 font-medium">↑ über Schnitt</span>
                                )}
                            </div>
                        </div>

                        {/* Abstimmungen */}
                        <div className="flex items-start gap-3">
                            <div className="bg-teal-50 p-2 rounded-lg shrink-0">
                                <MessageSquare size={16} className="text-teal-600" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <p className="font-bold text-sm text-gray-900">Abstimmungen</p>
                                    <span className="text-xs font-bold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">
                                        +{(myVoteStats.participated * 2).toFixed(0)} Pkt
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500">
                                    {myVoteStats.participated} von {myVoteStats.eligible} Abstimmungen teilgenommen
                                </p>
                                {myVoteStats.eligible > 0 && myVoteStats.participated < myVoteStats.eligible && (
                                    <span className="text-[10px] text-amber-500 font-medium">
                                        {myVoteStats.eligible - myVoteStats.participated} verpasst
                                    </span>
                                )}
                            </div>
                        </div>

                    </div>
                )}
            </div>

            {/* 4. Verlauf-Hinweis */}
            {rankDiff !== null && rankDiff !== 0 && (
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 text-center">
                    <p className="text-sm text-gray-600">
                        Letzten Monat warst du <span className="font-bold">Platz {prevMonthRank}</span>
                        {rankDiff > 0 && (
                            <span className="text-emerald-600 font-bold"> — du hast dich um {rankDiff} {rankDiff === 1 ? 'Platz' : 'Plätze'} verbessert</span>
                        )}
                        {rankDiff < 0 && (
                            <span className="text-red-600 font-bold"> — du bist um {Math.abs(rankDiff)} {Math.abs(rankDiff) === 1 ? 'Platz' : 'Plätze'} abgerutscht</span>
                        )}
                    </p>
                </div>
            )}
        </div>
    )
}
