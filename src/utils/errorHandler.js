/**
 * Error Handler Utility
 * 
 * Centralized error handling for the WoBePlaner app.
 * Provides user-friendly error messages and integrates with Sentry.
 */

import { captureError, addBreadcrumb } from '../lib/sentry'

// Error types for categorization
export const ErrorTypes = {
    NETWORK: 'NETWORK',
    AUTH: 'AUTH',
    VALIDATION: 'VALIDATION',
    PERMISSION: 'PERMISSION',
    NOT_FOUND: 'NOT_FOUND',
    SERVER: 'SERVER',
    TIMEOUT: 'TIMEOUT',
    UNKNOWN: 'UNKNOWN'
}

// User-friendly error messages (German)
const ErrorMessages = {
    [ErrorTypes.NETWORK]: {
        title: 'Verbindungsproblem',
        message: 'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.',
        action: 'Nochmal versuchen'
    },
    [ErrorTypes.AUTH]: {
        title: 'Anmeldung erforderlich',
        message: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
        action: 'Zur Anmeldung'
    },
    [ErrorTypes.VALIDATION]: {
        title: 'Ungültige Eingabe',
        message: 'Bitte überprüfe deine Eingaben.',
        action: 'Korrigieren'
    },
    [ErrorTypes.PERMISSION]: {
        title: 'Keine Berechtigung',
        message: 'Du hast keine Berechtigung für diese Aktion.',
        action: 'Schließen'
    },
    [ErrorTypes.NOT_FOUND]: {
        title: 'Nicht gefunden',
        message: 'Die angeforderten Daten wurden nicht gefunden.',
        action: 'Zurück'
    },
    [ErrorTypes.SERVER]: {
        title: 'Serverfehler',
        message: 'Ein Fehler ist aufgetreten. Unser Team wurde benachrichtigt.',
        action: 'Später versuchen'
    },
    [ErrorTypes.TIMEOUT]: {
        title: 'Zeitüberschreitung',
        message: 'Die Anfrage hat zu lange gedauert. Bitte versuche es erneut.',
        action: 'Nochmal versuchen'
    },
    [ErrorTypes.UNKNOWN]: {
        title: 'Unbekannter Fehler',
        message: 'Ein unerwarteter Fehler ist aufgetreten.',
        action: 'Schließen'
    }
}

/**
 * Categorize an error based on its properties
 */
export function categorizeError(error) {
    if (!error) return ErrorTypes.UNKNOWN

    const message = error.message?.toLowerCase() || ''
    const code = error.code?.toLowerCase() || ''

    // Network errors
    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
        return ErrorTypes.NETWORK
    }

    // Auth/JWT errors
    if (code.includes('pgrst301') || message.includes('jwt') || message.includes('token') || message.includes('expired')) {
        return ErrorTypes.AUTH
    }

    // Timeout
    if (message.includes('timeout') || code.includes('timeout')) {
        return ErrorTypes.TIMEOUT
    }

    // Permission/RLS errors
    if (code.includes('42501') || message.includes('permission') || message.includes('policy')) {
        return ErrorTypes.PERMISSION
    }

    // Not found / Empty result
    if (code.includes('pgrst116') || message.includes('not found') || message.includes('0 rows')) {
        return ErrorTypes.NOT_FOUND
    }

    // Validation errors
    if (code.includes('23') || message.includes('validation') || message.includes('invalid')) {
        return ErrorTypes.VALIDATION
    }

    // Server errors (5xx)
    if (code.startsWith('5') || message.includes('server error')) {
        return ErrorTypes.SERVER
    }

    return ErrorTypes.UNKNOWN
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlyError(error) {
    const type = categorizeError(error)
    const template = ErrorMessages[type]

    return {
        type,
        title: template.title,
        message: error.details || template.message,
        action: template.action,
        originalError: error
    }
}

/**
 * Handle and log an error
 * Returns a user-friendly error object
 */
export function handleError(error, context = {}) {
    // Add breadcrumb for Sentry
    addBreadcrumb({
        category: 'error',
        message: `Error in ${context.component || 'unknown'}`,
        level: 'error',
        data: {
            errorMessage: error?.message,
            errorCode: error?.code,
            ...context
        }
    })

    // Get user-friendly error
    const friendlyError = getUserFriendlyError(error)

    // Log to console in development
    if (import.meta.env.DEV) {
        console.group(`🔴 Error: ${friendlyError.title}`)
        console.error('Original:', error)
        console.log('Context:', context)
        console.log('Friendly:', friendlyError)
        console.groupEnd()
    }

    // Send critical errors to Sentry
    if (friendlyError.type !== ErrorTypes.NOT_FOUND && friendlyError.type !== ErrorTypes.VALIDATION) {
        captureError(error, {
            extra: {
                friendlyMessage: friendlyError.message,
                errorType: friendlyError.type,
                ...context
            }
        })
    }

    return friendlyError
}

/**
 * Wrapper for async operations with automatic error handling
 */
export async function withErrorHandling(operation, context = {}) {
    try {
        return await operation()
    } catch (error) {
        return {
            error: handleError(error, context),
            data: null
        }
    }
}

/**
 * Retry an operation with exponential backoff
 */
export async function withRetry(operation, options = {}) {
    const { maxRetries = 3, baseDelay = 100, onRetry = null } = options

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation()
        } catch (error) {
            if (attempt === maxRetries) {
                throw error
            }

            const delay = baseDelay * Math.pow(2, attempt - 1)

            if (onRetry) {
                onRetry({ attempt, maxRetries, delay, error })
            }

            await new Promise(resolve => setTimeout(resolve, delay))
        }
    }
}

/**
 * Check if an error is recoverable (should retry)
 */
export function isRecoverableError(error) {
    const type = categorizeError(error)

    // Network and timeout errors are usually temporary
    return type === ErrorTypes.NETWORK || type === ErrorTypes.TIMEOUT
}

/**
 * Format Supabase error for display
 */
export function formatSupabaseError(error) {
    if (!error) return null

    // Supabase-specific error handling
    if (error.code === 'PGRST116') {
        return null // Not really an error, just empty result
    }

    if (error.code === '23505') {
        return 'Dieser Eintrag existiert bereits.'
    }

    if (error.code === '23503') {
        return 'Dieser Eintrag wird noch verwendet und kann nicht gelöscht werden.'
    }

    if (error.code === '42501') {
        return 'Du hast keine Berechtigung für diese Aktion.'
    }

    // Default to the error message or a generic one
    return error.message || 'Ein Fehler ist aufgetreten.'
}

export default {
    ErrorTypes,
    categorizeError,
    getUserFriendlyError,
    handleError,
    withErrorHandling,
    withRetry,
    isRecoverableError,
    formatSupabaseError
}
