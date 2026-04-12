-- Calendar sync tokens for iCal subscription URLs
CREATE TABLE calendar_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    token       UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active   BOOLEAN NOT NULL DEFAULT true
);

-- Max one active token per user
CREATE UNIQUE INDEX calendar_tokens_active_user
    ON calendar_tokens (user_id) WHERE is_active = true;

-- Fast lookup by token for Edge Function
CREATE INDEX calendar_tokens_token_lookup
    ON calendar_tokens (token) WHERE is_active = true;

ALTER TABLE calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_tokens_select_own" ON calendar_tokens
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY "calendar_tokens_insert_own" ON calendar_tokens
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "calendar_tokens_update_own" ON calendar_tokens
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()));
