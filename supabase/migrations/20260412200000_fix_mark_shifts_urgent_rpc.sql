-- Fix mark_shifts_urgent RPC: remove reference to dropped shifts.assigned_to column.
--
-- Migration 20260404000000_remove_shifts_assigned_to.sql dropped shifts.assigned_to,
-- but mark_shifts_urgent still referenced it in its UPDATE, causing every sick report
-- to fail silently with "column assigned_to does not exist" and shifts never got
-- urgent_since = NOW(). Now the RPC only sets urgent_since.

CREATE OR REPLACE FUNCTION public.mark_shifts_urgent(p_shift_ids bigint[], p_user_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE shifts
    SET urgent_since = NOW()
    WHERE id = ANY(p_shift_ids);
END;
$function$;
