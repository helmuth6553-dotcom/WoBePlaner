-- =========================================================
-- VIEW ADMIN AUDIT LOG
-- Shows a readable list of all administrative actions
-- =========================================================

SELECT 
    -- Timestamp format (e.g. 07.12. 21:05)
    to_char(aa.created_at AT TIME ZONE 'Europe/Berlin', 'DD.MM. HH24:MI') as zeit,
    
    -- Admin Name
    p_admin.full_name as admin,
    
    -- Action Type
    aa.action,
    
    -- Target User Name
    p_target.full_name as mitarbeiter,
    
    -- Changes (readable JSON)
    aa.changes
    
FROM admin_actions aa
LEFT JOIN profiles p_admin ON aa.admin_id = p_admin.id
LEFT JOIN profiles p_target ON aa.target_user_id = p_target.id
ORDER BY aa.created_at DESC;
