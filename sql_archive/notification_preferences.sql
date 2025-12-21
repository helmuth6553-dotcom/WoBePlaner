-- =====================================================
-- Notification Preferences Schema
-- Created: 2025-12-21
-- Purpose: Store user preferences for push notifications
-- =====================================================

-- 1. Create notification_preferences table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
    
    -- Notification Types (all enabled by default)
    shift_reminder BOOLEAN DEFAULT true,      -- 15 min before shift
    monthly_closing BOOLEAN DEFAULT true,     -- Last day of month reminder
    sick_alert BOOLEAN DEFAULT true,          -- Colleague sick, shift available
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id 
ON public.notification_preferences(user_id);

-- 3. Enable Row Level Security
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies: Users can only manage their own preferences
CREATE POLICY "Users can read own notification preferences" 
ON public.notification_preferences FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own notification preferences" 
ON public.notification_preferences FOR INSERT 
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own notification preferences" 
ON public.notification_preferences FOR UPDATE 
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own notification preferences" 
ON public.notification_preferences FOR DELETE 
USING (user_id = auth.uid());

-- 5. Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_preferences_updated_at
    BEFORE UPDATE ON public.notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_preferences_updated_at();

-- 6. Verification
SELECT 'notification_preferences table created successfully' as status;
