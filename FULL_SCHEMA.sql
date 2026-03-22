-- =============================================
-- 完整 Schema SQL — 可直接貼到新 Supabase SQL Editor 執行
-- 合併自 48 個 migration 檔案（最終狀態）
-- =============================================

-- =============================================
-- 1. 自訂型別
-- =============================================
CREATE TYPE public.app_role AS ENUM ('member', 'pm', 'executive');

-- =============================================
-- 2. 輔助函數
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('pm', 'executive')
  )
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _invitation RECORD;
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  SELECT * INTO _invitation FROM public.invitations WHERE email = NEW.email AND accepted_at IS NULL;

  IF FOUND THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _invitation.role);
    UPDATE public.invitations SET accepted_at = now() WHERE id = _invitation.id;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================
-- 3. 表格：profiles
-- =============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  email TEXT NOT NULL,
  timezone text DEFAULT 'Asia/Taipei',
  status_message text DEFAULT '',
  phone text DEFAULT '',
  mobile text DEFAULT '',
  bio text DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================
-- 4. 表格：user_roles
-- =============================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view roles"
  ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- =============================================
-- 5. 表格：invitations
-- =============================================
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'member',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(email)
);
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view invitations"
  ON public.invitations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert invitations"
  ON public.invitations FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update invitations"
  ON public.invitations FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete invitations"
  ON public.invitations FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- =============================================
-- 6. 觸發器：新使用者註冊自動建立 profile + 角色
-- =============================================
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- 7. 表格：permission_settings
-- =============================================
CREATE TABLE public.permission_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  env text NOT NULL DEFAULT 'production'
);
ALTER TABLE public.permission_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read permissions"
  ON public.permission_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Executives can update permissions"
  ON public.permission_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'executive'))
  WITH CHECK (public.has_role(auth.uid(), 'executive'));
CREATE POLICY "Executives can insert permissions"
  ON public.permission_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'executive'));

-- 預設權限設定（production）
INSERT INTO public.permission_settings (config, env) VALUES ('{
  "fields": {
    "member": {
      "title": {"view": true, "edit": false},
      "assignee": {"view": true, "edit": false},
      "taskType": {"view": true, "edit": false},
      "billingUnit": {"view": true, "edit": false},
      "unitPrice": {"view": false, "edit": false},
      "unitCount": {"view": true, "edit": false},
      "client": {"view": false, "edit": false},
      "contact": {"view": false, "edit": false},
      "clientCaseId": {"view": false, "edit": false},
      "clientPoNumber": {"view": false, "edit": false},
      "hdPath": {"view": false, "edit": false},
      "reconciled": {"view": false, "edit": false},
      "rateConfirmed": {"view": false, "edit": false},
      "invoiced": {"view": false, "edit": false},
      "sameCase": {"view": false, "edit": false},
      "clientRevenue": {"view": false, "edit": false},
      "profit": {"view": false, "edit": false},
      "internalNote": {"view": true, "edit": false}
    },
    "pm": {
      "title": {"view": true, "edit": true},
      "assignee": {"view": true, "edit": true},
      "taskType": {"view": true, "edit": true},
      "billingUnit": {"view": true, "edit": true},
      "unitPrice": {"view": true, "edit": true},
      "unitCount": {"view": true, "edit": true},
      "client": {"view": true, "edit": true},
      "contact": {"view": true, "edit": true},
      "clientCaseId": {"view": true, "edit": true},
      "clientPoNumber": {"view": true, "edit": true},
      "hdPath": {"view": true, "edit": true},
      "reconciled": {"view": true, "edit": true},
      "rateConfirmed": {"view": true, "edit": true},
      "invoiced": {"view": true, "edit": true},
      "sameCase": {"view": true, "edit": true},
      "clientRevenue": {"view": true, "edit": true},
      "profit": {"view": true, "edit": true},
      "internalNote": {"view": true, "edit": true}
    },
    "executive": {
      "title": {"view": true, "edit": true},
      "assignee": {"view": true, "edit": true},
      "taskType": {"view": true, "edit": true},
      "billingUnit": {"view": true, "edit": true},
      "unitPrice": {"view": true, "edit": true},
      "unitCount": {"view": true, "edit": true},
      "client": {"view": true, "edit": true},
      "contact": {"view": true, "edit": true},
      "clientCaseId": {"view": true, "edit": true},
      "clientPoNumber": {"view": true, "edit": true},
      "hdPath": {"view": true, "edit": true},
      "reconciled": {"view": true, "edit": true},
      "rateConfirmed": {"view": true, "edit": true},
      "invoiced": {"view": true, "edit": true},
      "sameCase": {"view": true, "edit": true},
      "clientRevenue": {"view": true, "edit": true},
      "profit": {"view": true, "edit": true},
      "internalNote": {"view": true, "edit": true}
    }
  },
  "settings_sections": {
    "member": {
      "client_management": false,
      "task_type_order": false,
      "client_pricing": false,
      "translator_tiers": false,
      "translator_notes": false
    },
    "pm": {
      "client_management": true,
      "task_type_order": true,
      "client_pricing": true,
      "translator_tiers": true,
      "translator_notes": true
    },
    "executive": {
      "client_management": true,
      "task_type_order": true,
      "client_pricing": true,
      "translator_tiers": true,
      "translator_notes": true
    }
  }
}'::jsonb, 'production');

-- 複製一份給 test 環境
INSERT INTO public.permission_settings (config, env)
SELECT config, 'test' FROM public.permission_settings WHERE env = 'production' LIMIT 1;

-- =============================================
-- 8. 表格：member_translator_settings
-- =============================================
CREATE TABLE public.member_translator_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  note text NOT NULL DEFAULT '',
  no_fee boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  frozen boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.member_translator_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read translator settings"
  ON public.member_translator_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert translator settings"
  ON public.member_translator_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update translator settings"
  ON public.member_translator_settings FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete translator settings"
  ON public.member_translator_settings FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- =============================================
-- 8b. 表格：ops_incidents（重大故障／維運紀錄）
-- =============================================
CREATE TABLE public.ops_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'major' CHECK (severity IN ('major', 'minor', 'info')),
  symptoms text NOT NULL DEFAULT '',
  root_cause text NOT NULL DEFAULT '',
  resolution text NOT NULL DEFAULT '',
  affected_modules text[] NOT NULL DEFAULT '{}',
  reference_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX ops_incidents_occurred_at_idx ON public.ops_incidents (occurred_at DESC);
ALTER TABLE public.ops_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read ops incidents"
  ON public.ops_incidents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert ops incidents"
  ON public.ops_incidents FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update ops incidents"
  ON public.ops_incidents FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete ops incidents"
  ON public.ops_incidents FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE TRIGGER set_ops_incidents_updated_at
  BEFORE UPDATE ON public.ops_incidents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================
-- 9. 表格：app_settings
-- =============================================
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read settings"
  ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert settings"
  ON public.app_settings FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update settings"
  ON public.app_settings FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete settings"
  ON public.app_settings FOR DELETE TO authenticated
  USING (is_admin(auth.uid()));

CREATE TRIGGER set_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- =============================================
-- 10. 表格：fees
-- =============================================
CREATE TABLE public.fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  assignee text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  internal_note text NOT NULL DEFAULT '',
  internal_note_url text NOT NULL DEFAULT '',
  task_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  client_info jsonb,
  notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  edit_logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  finalized_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  env text NOT NULL DEFAULT 'production'
);
ALTER TABLE public.fees ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fees_env ON public.fees (env);

CREATE POLICY "Authenticated users can read fees"
  ON public.fees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert fees"
  ON public.fees FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update fees"
  ON public.fees FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete fees"
  ON public.fees FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_fees_updated_at
  BEFORE UPDATE ON public.fees
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================
-- 11. 表格：invoices + invoice_fees
-- =============================================
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  translator text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  transfer_date timestamptz,
  note text NOT NULL DEFAULT '',
  payments jsonb NOT NULL DEFAULT '[]'::jsonb,
  comments jsonb NOT NULL DEFAULT '[]'::jsonb,
  edit_logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  env text NOT NULL DEFAULT 'production'
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_invoices_env ON public.invoices (env);

CREATE TABLE public.invoice_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  fee_id uuid NOT NULL REFERENCES public.fees(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  env text NOT NULL DEFAULT 'production',
  UNIQUE(invoice_id, fee_id)
);
ALTER TABLE public.invoice_fees ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_invoice_fees_env ON public.invoice_fees (env);

CREATE TRIGGER handle_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Invoices RLS
CREATE POLICY "Authenticated users can read invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update invoices" ON public.invoices FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete invoices" ON public.invoices FOR DELETE TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Translators can update own invoices"
  ON public.invoices FOR UPDATE TO authenticated
  USING (translator = (SELECT display_name FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Translators can insert own invoices"
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (translator = (SELECT display_name FROM profiles WHERE id = auth.uid()));

-- Invoice_fees RLS
CREATE POLICY "Authenticated users can read invoice_fees" ON public.invoice_fees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert invoice_fees" ON public.invoice_fees FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update invoice_fees" ON public.invoice_fees FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete invoice_fees" ON public.invoice_fees FOR DELETE TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Translators can insert own invoice_fees"
  ON public.invoice_fees FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_fees.invoice_id
      AND invoices.translator = (SELECT display_name FROM profiles WHERE id = auth.uid())
    )
  );
CREATE POLICY "Translators can delete own invoice_fees"
  ON public.invoice_fees FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_fees.invoice_id
      AND invoices.translator = (SELECT display_name FROM profiles WHERE id = auth.uid())
    )
  );

-- =============================================
-- 12. 表格：client_invoices + client_invoice_fees
-- =============================================
CREATE TABLE public.client_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  client text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  transfer_date timestamp with time zone,
  note text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  payments jsonb NOT NULL DEFAULT '[]'::jsonb,
  comments jsonb NOT NULL DEFAULT '[]'::jsonb,
  edit_logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  env text NOT NULL DEFAULT 'production',
  is_record_only boolean NOT NULL DEFAULT false,
  record_amount numeric NOT NULL DEFAULT 0,
  record_currency text DEFAULT 'TWD',
  expected_collection_date date,
  actual_collection_date date,
  billing_channel text NOT NULL DEFAULT '',
  invoice_number text NOT NULL DEFAULT ''
);
ALTER TABLE public.client_invoices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.client_invoice_fees (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_invoice_id uuid NOT NULL REFERENCES public.client_invoices(id) ON DELETE CASCADE,
  fee_id uuid NOT NULL REFERENCES public.fees(id) ON DELETE CASCADE,
  env text NOT NULL DEFAULT 'production',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.client_invoice_fees ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER handle_client_invoices_updated_at
  BEFORE UPDATE ON public.client_invoices
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE POLICY "Admins can select client_invoices" ON public.client_invoices FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert client_invoices" ON public.client_invoices FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update client_invoices" ON public.client_invoices FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete client_invoices" ON public.client_invoices FOR DELETE TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Admins can select client_invoice_fees" ON public.client_invoice_fees FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert client_invoice_fees" ON public.client_invoice_fees FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update client_invoice_fees" ON public.client_invoice_fees FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete client_invoice_fees" ON public.client_invoice_fees FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- =============================================
-- 13. 表格：cases
-- =============================================
CREATE TABLE public.cases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  work_type jsonb NOT NULL DEFAULT '[]'::jsonb,
  process_note text NOT NULL DEFAULT '',
  billing_unit text NOT NULL DEFAULT '',
  unit_count numeric NOT NULL DEFAULT 0,
  inquiry_note text NOT NULL DEFAULT '',
  translator jsonb NOT NULL DEFAULT '[]'::jsonb,
  translation_deadline timestamptz,
  reviewer text NOT NULL DEFAULT '',
  review_deadline timestamptz,
  task_status text NOT NULL DEFAULT '',
  execution_tool text NOT NULL DEFAULT '',
  delivery_method text NOT NULL DEFAULT '',
  client_receipt text NOT NULL DEFAULT '',
  custom_guidelines_url jsonb DEFAULT '[]'::jsonb,
  client_guidelines jsonb DEFAULT '[]'::jsonb,
  common_info jsonb NOT NULL DEFAULT '[]'::jsonb,
  internal_note_form boolean NOT NULL DEFAULT false,
  client_question_form boolean NOT NULL DEFAULT false,
  working_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  other_login_info text NOT NULL DEFAULT '',
  login_account text NOT NULL DEFAULT '',
  login_password text NOT NULL DEFAULT '',
  online_tool_project text NOT NULL DEFAULT '',
  online_tool_filename text NOT NULL DEFAULT '',
  source_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  reference_materials jsonb NOT NULL DEFAULT '[]'::jsonb,
  question_form text NOT NULL DEFAULT '',
  translator_final jsonb NOT NULL DEFAULT '[]'::jsonb,
  internal_review_final jsonb NOT NULL DEFAULT '[]'::jsonb,
  track_changes jsonb DEFAULT '[]'::jsonb,
  fee_entry text NOT NULL DEFAULT '',
  internal_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  env text NOT NULL DEFAULT 'production',
  tool_field_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  common_links jsonb DEFAULT '[]'::jsonb,
  series_reference_materials jsonb DEFAULT '[]'::jsonb,
  case_reference_materials jsonb DEFAULT '[]'::jsonb,
  comments jsonb DEFAULT '[]'::jsonb,
  internal_comments jsonb DEFAULT '[]'::jsonb,
  question_tools jsonb DEFAULT '[]'::jsonb,
  work_groups jsonb NOT NULL DEFAULT '[]'::jsonb,
  body_content jsonb DEFAULT '[]'::jsonb,
  delivery_method_files jsonb DEFAULT '[]'::jsonb,
  client_receipt_files jsonb DEFAULT '[]'::jsonb,
  multi_collab boolean NOT NULL DEFAULT false,
  collab_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  collab_count integer NOT NULL DEFAULT 0,
  keyword text NOT NULL DEFAULT '',
  client_po_number text NOT NULL DEFAULT '',
  client_case_link jsonb DEFAULT '{"url":"","label":""}'::jsonb,
  dispatch_route text DEFAULT '',
  decline_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  icon_url text DEFAULT '',
  client text NOT NULL DEFAULT '',
  contact text NOT NULL DEFAULT ''
);
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read cases"
  ON public.cases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert cases"
  ON public.cases FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Anyone authenticated can update cases"
  ON public.cases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete cases"
  ON public.cases FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- =============================================
-- 14. 表格：internal_notes
-- =============================================
CREATE TABLE public.internal_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  related_case TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  creator TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  note_type TEXT NOT NULL DEFAULT '',
  internal_assignee JSONB NOT NULL DEFAULT '[]'::jsonb,
  file_name TEXT NOT NULL DEFAULT '',
  id_row_count TEXT NOT NULL DEFAULT '',
  source_text TEXT NOT NULL DEFAULT '',
  translated_text TEXT NOT NULL DEFAULT '',
  question_or_note TEXT NOT NULL DEFAULT '',
  question_or_note_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  reference_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  comments JSONB NOT NULL DEFAULT '[]'::jsonb,
  invalidated BOOLEAN NOT NULL DEFAULT false,
  invalidated_by TEXT,
  invalidated_at TIMESTAMPTZ,
  invalidation_reason TEXT,
  env TEXT NOT NULL DEFAULT 'test',
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view internal notes"
  ON public.internal_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert internal notes"
  ON public.internal_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update internal notes"
  ON public.internal_notes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete internal notes"
  ON public.internal_notes FOR DELETE TO authenticated USING (true);

-- =============================================
-- 15. 表格：icon_library
-- =============================================
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
  ON public.icon_library FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update icon library"
  ON public.icon_library FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete icon library"
  ON public.icon_library FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- =============================================
-- 16. Storage Buckets
-- =============================================

-- 頭像
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Public can view avatars"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- 案件檔案
INSERT INTO storage.buckets (id, name, public) VALUES ('case-files', 'case-files', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload case files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'case-files');
CREATE POLICY "Public read access for case files"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'case-files');
CREATE POLICY "Authenticated users can delete case files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'case-files');
CREATE POLICY "Authenticated users can update case files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'case-files')
  WITH CHECK (bucket_id = 'case-files');

-- 案件圖示
INSERT INTO storage.buckets (id, name, public) VALUES ('case-icons', 'case-icons', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload case icons"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'case-icons');
CREATE POLICY "Authenticated users can update case icons"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'case-icons');
CREATE POLICY "Anyone can read case icons"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'case-icons');
CREATE POLICY "Authenticated users can delete case icons"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'case-icons');

-- =============================================
-- 17. 啟用 Realtime
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.cases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoice_fees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_invoice_fees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.member_translator_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_notes;

-- =============================================
-- 完成！
-- =============================================
