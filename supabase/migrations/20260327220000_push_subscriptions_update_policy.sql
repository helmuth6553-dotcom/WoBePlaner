-- Add missing UPDATE RLS policy on push_subscriptions
-- Without this, upsert operations (used for subscription renewal) fail silently
CREATE POLICY "Users can update own subscriptions"
ON push_subscriptions
FOR UPDATE
USING (( SELECT auth.uid() AS uid) = user_id)
WITH CHECK (( SELECT auth.uid() AS uid) = user_id);
