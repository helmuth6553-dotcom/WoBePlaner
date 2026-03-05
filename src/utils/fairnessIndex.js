/**
 * Fairness-Index Calculation for Shift Coverage
 *
 * The Fairness-Index determines who should cover an open shift.
 * Higher index = more likely to be asked (but fairer, because it means
 * the person has contributed less recently).
 *
 * Components:
 * 1. Flex-Differenz: How much less this person has covered vs team average
 * 2. Stunden-Faktor: How many minus hours the person has
 * 3. Strafpunkte: Penalty for not participating in previous votes
 */

/**
 * Calculate the Fairness-Index for a single user.
 *
 * @param {Object} params - Calculation parameters
 * @param {number} params.userFlexCount - How many times this user has covered (last 6 months)
 * @param {number} params.teamAvgFlex - Team average flex coverage count
 * @param {number} params.userBalanceHours - Current hour balance (negative = minus hours)
 * @param {number} params.missedVotes - Number of votes this user didn't participate in (last 6 months)
 * @returns {{ total: number, breakdown: Object }}
 */
export function calculateFairnessIndex({ userFlexCount, teamAvgFlex, userBalanceHours, missedVotes }) {
    // 1. Flex-Differenz: who covered less gets more points
    // Range: typically 0-10, can go negative if person covered MORE than average
    const flexDiff = (teamAvgFlex - userFlexCount) * 2

    // 2. Stunden-Faktor: more minus hours = higher index (benefits from covering)
    // Only counts negative balance, positive balance doesn't reduce index
    const hoursFactor = userBalanceHours < 0 ? Math.abs(userBalanceHours) * 0.5 : 0

    // 3. Strafpunkte: 1.5 points per missed vote
    const penalty = missedVotes * 1.5

    // Total (minimum 0)
    const total = Math.max(0, Math.round((flexDiff + hoursFactor + penalty) * 10) / 10)

    return {
        total,
        breakdown: {
            flexDiff: Math.round(flexDiff * 10) / 10,
            hoursFactor: Math.round(hoursFactor * 10) / 10,
            penalty: Math.round(penalty * 10) / 10,
            flexCount: userFlexCount,
            teamAvgFlex: Math.round(teamAvgFlex * 10) / 10,
            missedVotes,
            balanceHours: userBalanceHours,
        }
    }
}

/**
 * Calculate Fairness-Index for all eligible users.
 *
 * @param {Array} eligibleUserIds - List of user IDs who are eligible
 * @param {Array} allFlexHistory - All shift_interests with is_flex=true (last 6 months)
 * @param {Object} balances - Map of userId -> balance object { total: number }
 * @param {Array} voteHistory - All coverage_votes (last 6 months)
 * @returns {Array<{ userId: string, index: Object }>} Sorted by total descending
 */
export function calculateAllFairnessIndices(eligibleUserIds, allFlexHistory, balances, voteHistory) {
    // Calculate team average flex count
    const flexCounts = {}
    eligibleUserIds.forEach(id => { flexCounts[id] = 0 })

    allFlexHistory.forEach(entry => {
        if (flexCounts[entry.user_id] !== undefined) {
            flexCounts[entry.user_id]++
        }
    })

    const totalFlex = Object.values(flexCounts).reduce((sum, c) => sum + c, 0)
    const teamAvgFlex = eligibleUserIds.length > 0 ? totalFlex / eligibleUserIds.length : 0

    // Count missed votes per user
    const missedVoteCounts = {}
    eligibleUserIds.forEach(id => { missedVoteCounts[id] = 0 })

    voteHistory.forEach(vote => {
        if (vote.was_eligible && !vote.responded && missedVoteCounts[vote.user_id] !== undefined) {
            missedVoteCounts[vote.user_id]++
        }
    })

    // Calculate index for each user
    const results = eligibleUserIds.map(userId => {
        const userFlexCount = flexCounts[userId] || 0
        const userBalance = balances[userId]
        const userBalanceHours = userBalance?.total || 0
        const missedVotes = missedVoteCounts[userId] || 0

        const index = calculateFairnessIndex({
            userFlexCount,
            teamAvgFlex,
            userBalanceHours,
            missedVotes,
        })

        return { userId, index }
    })

    // Sort by total descending (highest index first = most "deserving" to be asked)
    results.sort((a, b) => b.index.total - a.index.total)

    return results
}

/**
 * Get a human-readable breakdown for display in the UI.
 *
 * @param {Object} breakdown - The breakdown object from calculateFairnessIndex
 * @returns {Array<{ label: string, detail: string, points: string }>}
 */
export function getReadableBreakdown(breakdown) {
    const items = []

    items.push({
        label: 'Flex-Einsätze (6 Monate)',
        detail: `Du: ${breakdown.flexCount}× | Team-Ø: ${breakdown.teamAvgFlex}×`,
        points: `${breakdown.flexDiff >= 0 ? '+' : ''}${breakdown.flexDiff}`,
    })

    items.push({
        label: 'Stundensaldo',
        detail: `Aktuell: ${breakdown.balanceHours >= 0 ? '+' : ''}${breakdown.balanceHours}h`,
        points: `+${breakdown.hoursFactor}`,
    })

    if (breakdown.missedVotes > 0) {
        items.push({
            label: 'Verpasste Abstimmungen',
            detail: `${breakdown.missedVotes}× nicht teilgenommen`,
            points: `+${breakdown.penalty}`,
        })
    }

    return items
}
