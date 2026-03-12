
CREATE TABLE public.icon_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  storage_path TEXT NOT NULL DEFAULT '',
  env TEXT NOT NULL DEFAULT 'production',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.icon_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read icon library"
  ON public.icon_library FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert icon library"
  ON public.icon_library FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update icon library"
  ON public.icon_library FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete icon library"
  ON public.icon_library FOR DELETE TO authenticated
  USING (is_admin(auth.uid()));
