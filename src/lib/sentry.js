/**
 * SENTRY ERROR TRACKING CONFIGURATION
 * 
 * This module initializes Sentry for error tracking and performance monitoring.
 * 
 * Setup Instructions:
 * 1. Create a project at https://sentry.io
 * 2. Copy the DSN from Project Settings > Client Keys
 * 3. Add VITE_SENTRY_DSN to your .env file
 * 
 * @see https://docs.sentry.io/platforms/javascript/guides/react/
 */

import * as Sentry from '@sentry/react'

// Environment detection
const isProduction = import.meta.env.PROD
const isDevelopment = import.meta.env.DEV

/**
 * Initialize Sentry with optimal settings for the WoBePlaner app
 */
export function initSentry() {
    // Sentry DSN - Public DSN is safe to embed (only identifies project, not credentials)
    // Can be overridden via VITE_SENTRY_DSN environment variable
    const dsn = import.meta.env.VITE_SENTRY_DSN ||
        'https://c24d5328bdff4a174c37654eb4ff6bac@o4510546030297088.ingest.de.sentry.io/4510546044125264'

    // Don't initialize in development unless explicitly enabled
    if (isDevelopment && !import.meta.env.VITE_SENTRY_ENABLED) {
        console.info('[Sentry] Development mode - Error tracking enabled for testing')
    }

    Sentry.init({
        dsn,

        // Environment and Release tracking
        environment: isProduction ? 'production' : 'development',
        release: import.meta.env.VITE_APP_VERSION || '1.0.0',

        // =========================================================
        // SAMPLING CONFIGURATION
        // =========================================================

        // Error sample rate (1.0 = 100% of errors)
        // For pre-launch testing, capture ALL errors
        sampleRate: 1.0,

        // Performance monitoring sample rate
        // 0.2 = 20% of transactions for performance monitoring
        tracesSampleRate: isProduction ? 0.2 : 1.0,

        // Session Replay - DISABLED for privacy reasons
        // The app handles sensitive employee data
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,

        // =========================================================
        // INTEGRATIONS
        // =========================================================
        integrations: [
            // Browser tracing for performance monitoring
            Sentry.browserTracingIntegration({
                // Track Supabase API calls
                tracePropagationTargets: [
                    'localhost',
                    /^https:\/\/.*\.supabase\.co/,
                    /^https:\/\/wobeplaner\.pages\.dev/,
                ],
            }),

            // React-specific error handling
            Sentry.reactRouterV6BrowserTracingIntegration({
                useEffect: true,
            }),

            // Global error handlers
            Sentry.globalHandlersIntegration({
                onerror: true,
                onunhandledrejection: true,
            }),

            // Breadcrumbs for debugging context
            Sentry.breadcrumbsIntegration({
                console: true,
                dom: true,
                fetch: true,
                history: true,
            }),
        ],

        // =========================================================
        // PRIVACY & DATA SCRUBBING (DSGVO-KONFORM)
        // =========================================================

        // Remove PII (Personally Identifiable Information)
        beforeSend(event, hint) {
            // Log in development for debugging
            if (isDevelopment) {
                console.log('[Sentry] Captured event:', event.exception?.values?.[0]?.type)
            }

            // Scrub sensitive data from the event
            if (event.user) {
                // Don't send full email, only domain
                if (event.user.email) {
                    const [, domain] = event.user.email.split('@')
                    event.user.email = `***@${domain}`
                }
                // Don't send IP address
                delete event.user.ip_address
            }

            // Scrub request data
            if (event.request) {
                // Remove cookies
                delete event.request.cookies
                // Remove headers that might contain auth tokens
                if (event.request.headers) {
                    delete event.request.headers.authorization
                    delete event.request.headers.cookie
                }
            }

            // Filter out specific error types if needed
            const errorMessage = hint?.originalException?.message || ''

            // Ignore network errors during offline mode (PWA)
            if (errorMessage.includes('Failed to fetch') && navigator.onLine === false) {
                return null // Don't send this event
            }

            return event
        },

        // Additional data scrubbing
        beforeBreadcrumb(breadcrumb) {
            // Don't log console messages in production (could contain PII)
            if (isProduction && breadcrumb.category === 'console') {
                return null
            }
            return breadcrumb
        },

        // List of strings/regex for URLs that should be ignored
        denyUrls: [
            // Chrome extensions
            /extensions\//i,
            /^chrome:\/\//i,
            // Firefox extensions
            /^moz-extension:\/\//i,
        ],

        // Ignore common non-actionable errors
        ignoreErrors: [
            // Random plugins/extensions
            'top.GLOBALS',
            // Chrome specific errors
            'ResizeObserver loop limit exceeded',
            'ResizeObserver loop completed with undelivered notifications',
            // Network errors (handled elsewhere)
            'TypeError: Failed to fetch',
            'TypeError: NetworkError',
            // Safari specific
            'TypeError: cancelled',
            // PWA specific
            'The play() request was interrupted',
        ],
    })

    console.info('[Sentry] Error tracking initialized', {
        environment: isProduction ? 'production' : 'development',
        release: import.meta.env.VITE_APP_VERSION || '1.0.0',
    })
}

// =========================================================
// UTILITY FUNCTIONS FOR MANUAL ERROR REPORTING
// =========================================================

/**
 * Capture a custom error with additional context
 * @param {Error} error - The error to capture
 * @param {Object} context - Additional context (tags, extra data)
 */
export function captureError(error, context = {}) {
    Sentry.withScope((scope) => {
        // Add tags for filtering in Sentry dashboard
        if (context.tags) {
            Object.entries(context.tags).forEach(([key, value]) => {
                scope.setTag(key, value)
            })
        }

        // Add extra data for debugging
        if (context.extra) {
            Object.entries(context.extra).forEach(([key, value]) => {
                scope.setExtra(key, value)
            })
        }

        // Set error level
        if (context.level) {
            scope.setLevel(context.level)
        }

        Sentry.captureException(error)
    })
}

/**
 * Capture a custom message (for warnings/info that aren't exceptions)
 * @param {string} message - The message to capture
 * @param {string} level - 'info', 'warning', or 'error'
 * @param {Object} context - Additional context
 */
export function captureMessage(message, level = 'info', context = {}) {
    Sentry.withScope((scope) => {
        if (context.tags) {
            Object.entries(context.tags).forEach(([key, value]) => {
                scope.setTag(key, value)
            })
        }
        if (context.extra) {
            scope.setExtras(context.extra)
        }
        Sentry.captureMessage(message, level)
    })
}

/**
 * Set user context for error tracking
 * Call this after user logs in
 * @param {Object} user - User object with id and optionally email
 */
export function setUserContext(user) {
    if (user) {
        Sentry.setUser({
            id: user.id,
            // Email is scrubbed in beforeSend, but we set it for reference
            email: user.email,
        })
    } else {
        Sentry.setUser(null)
    }
}

/**
 * Clear user context on logout
 */
export function clearUserContext() {
    Sentry.setUser(null)
}

/**
 * Add a breadcrumb for debugging context
 * @param {string} category - Category like 'navigation', 'user-action', 'api'
 * @param {string} message - Description of what happened
 * @param {Object} data - Additional data
 */
export function addBreadcrumb(category, message, data = {}) {
    Sentry.addBreadcrumb({
        category,
        message,
        data,
        level: 'info',
    })
}

/**
 * Start a performance transaction for measuring specific operations
 * @param {string} name - Transaction name
 * @param {string} op - Operation type (e.g., 'pdf.generate', 'supabase.query')
 */
export function startTransaction(name, op) {
    return Sentry.startInactiveSpan({
        name,
        op,
    })
}

// Re-export Sentry for advanced usage
export { Sentry }
