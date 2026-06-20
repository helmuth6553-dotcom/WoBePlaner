-- =====================================================
-- Migration: Autorisierungs-Checks in SECURITY DEFINER RPC-Funktionen
-- Datum: 2026-06-20
-- Zweck: Vibe-Pentest (Muster #4 / BOLA) + get_advisors haben 3 RPC-
--        Funktionen aufgedeckt, die RLS via SECURITY DEFINER umgehen,
--        aber KEINEN internen Autorisierungs-Check haben. Jeder
--        eingeloggte User (authenticated) konnte sie direkt via
--        /rest/v1/rpc/... aufrufen. Selbe Klasse wie #219.
--
--   1. assign_coverage      — jeder konnte beliebigen Dienst beliebigem
--                             User zuweisen. Fix: Admin -> jeden, sonst
--                             nur sich selbst (deckt Self-Takeover ab).
--   2. create_signed_absence — fremde user_id, freier status (Self-Approval)
--                             und faelschbare Signatur (signer_id/role).
--                             Fix: user_id/signer_id an auth.uid() binden,
--                             signatures.role server-seitig auf 'applicant'
--                             (Signaturrolle, nicht System-Rolle), Non-Admin
--                             auf status='beantragt'.
--   3. mark_shifts_urgent   — jeder konnte beliebige Dienste "dringend"
--                             markieren (-> Push-Spam). Fix: Admin -> alle,
--                             sonst nur eigene (via shift_interests).
--
-- Hinweis: Die get_advisors-WARN
-- (authenticated_security_definer_function_executable) bleibt bestehen,
-- da die Funktionen weiterhin SECURITY DEFINER + aufrufbar sein MUESSEN.
-- Die Absicherung erfolgt jetzt korrekt im Funktionsbody.
-- =====================================================

-- 1. assign_coverage: Admin darf jeden zuweisen, Nicht-Admin nur sich selbst
CREATE OR REPLACE FUNCTION public.assign_coverage(p_shift_id integer, p_user_id uuid, p_resolved_by uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    -- Authorization: admins may assign anyone; everyone else only themselves
    IF NOT public.is_admin() THEN
        IF p_user_id <> auth.uid() THEN
            RAISE EXCEPTION 'Not authorized: you may only assign yourself to a shift';
        END IF;
        -- Non-admins cannot spoof who resolved the request (audit trail)
        p_resolved_by := auth.uid();
    END IF;

    -- 1. Create or update the shift interest (marks the shift as taken)
    INSERT INTO public.shift_interests (shift_id, user_id, is_flex)
    VALUES (p_shift_id, p_user_id, true)
    ON CONFLICT (shift_id, user_id) DO UPDATE SET is_flex = true;

    -- 2. Mark the coverage request as assigned
    UPDATE public.coverage_requests
    SET status = 'assigned',
        assigned_to = p_user_id,
        resolved_by = p_resolved_by,
        resolved_at = now()
    WHERE shift_id = p_shift_id;
END;
$function$;

-- 2. mark_shifts_urgent: Admin darf alle, Nicht-Admin nur eigene Dienste
CREATE OR REPLACE FUNCTION public.mark_shifts_urgent(p_shift_ids bigint[], p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Authorization: admins may mark any shift; everyone else only shifts
    -- they are actually signed up for (via shift_interests).
    IF NOT public.is_admin() THEN
        IF EXISTS (
            SELECT 1 FROM unnest(p_shift_ids) AS sid
            WHERE NOT EXISTS (
                SELECT 1 FROM shift_interests si
                WHERE si.shift_id = sid AND si.user_id = auth.uid()
            )
        ) THEN
            RAISE EXCEPTION 'Not authorized: you may only mark your own shifts urgent';
        END IF;
    END IF;

    UPDATE shifts
    SET urgent_since = NOW()
    WHERE id = ANY(p_shift_ids);
END;
$function$;

-- 3. create_signed_absence: Identitaet server-seitig binden, Signatur nicht faelschbar
CREATE OR REPLACE FUNCTION public.create_signed_absence(p_absence_data jsonb, p_signature_data jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_absence_id bigint;
  v_uid uuid := auth.uid();
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Non-admins may never self-approve: force status to 'beantragt'
  IF public.is_admin() THEN
    v_status := COALESCE(p_absence_data->>'status', 'beantragt');
  ELSE
    v_status := 'beantragt';
  END IF;

  -- Step 1: insert absence. user_id is bound to the authenticated caller,
  -- NOT taken from the client payload (prevents creating absences for others).
  INSERT INTO absences (user_id, start_date, end_date, type, status, data_hash)
  VALUES (
    v_uid,
    (p_absence_data->>'start_date')::date,
    (p_absence_data->>'end_date')::date,
    p_absence_data->>'type',
    v_status,
    p_signature_data->>'hash'
  )
  RETURNING id INTO v_absence_id;

  -- Step 2: insert signature. signer_id comes from the server (not the client).
  -- role is the SEMANTIC signing role 'applicant' (this RPC always creates the
  -- applicant's signature) — NOT the user's system profile role. AdminAbsences
  -- and AbsencePlanner look up the signature via .eq('role','applicant').
  INSERT INTO signatures (request_id, signer_id, role, payload_snapshot, hash, ip_address)
  VALUES (
    v_absence_id,
    v_uid,
    'applicant',
    p_absence_data,
    p_signature_data->>'hash',
    p_signature_data->>'ip_address'
  );

  RETURN v_absence_id;
END;
$function$;
