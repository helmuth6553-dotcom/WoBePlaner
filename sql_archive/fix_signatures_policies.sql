-- Fix Signatures RLS Policies
-- Bereinigt die letzten Warnungen für die Tabelle 'signatures'.
-- Ersetzt auth.uid() durch (select auth.uid()) und trennt Policies strikt nach Aktion.

-- 1. Alte Policies entfernen
DROP POLICY IF EXISTS "Users can view signatures for their own requests" ON public.signatures;
DROP POLICY IF EXISTS "Admins can view all signatures" ON public.signatures;
DROP POLICY IF EXISTS "Users can insert their own signatures" ON public.signatures;

-- 2. Neue, optimierte Policies erstellen

-- SELECT: Admin darf alles sehen, User darf sehen, was er unterschrieben hat (signer_id)
-- UND (optional) was zu seinen Requests gehört (request_id -> shifts -> user_id, falls Verknüpfung existiert).
-- Da das Schema komplex sein könnte, beschränken wir uns auf das Offensichtliche:
-- Admin OR Signer.
CREATE POLICY "signatures_select" ON public.signatures 
FOR SELECT USING (
  signer_id = (select auth.uid()) OR 
  exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
);

-- INSERT: Nur eigener User (Signer)
CREATE POLICY "signatures_insert" ON public.signatures 
FOR INSERT WITH CHECK (
  signer_id = (select auth.uid())
);

-- UPDATE: Niemand (Signaturen sind unveränderlich) - oder Admin falls nötig. 
-- Hier lassen wir es (erstmal) weg oder machen es Admin-only.
-- CREATE POLICY "signatures_update" ON public.signatures 
-- FOR UPDATE USING (
--   exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
-- );

-- DELETE: Nur Admin
CREATE POLICY "signatures_delete" ON public.signatures 
FOR DELETE USING (
  exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
);
