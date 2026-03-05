
-- Create member_translator_settings table for per-member translator notes and no-fee flag
CREATE TABLE public.member_translator_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  note text NOT NULL DEFAULT '',
  no_fee boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.member_translator_settings ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read
CREATE POLICY "Anyone authenticated can read translator settings"
  ON public.member_translator_settings FOR SELECT TO authenticated USING (true);

-- Admins (PM/executive) can manage
CREATE POLICY "Admins can insert translator settings"
  ON public.member_translator_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update translator settings"
  ON public.member_translator_settings FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete translator settings"
  ON public.member_translator_settings FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
