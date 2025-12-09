/**
 * Generates a SHA-256 hash from a set of time entries.
 * This is used to ensure the integrity of the data when a report is submitted.
 * 
 * @param {Array} entries - An array of time entry objects
 * @param {string} userId - The user ID (to bind the hash to the user)
 * @param {string} monthStr - The month string "YYYY-MM" (to bind the hash to the period)
 * @param {string} version - Hash algorithm version (default: 'v1')
 * @returns {Promise<string>} - The hex string of the hash
 */
export async function generateReportHash(entries, userId, monthStr, version = 'v1') {
    if (!entries || entries.length === 0) return ''

    // Future-proofing: Allow different hash versions
    switch (version) {
        case 'v1':
            return generateHashV1(entries, userId, monthStr)
        default:
            throw new Error(`Unsupported hash version: ${version}`)
    }
}

/**
 * Hash Algorithm Version 1
 * @private
 */
async function generateHashV1(entries, userId, monthStr) {
    // 1. Sort entries to ensure deterministic order
    // Sort by actual start time, fallback to entry date
    const sortedDetails = entries.map(e => {
        // Normalize fields that matter for the record
        // We only include fields that affect the "truth" of the work: times, duration, breaks.
        return {
            id: e.id, // Include ID to match specific records
            start: e.actual_start || null,
            end: e.actual_end || null,
            hours: e.calculated_hours ? Number(e.calculated_hours).toFixed(2) : '0.00',
            breaks: (e.interruptions || []).map(i => `${i.start}-${i.end}`).join('|')
        }
    }).sort((a, b) => {
        const dateA = a.start || a.id // Use ID as last resort fallback for sort stability if start is null
        const dateB = b.start || b.id
        if (dateA < dateB) return -1;
        if (dateA > dateB) return 1;
        return a.id.localeCompare(b.id);
    })

    // 2. Create a stable string representation with version metadata
    const dataString = JSON.stringify({
        meta: {
            userId,
            month: monthStr,
            version: 'v1'  // Version tracking for future compatibility
        },
        data: sortedDetails
    })

    // 3. Hash it using SHA-256
    const msgBuffer = new TextEncoder().encode(dataString)
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    return hashHex
}
