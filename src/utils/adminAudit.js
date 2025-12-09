/**
 * Admin Audit Log Utility
 * Tracks all administrative actions for compliance and security
 */

import { supabase } from '../supabase'

/**
 * Log an administrative action
 * @param {string} action - Action type (e.g., 'approve_report', 'edit_entry')
 * @param {string} targetUserId - User affected by the action
 * @param {string} resourceType - Type of resource ('monthly_report', 'time_entry', etc.)
 * @param {string} resourceId - ID of the affected resource
 * @param {object} changes - Details of what changed { before: {...}, after: {...} }
 * @param {object} metadata - Additional context (optional)
 * @returns {Promise<void>}
 */
export async function logAdminAction(action, targetUserId, resourceType, resourceId, changes = null, metadata = {}) {
    try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            console.warn('Cannot log admin action: No authenticated user')
            return
        }

        await supabase.from('admin_actions').insert({
            admin_id: user.id,
            action,
            target_user_id: targetUserId,
            target_resource_type: resourceType,
            target_resource_id: resourceId,
            changes,
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent
            }
        })
    } catch (error) {
        // Don't break the app if logging fails
        console.error('Failed to log admin action:', error)
    }
}

/**
 * Get audit log for a user
 * @param {string} userId - User ID to get logs for
 * @param {number} limit - Maximum number of records (default: 50)
 * @returns {Promise<Array>}
 */
export async function getAuditLog(userId, limit = 50) {
    const { data, error } = await supabase
        .from('admin_actions')
        .select(`
            *,
            admin:profiles!admin_id(full_name, email),
            target_user:profiles!target_user_id(full_name, email)
        `)
        .eq('target_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        console.error('Failed to fetch audit log:', error)
        return []
    }

    return data || []
}

/**
 * Get recent admin actions (for admin dashboard)
 * @param {number} limit - Maximum number of records (default: 100)
 * @returns {Promise<Array>}
 */
export async function getRecentAdminActions(limit = 100) {
    const { data, error } = await supabase
        .from('admin_actions')
        .select(`
            *,
            admin:profiles!admin_id(full_name, email),
            target_user:profiles!target_user_id(full_name, email)
        `)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        console.error('Failed to fetch admin actions:', error)
        return []
    }

    return data || []
}
