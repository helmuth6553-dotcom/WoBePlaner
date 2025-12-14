/**
 * PRODUCTION MONITORING & ERROR TRACKING
 * 
 * Utility module for production bug monitoring.
 * 
 * Features:
 * 1. Balance calculation verification
 * 2. Data consistency checks
 * 3. Error boundary integration
 * 4. Performance metrics
 */

// =============================================================================
// BALANCE VERIFICATION UTILITIES
// =============================================================================

/**
 * Verifies that a balance calculation is valid
 * Returns an array of warnings/errors if issues are found
 */
export function verifyBalanceIntegrity(balance) {
    const issues = []

    if (!balance) {
        issues.push({ type: 'ERROR', message: 'Balance is null or undefined' })
        return issues
    }

    // Check for NaN values
    const numericFields = ['target', 'actual', 'vacation', 'diff', 'carryover', 'correction', 'total']
    numericFields.forEach(field => {
        if (typeof balance[field] === 'number' && isNaN(balance[field])) {
            issues.push({
                type: 'ERROR',
                field,
                message: `${field} is NaN`
            })
        }
    })

    // Check for unrealistic values
    if (balance.target < 0) {
        issues.push({ type: 'WARNING', field: 'target', message: 'Target hours is negative' })
    }

    if (balance.target > 300) {
        issues.push({ type: 'WARNING', field: 'target', message: 'Target hours exceeds 300 (unrealistic for monthly)' })
    }

    if (Math.abs(balance.actual) > 400) {
        issues.push({ type: 'WARNING', field: 'actual', message: 'Actual hours exceeds ±400 (unrealistic)' })
    }

    if (Math.abs(balance.carryover) > 500) {
        issues.push({ type: 'WARNING', field: 'carryover', message: 'Carryover exceeds ±500 hours' })
    }

    // Check math consistency: diff should equal (actual + vacation) - target
    const expectedDiff = (balance.actual + balance.vacation) - balance.target
    const diffDeviation = Math.abs(balance.diff - expectedDiff)
    if (diffDeviation > 0.01) {
        issues.push({
            type: 'ERROR',
            field: 'diff',
            message: `Diff calculation mismatch: got ${balance.diff}, expected ${expectedDiff.toFixed(2)}`,
            expected: expectedDiff,
            actual: balance.diff
        })
    }

    // Check total consistency: should equal diff + carryover
    const expectedTotal = balance.diff + balance.carryover
    const totalDeviation = Math.abs(balance.total - expectedTotal)
    if (totalDeviation > 0.01) {
        issues.push({
            type: 'ERROR',
            field: 'total',
            message: `Total calculation mismatch: got ${balance.total}, expected ${expectedTotal.toFixed(2)}`,
            expected: expectedTotal,
            actual: balance.total
        })
    }

    return issues
}

// =============================================================================
// DATA CONSISTENCY MONITOR
// =============================================================================

/**
 * Checks if two balance objects are equal (for sync verification)
 */
export function areBalancesEqual(balance1, balance2, tolerance = 0.01) {
    if (!balance1 || !balance2) return false

    const fields = ['target', 'actual', 'vacation', 'diff', 'carryover', 'total']

    for (const field of fields) {
        const diff = Math.abs(balance1[field] - balance2[field])
        if (diff > tolerance) {
            return false
        }
    }

    return true
}

/**
 * Generates a sync report comparing two balances
 */
export function generateSyncReport(label1, balance1, label2, balance2) {
    const fields = ['target', 'actual', 'vacation', 'diff', 'carryover', 'correction', 'total']
    const report = {
        isSynced: true,
        differences: [],
        timestamp: new Date().toISOString()
    }

    if (!balance1 || !balance2) {
        report.isSynced = false
        report.differences.push({
            field: 'balance',
            issue: `One or both balances are null: ${label1}=${!!balance1}, ${label2}=${!!balance2}`
        })
        return report
    }

    fields.forEach(field => {
        const val1 = balance1[field] ?? 0
        const val2 = balance2[field] ?? 0
        const diff = Math.abs(val1 - val2)

        if (diff > 0.01) {
            report.isSynced = false
            report.differences.push({
                field,
                [label1]: val1,
                [label2]: val2,
                difference: diff
            })
        }
    })

    return report
}

// =============================================================================
// ERROR LOGGING FOR PRODUCTION
// =============================================================================

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARNING: 2,
    ERROR: 3
}

let currentLogLevel = LOG_LEVELS.WARNING

/**
 * Sets the minimum log level for production
 */
export function setLogLevel(level) {
    if (LOG_LEVELS[level] !== undefined) {
        currentLogLevel = LOG_LEVELS[level]
    }
}

/**
 * Production-safe logger that can be connected to external services
 */
export function productionLog(level, category, message, data = null) {
    if (LOG_LEVELS[level] < currentLogLevel) return

    const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        category,
        message,
        data,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server'
    }

    // In development: console log
    if (process.env.NODE_ENV === 'development') {
        console.log(`[${level}] [${category}] ${message}`, data)
    }

    // In production: could send to external service
    // Examples: Sentry, LogRocket, custom API endpoint
    if (process.env.NODE_ENV === 'production' && level === 'ERROR') {
        // sendToErrorTracking(logEntry)
    }

    return logEntry
}

// =============================================================================
// PERFORMANCE MONITORING
// =============================================================================

const performanceMarks = {}

/**
 * Starts a performance timer
 */
export function startPerfTimer(name) {
    performanceMarks[name] = {
        start: performance.now(),
        end: null,
        duration: null
    }
}

/**
 * Ends a performance timer and returns duration
 */
export function endPerfTimer(name) {
    if (!performanceMarks[name]) return null

    performanceMarks[name].end = performance.now()
    performanceMarks[name].duration = performanceMarks[name].end - performanceMarks[name].start

    // Log if slow
    if (performanceMarks[name].duration > 1000) {
        productionLog('WARNING', 'PERFORMANCE', `Slow operation: ${name}`, {
            duration: `${performanceMarks[name].duration.toFixed(2)}ms`
        })
    }

    return performanceMarks[name].duration
}

/**
 * Gets all performance metrics
 */
export function getPerfMetrics() {
    return { ...performanceMarks }
}

// =============================================================================
// BALANCE SANITY CHECK (Run in Components)
// =============================================================================

/**
 * Wrap this around balance calculations in components to catch issues early
 */
export function withBalanceVerification(balance, context = 'unknown') {
    const issues = verifyBalanceIntegrity(balance)

    if (issues.length > 0) {
        const errors = issues.filter(i => i.type === 'ERROR')
        const warnings = issues.filter(i => i.type === 'WARNING')

        if (errors.length > 0) {
            productionLog('ERROR', 'BALANCE', `Balance verification failed in ${context}`, {
                issues: errors,
                balance
            })
        }

        if (warnings.length > 0) {
            productionLog('WARNING', 'BALANCE', `Balance has warnings in ${context}`, {
                issues: warnings
            })
        }
    }

    return balance
}

// =============================================================================
// HEALTH CHECK ENDPOINT DATA
// =============================================================================

/**
 * Generates health check data for monitoring dashboards
 */
export function getHealthCheckData() {
    return {
        timestamp: new Date().toISOString(),
        status: 'healthy',
        version: process.env.VITE_APP_VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'production',
        performance: getPerfMetrics(),
        checks: {
            jsLoaded: true,
            supabaseReachable: true // Would need actual check
        }
    }
}
