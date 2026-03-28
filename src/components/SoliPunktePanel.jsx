import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import { Trophy, Zap, MessageSquare, ChevronDown, ChevronUp, ShieldCheck, AlertTriangle, Flame, TrendingUp, Minus, Users, Coffee } from 'lucide-react'
import { calculateAllFairnessIndices } from '../utils/fairnessIndex'

const RANK_TIERS = {
    safe: { label: 'Schon wieder ich', icon: ShieldCheck, bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', title: 'Schon wieder ich' },
    mid: { label: 'Kommt drauf an', icon: Users, bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', title: 'Kommt drauf an' },
    risk: { label: "Hab's nicht gesehen", icon: Coffee, bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', title: "Hab's nicht gesehen" },
}

function getTier(rank, total) {
    const safeCount = Math.ceil(total * 0.3)
    const midCount = Math.ceil(total * 0.4)
    if (rank <= safeCount) return 'safe'
    if (rank <= safeCount + midCount) return 'mid'
    return 'risk'
}

export default function SoliPunktePanel() {
    const { user } = useAuth()
    const [allIndices, setAllIndices] = useState([])
    const [loading, setLoading] = useState(true)
    const [expanded, setExpanded] = useState(false)
    const [myFlexCount, setMyFlexCount] = useState(0)
    const [myVoteStats, setMyVoteStats] = useState({ participated: 0, eligible: 0 })
    const [teamAvgFlex, setTeamAvgFlex] = useState(0)
    const [prevMyTotal, setPrevMyTotal] = useState(null)
    const [prevTeamAvg, setPrevTeamAvg] = useState(null)

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
            const prevMy = prevIndices.find(i => i.userId === user.id)
            if (prevMy) {
                setPrevMyTotal(prevMy.index.total)
            }
            const prevTotalSum = prevIndices.reduce((sum, item) => sum + item.index.total, 0)
            setPrevTeamAvg(prevIndices.length > 0 ? prevTotalSum / prevIndices.length : 0)
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

    // Calculate Min and Max to establish the slider scale
    const maxScore = useMemo(() => {
        return Math.max(...allIndices.map(d => d.index.total), 1)
    }, [allIndices])

    const minScore = useMemo(() => {
        return Math.min(...allIndices.map(d => d.index.total), 0)
    }, [allIndices])

    if (loading) {
        return <div className="animate-pulse bg-gray-100 rounded-2xl h-48"></div>
    }

    if (!myRank) return null

    const myTotalPoints = myIndex >= 0 ? allIndices[myIndex].index.total : 0
    const pointRange = Math.max(maxScore - minScore, 1)

    // Map points to a 0-100 percentage for the slider.
    // Constrain it between 5% and 95% to leave visual room on the rounded edges.
    const rawPercentage = ((myTotalPoints - minScore) / pointRange) * 100
    const sliderPos = Math.max(5, Math.min(95, rawPercentage))

    const teamAvgTotal = allIndices.length > 0 ? allIndices.reduce((sum, i) => sum + i.index.total, 0) / allIndices.length : 0

    // Trend calculation
    let myTrend = null
    let teamTrend = null
    if (prevMyTotal !== null && prevTeamAvg !== null) {
        myTrend = myTotalPoints - prevMyTotal
        teamTrend = teamAvgTotal - prevTeamAvg
    }

    return (
        <div className="space-y-4">
            {/* 1. Visual Slider Card */}
            <div className="bg-white rounded-xl p-6 shadow-[0_2px_10px_rgb(0,0,0,0.04)] flex flex-col items-center">
                <div className="text-center w-full mb-8">
                    <span className="text-[10px] sm:text-xs font-bold tracking-widest text-gray-400 uppercase">
                        Dein Status im Team
                    </span>
                </div>

                <div className="w-full relative px-2 sm:px-6 mb-4">
                    {/* Gradient Background Track */}
                    <div className="h-4 sm:h-5 rounded-full w-full bg-gradient-to-r from-red-300 via-amber-300 to-emerald-300 opacity-60"></div>

                    {/* The thumb */}
                    <div
                        className="absolute top-1/2 flex flex-col items-center transition-all duration-1000 ease-out z-10"
                        style={{ left: `calc(${sliderPos}%)`, transform: 'translate(-50%, -50%)' }}
                    >
                        {/* Tooltip above */}
                        <div className="absolute bottom-full mb-2 bg-[#0f172a] text-white text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap shadow-lg animate-in fade-in slide-in-from-bottom-1">
                            Du ({myTotalPoints.toFixed(0)})
                            {/* bottom arrow pointing to the circle */}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#0f172a]"></div>
                        </div>

                        {/* The circle thumb */}
                        <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-white border-[3px] border-indigo-100 shadow-md flex items-center justify-center">
                            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-indigo-500"></div>
                        </div>
                    </div>

                    {/* Labels below */}
                    <div className="flex justify-between mt-5 px-1">
                        <span className="text-[9px] sm:text-[10px] font-black tracking-wider text-red-500 uppercase">📱 Nicht gesehen</span>
                        <span className="text-[9px] sm:text-[10px] font-black tracking-wider text-amber-500 uppercase">🤷 Mal Schauen</span>
                        <span className="text-[9px] sm:text-[10px] font-black tracking-wider text-emerald-500 uppercase">🙋 Schon wieder ich</span>
                    </div>
                </div>
            </div>

            {/* 2. Tier Descriptive Card */}
            <div className={`rounded-xl p-5 sm:p-6 ${tierConfig.bg} border ${tierConfig.border}`}>
                <div className="flex items-center gap-4">
                    <div className="bg-white p-3 rounded-2xl shadow-sm shrink-0">
                        <TierIcon size={24} className={tierConfig.text} />
                    </div>
                    <div>
                        <h3 className={`font-black text-lg ${tierConfig.text}`}>
                            {tierConfig.title}
                        </h3>
                        <p className="text-gray-600 text-xs sm:text-sm mt-1 leading-relaxed">
                            {tier === 'safe' && 'Wenn alle fragen wer einspringt, kennen alle die Antwort.'}
                            {tier === 'mid' && 'Solide Mitte. Das Team zählt auf dich.'}
                            {tier === 'risk' && 'Die Benachrichtigung war da. Wirklich.'}
                        </p>
                    </div>
                </div>
            </div>

            {/* 3. Faktor-Aufschlüsselung */}
            <div className="bg-white rounded-xl shadow-[0_2px_10px_rgb(0,0,0,0.04)] overflow-hidden">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
                >
                    <h3 className="font-bold text-gray-900 text-sm">Zusammensetzung deiner Punkte ({myTotalPoints.toFixed(1)})</h3>
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
                                    {myFlexCount === 0
                                        ? 'Noch keine Einsätze. Hol dir +10 Punkte für dein erstes Mal Einspringen!'
                                        : `Du bist ${myFlexCount}× eingesprungen — Team-Schnitt ${teamAvgFlex}×`}
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
                                    {myVoteStats.participated === 0
                                        ? 'Nutze Abstimmungen häufiger, um Punkte zu sammeln.'
                                        : `${myVoteStats.participated} von ${myVoteStats.eligible} Abstimmungen teilgenommen.`}
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

            {/* 4. Verlauf-Hinweis (Trend) */}
            {myTrend !== null && teamTrend !== null && (
                <div className="bg-gray-50 rounded-xl p-4 text-center flex items-center justify-center gap-3">
                    {myTrend >= teamTrend ? (
                        <TrendingUp size={24} className="text-emerald-500" />
                    ) : (
                        <Minus size={24} className="text-gray-400" />
                    )}
                    <div className="text-left">
                        <p className="text-sm text-gray-900 font-bold">Monats-Trend</p>
                        <p className="text-xs text-gray-600">
                            {myTrend >= teamTrend
                                ? `Du hast diesen Monat +${myTrend.toFixed(1)} Pkt gesammelt (Ø Team: +${teamTrend.toFixed(1)}). Top!`
                                : `Du warst diesen Monat weniger aktiv als der Team-Durchschnitt (+${teamTrend.toFixed(1)} Pkt).`}
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}
