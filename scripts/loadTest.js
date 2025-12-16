/**
 * Load Testing Script for WoBePlaner
 * 
 * Tests the application's ability to handle concurrent users.
 * 
 * Usage: 
 *   node scripts/loadTest.js
 * 
 * Configuration:
 *   - CONCURRENT_USERS: Number of simultaneous requests
 *   - REQUESTS_PER_USER: Requests each simulated user makes
 *   - API_DELAY_MS: Delay between requests
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ivushmxpmymbqvryxhgf.supabase.co'
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2dXNobXhwbXltYnF2cnl4aGdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzIzNzE3MTIsImV4cCI6MjA0Nzk0NzcxMn0.VsrPD_edHn2L9vF-LL4sMN_sGVNT_S2GufQdhZeIIBA'

// Configuration
const CONFIG = {
    CONCURRENT_USERS: 20,        // Simulate 20 concurrent users
    REQUESTS_PER_USER: 5,        // Each user makes 5 requests
    API_DELAY_MS: 100,           // 100ms between requests per user
    TIMEOUT_MS: 10000            // 10 second timeout
}

// Results storage
const results = {
    total: 0,
    successful: 0,
    failed: 0,
    timeouts: 0,
    responseTimes: [],
    errors: []
}

// Simulated API endpoints to test (read-only, no auth required for anon)
const ENDPOINTS = [
    { name: 'Health Check', path: '/rest/v1/', method: 'GET' },
    { name: 'Profiles Schema', path: '/rest/v1/profiles?select=id&limit=1', method: 'GET' },
    { name: 'Shifts Schema', path: '/rest/v1/shifts?select=id&limit=1', method: 'GET' },
    { name: 'Absences Schema', path: '/rest/v1/absences?select=id&limit=1', method: 'GET' },
]

// Make a single API request
async function makeRequest(endpoint) {
    const startTime = Date.now()
    const url = `${SUPABASE_URL}${endpoint.path}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS)

    try {
        const response = await fetch(url, {
            method: endpoint.method,
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            signal: controller.signal
        })

        clearTimeout(timeout)
        const responseTime = Date.now() - startTime

        return {
            success: response.ok,
            status: response.status,
            responseTime,
            endpoint: endpoint.name
        }
    } catch (error) {
        clearTimeout(timeout)
        const responseTime = Date.now() - startTime

        if (error.name === 'AbortError') {
            return { success: false, timeout: true, responseTime, endpoint: endpoint.name }
        }

        return {
            success: false,
            error: error.message,
            responseTime,
            endpoint: endpoint.name
        }
    }
}

// Simulate a single user session
async function simulateUser(userId) {
    const userResults = []

    for (let i = 0; i < CONFIG.REQUESTS_PER_USER; i++) {
        // Pick a random endpoint
        const endpoint = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)]
        const result = await makeRequest(endpoint)

        userResults.push({
            userId,
            requestNum: i + 1,
            ...result
        })

        // Small delay between requests
        if (CONFIG.API_DELAY_MS > 0) {
            await new Promise(r => setTimeout(r, CONFIG.API_DELAY_MS))
        }
    }

    return userResults
}

// Run the load test
async function runLoadTest() {
    console.log('\n🔄 WoBePlaner Load Test')
    console.log('========================')
    console.log(`📊 Config:`)
    console.log(`   - Concurrent Users: ${CONFIG.CONCURRENT_USERS}`)
    console.log(`   - Requests per User: ${CONFIG.REQUESTS_PER_USER}`)
    console.log(`   - Total Requests: ${CONFIG.CONCURRENT_USERS * CONFIG.REQUESTS_PER_USER}`)
    console.log(`   - API Delay: ${CONFIG.API_DELAY_MS}ms`)
    console.log(`   - Timeout: ${CONFIG.TIMEOUT_MS}ms`)
    console.log('')

    const startTime = Date.now()

    // Create user simulation promises
    const userPromises = []
    for (let i = 0; i < CONFIG.CONCURRENT_USERS; i++) {
        userPromises.push(simulateUser(i + 1))
    }

    console.log(`🚀 Starting ${CONFIG.CONCURRENT_USERS} concurrent users...`)

    // Execute all users concurrently
    const allResults = await Promise.all(userPromises)

    // Flatten and process results
    const flatResults = allResults.flat()

    flatResults.forEach(result => {
        results.total++
        results.responseTimes.push(result.responseTime)

        if (result.success) {
            results.successful++
        } else if (result.timeout) {
            results.timeouts++
            results.failed++
        } else {
            results.failed++
            if (result.error) {
                results.errors.push(result.error)
            }
        }
    })

    const totalTime = Date.now() - startTime

    // Calculate statistics
    const avgResponseTime = results.responseTimes.reduce((a, b) => a + b, 0) / results.responseTimes.length
    const minResponseTime = Math.min(...results.responseTimes)
    const maxResponseTime = Math.max(...results.responseTimes)
    const sortedTimes = [...results.responseTimes].sort((a, b) => a - b)
    const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)]
    const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)]
    const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)]
    const requestsPerSecond = (results.total / (totalTime / 1000)).toFixed(2)
    const successRate = ((results.successful / results.total) * 100).toFixed(1)

    // Print results
    console.log('\n📈 Load Test Results')
    console.log('====================')
    console.log('')
    console.log('📊 Request Statistics:')
    console.log(`   Total Requests:    ${results.total}`)
    console.log(`   ✅ Successful:     ${results.successful} (${successRate}%)`)
    console.log(`   ❌ Failed:         ${results.failed}`)
    console.log(`   ⏱️  Timeouts:       ${results.timeouts}`)
    console.log('')
    console.log('⚡ Performance:')
    console.log(`   Total Time:        ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`)
    console.log(`   Requests/sec:      ${requestsPerSecond}`)
    console.log('')
    console.log('📏 Response Times:')
    console.log(`   Min:               ${minResponseTime}ms`)
    console.log(`   Max:               ${maxResponseTime}ms`)
    console.log(`   Average:           ${avgResponseTime.toFixed(0)}ms`)
    console.log(`   P50 (Median):      ${p50}ms`)
    console.log(`   P95:               ${p95}ms`)
    console.log(`   P99:               ${p99}ms`)
    console.log('')

    // Performance assessment
    console.log('🎯 Assessment:')
    if (successRate >= 99 && p95 < 500) {
        console.log('   ✅ EXCELLENT - Ready for production')
    } else if (successRate >= 95 && p95 < 1000) {
        console.log('   ✅ GOOD - Acceptable performance')
    } else if (successRate >= 90 && p95 < 2000) {
        console.log('   ⚠️  FAIR - May need optimization')
    } else {
        console.log('   ❌ POOR - Needs significant improvement')
    }

    if (results.errors.length > 0) {
        console.log('')
        console.log('🔴 Unique Errors:')
        const uniqueErrors = [...new Set(results.errors)]
        uniqueErrors.forEach(e => console.log(`   - ${e}`))
    }

    console.log('')
    console.log('========================')
    console.log('Load test complete!')
    console.log('')

    // Return results for programmatic use
    return {
        config: CONFIG,
        results: {
            total: results.total,
            successful: results.successful,
            failed: results.failed,
            timeouts: results.timeouts,
            successRate: parseFloat(successRate),
            requestsPerSecond: parseFloat(requestsPerSecond),
            responseTimes: {
                min: minResponseTime,
                max: maxResponseTime,
                avg: Math.round(avgResponseTime),
                p50,
                p95,
                p99
            }
        },
        totalTime
    }
}

// Run if executed directly
if (typeof require !== 'undefined' && require.main === module) {
    runLoadTest().catch(console.error)
} else {
    // ES Module execution
    runLoadTest().catch(console.error)
}

export { runLoadTest, CONFIG }
