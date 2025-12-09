-- Neue Tabelle für Monatsabschlüsse
-- Mit integrierter Trigger-Funktion (falls fehlend)

-- 1. Trigger Funktion erstellen (falls nicht existiert)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Tabelle erstellen
CREATE TABLE IF NOT EXISTS public.monthly_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    
    -- Status-Workflow
    status TEXT CHECK (status IN ('entwurf', 'eingereicht', 'genehmigt', 'abgelehnt')) DEFAULT 'entwurf',
    
    -- Zeitstempel für Audit
    submitted_at TIMESTAMP WITH TIME ZONE, -- Wann hat MA unterschrieben?
    approved_at TIMESTAMP WITH TIME ZONE,  -- Wann hat Admin freigegeben?
    rejected_at TIMESTAMP WITH TIME ZONE,  -- Wann wurde zurückgewiesen?
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Verhindert doppelte Reports pro User/Monat
    UNIQUE(user_id, year, month)
);

-- RLS aktivieren
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;

-- Policies für monthly_reports
-- Drop existing policies first to be safe
DROP POLICY IF EXISTS "Users view own reports" ON public.monthly_reports;
DROP POLICY IF EXISTS "Admins view all reports" ON public.monthly_reports;
DROP POLICY IF EXISTS "Users create own reports" ON public.monthly_reports;
DROP POLICY IF EXISTS "Users update own reports" ON public.monthly_reports;
DROP POLICY IF EXISTS "Admins update all reports" ON public.monthly_reports;

-- 1. SELECT
CREATE POLICY "Users view own reports" ON public.monthly_reports
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins view all reports" ON public.monthly_reports
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- 2. INSERT
CREATE POLICY "Users create own reports" ON public.monthly_reports
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. UPDATE
CREATE POLICY "Users update own reports" ON public.monthly_reports
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins update all reports" ON public.monthly_reports
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Trigger
DROP TRIGGER IF EXISTS monthly_reports_updated_at ON public.monthly_reports;
CREATE TRIGGER monthly_reports_updated_at
    BEFORE UPDATE ON public.monthly_reports
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- HELPER FUNCTION für Policies
CREATE OR REPLACE FUNCTION public.is_month_locked(p_user_id UUID, p_date DATE)
RETURNS BOOLEAN AS $$
DECLARE
    v_year INTEGER;
    v_month INTEGER;
    v_status TEXT;
BEGIN
    v_year := EXTRACT(YEAR FROM p_date);
    v_month := EXTRACT(MONTH FROM p_date);
    
    SELECT status INTO v_status
    FROM public.monthly_reports
    WHERE user_id = p_user_id AND year = v_year AND month = v_month;
    
    -- Wenn status eingereicht oder genehmigt -> LOCKED (TRUE)
    IF v_status IN ('eingereicht', 'genehmigt') THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
