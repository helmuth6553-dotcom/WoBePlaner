/**
 * Soli-Punkte Calculation for Shift Coverage
 *
 * Soli-Punkte measure how much a person has contributed to team coverage.
 * Higher score = has contributed more (covered shifts, participated in votes).
 * The greedy algorithm assigns shifts to the person with the LOWEST Soli-Punkte
 * (who has contributed the least and should cover next).
 *
 * Components:
 * 1. Flex-Einsätze: How often this person has covered (last 6 months)
 * 2. Abstimmungs-Teilnahme: How often this person participated in coverage votes
 */

/**
 * Calculate Soli-Punkte for a single user.
 *
 * @param {Object} params - Calculation parameters
 * @param {number} params.userFlexCount - How many times this user has covered (last 6 months)
 * @param {number} params.participatedVotes - Number of votes this user participated in (last 6 months)
 * @returns {{ total: number, breakdown: Object }}
 */
export function calculateFairnessIndex({ userFlexCount, participatedVotes }) {
    // 1. Flex-Einsätze: each coverage = +10 Soli-Punkte
    const flexComponent = userFlexCount * 10

    // 2. Abstimmungs-Teilnahme: each participated vote = +2 Soli-Punkte
    const participationBonus = participatedVotes * 2

    const total = Math.round((flexComponent + participationBonus) * 10) / 10

    return {
        total,
        breakdown: {
            flexComponent: Math.round(flexComponent * 10) / 10,
            participationBonus: Math.round(participationBonus * 10) / 10,
            flexCount: userFlexCount,
            participatedVotes,
        }
    }
}

/**
 * Calculate Soli-Punkte for all eligible users.
 *
 * @param {Array} eligibleUserIds - List of user IDs who are eligible
 * @param {Array} allFlexHistory - All shift_interests with is_flex=true (last 6 months)
 * @param {Array} voteHistory - All coverage_votes (last 6 months)
 * @returns {Array<{ userId: string, index: Object }>} Sorted by total ascending (lowest Soli-Punkte first)
 */
export function calculateAllFairnessIndices(eligibleUserIds, allFlexHistory, voteHistory) {
    // Count flex coverages per user
    const flexCounts = {}
    eligibleUserIds.forEach(id => { flexCounts[id] = 0 })

    allFlexHistory.forEach(entry => {
        if (flexCounts[entry.user_id] !== undefined) {
            flexCounts[entry.user_id]++
        }
    })

    // Count participated votes per user
    const participatedVoteCounts = {}
    eligibleUserIds.forEach(id => { participatedVoteCounts[id] = 0 })

    voteHistory.forEach(vote => {
        if (vote.was_eligible && vote.responded && participatedVoteCounts[vote.user_id] !== undefined) {
            participatedVoteCounts[vote.user_id]++
        }
    })

    // Calculate Soli-Punkte for each user
    const results = eligibleUserIds.map(userId => {
        const userFlexCount = flexCounts[userId] || 0
        const participatedVotes = participatedVoteCounts[userId] || 0

        const index = calculateFairnessIndex({
            userFlexCount,
            participatedVotes,
        })

        return { userId, index }
    })

    // Sort descending (highest Soli-Punkte first = contributed most = rank 1)
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
        detail: `${breakdown.flexCount}× eingesprungen`,
        points: `+${breakdown.flexComponent}`,
    })

    items.push({
        label: 'Abstimmungs-Teilnahme (6 Monate)',
        detail: `${breakdown.participatedVotes}× abgestimmt`,
        points: `+${breakdown.participationBonus}`,
    })

    return items
}
