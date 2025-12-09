CREATE TABLE IF NOT EXISTS public.roster_months (
    year integer NOT NULL,
    month integer NOT NULL,
    is_open boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (year, month)
);

ALTER TABLE public.roster_months ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can manage roster months" ON public.roster_months
    FOR ALL USING (is_admin());

CREATE POLICY "Everyone can view roster months" ON public.roster_months
    FOR SELECT USING (true);
