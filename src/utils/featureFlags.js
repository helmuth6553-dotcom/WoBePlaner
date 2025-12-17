/**
 * Feature Flags for WoBePlaner
 * 
 * These flags control which features are active.
 * Used for safe rollout of major changes like Multi-Tenancy.
 * 
 * SAFETY: Set any flag to false in .env to immediately disable a feature
 */

/**
 * Multi-Tenancy Feature Flag
 * 
 * When TRUE:
 *   - Shifts are loaded from `shift_templates` table in Supabase
 *   - Teams are supported (team_id filtering)
 *   - Admin can manage shift templates via UI
 * 
 * When FALSE (default, safe mode):
 *   - Shifts use legacy `shiftDefaults.js` definitions
 *   - Single team mode
 *   - No shift template management
 */
export const FEATURE_MULTI_TENANCY = import.meta.env.VITE_FEATURE_MULTI_TENANCY === 'true'

/**
 * Helper to check if a feature is enabled
 * Usage: if (isFeatureEnabled('MULTI_TENANCY')) { ... }
 */
export function isFeatureEnabled(featureName) {
    switch (featureName) {
        case 'MULTI_TENANCY':
            return FEATURE_MULTI_TENANCY
        default:
            console.warn(`Unknown feature flag: ${featureName}`)
            return false
    }
}

/**
 * Log active features on app startup (for debugging)
 */
export function logActiveFeatures() {
    console.group('🚩 Feature Flags')
    console.log(`MULTI_TENANCY: ${FEATURE_MULTI_TENANCY ? '✅ ON' : '❌ OFF'}`)
    console.groupEnd()
}
