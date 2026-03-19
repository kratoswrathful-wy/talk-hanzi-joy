# 完整遷移指南：從 Lovable Cloud 搬到外部 Supabase

> 本文件包含所有需要遷移的項目與完整 SQL，可交給開發者按步驟執行。

---

## 方法一：使用 Supabase CLI（推薦）

```bash
# 1. 安裝 CLI
npm install -g supabase

# 2. 登入
supabase login

# 3. 連結新專案
supabase link --project-ref <新專案的 project-id>

# 4. 套用全部 48 個 migration（按順序）
supabase db push

# 5. 部署 Edge Functions
supabase functions deploy

# 6. 設定 Secret
supabase secrets set NOTION_API_TOKEN=你的token值
```

---

## 方法二：手動在 SQL Editor 執行

如果不使用 CLI，可以將下方 SQL 貼到新 Supabase 專案的 **SQL Editor** 中執行。

> ⚠️ 請按順序執行，不要跳過任何步驟。

---

### 步驟 1：基礎架構（角色、帳號、權限）

```sql
-- =============================================
-- Migration 1: 核心表格 + 角色系統 + 觸發器
-- =============================================

-- 建立角色列舉
CREATE TYPE public.app_role AS ENUM ('member', 'pm', 'executive');

-- 建立使用者個人資料表
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 建立使用者角色表
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 建立邀請表
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

-- 角色檢查函數（Security Definer）
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('pm', 'executive')
  )
$$;

-- updated_at 自動更新觸發器函數
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 新使用者自動建立 profile 的觸發器函數
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

-- 觸發器
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Profiles RLS
CREATE POLICY "Anyone authenticated can view profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- User Roles RLS
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

-- Invitations RLS
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
```

### 步驟 2：Profile 擴充欄位

```sql
ALTER TABLE public.profiles
ADD COLUMN timezone text DEFAULT 'Asia/Taipei',
ADD COLUMN status_message text DEFAULT '',
ADD COLUMN phone text DEFAULT '',
ADD COLUMN mobile text DEFAULT '',
ADD COLUMN bio text DEFAULT '';
```

### 步驟 3：Storage Buckets

```sql
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
```

### 步驟 4：權限設定表

```sql
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

-- 插入預設權限設定
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
```

### 步驟 5：譯者設定表

```sql
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
```

### 步驟 6：應用設定表

```sql
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
```

### 步驟 7：費用單表

```sql
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
```

### 步驟 8：稿費請款單表

```sql
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

CREATE TABLE public.invoice_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  fee_id uuid NOT NULL REFERENCES public.fees(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  env text NOT NULL DEFAULT 'production',
  UNIQUE(invoice_id, fee_id)
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_fees ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_invoices_env ON public.invoices (env);
CREATE INDEX IF NOT EXISTS idx_invoice_fees_env ON public.invoice_fees (env);

CREATE TRIGGER handle_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Invoices RLS
CREATE POLICY "Authenticated users can read invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update invoices" ON public.invoices FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete invoices" ON public.invoices FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- 譯者自己的請款單權限
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
```

### 步驟 9：客戶請款單表

```sql
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

CREATE TABLE public.client_invoice_fees (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_invoice_id uuid NOT NULL REFERENCES public.client_invoices(id) ON DELETE CASCADE,
  fee_id uuid NOT NULL REFERENCES public.fees(id) ON DELETE CASCADE,
  env text NOT NULL DEFAULT 'production',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.client_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_invoice_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select client_invoices" ON public.client_invoices FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert client_invoices" ON public.client_invoices FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update client_invoices" ON public.client_invoices FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete client_invoices" ON public.client_invoices FOR DELETE TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Admins can select client_invoice_fees" ON public.client_invoice_fees FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert client_invoice_fees" ON public.client_invoice_fees FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update client_invoice_fees" ON public.client_invoice_fees FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete client_invoice_fees" ON public.client_invoice_fees FOR DELETE TO authenticated USING (is_admin(auth.uid()));

CREATE TRIGGER handle_client_invoices_updated_at BEFORE UPDATE ON public.client_invoices FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
```

### 步驟 10：案件管理表

```sql
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

-- 所有認證使用者可讀取案件
CREATE POLICY "Anyone authenticated can read cases"
  ON public.cases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert cases"
  ON public.cases FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
-- 所有認證使用者可更新案件（譯者接案需要）
CREATE POLICY "Anyone authenticated can update cases"
  ON public.cases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete cases"
  ON public.cases FOR DELETE TO authenticated USING (is_admin(auth.uid()));
```

### 步驟 11：內部問題表

```sql
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
```

### 步驟 12：圖示庫表

```sql
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
```

### 步驟 13：啟用 Realtime

```sql
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
```

---

## Edge Functions（4 個）

以下函數的原始碼位於 `supabase/functions/` 目錄：

| 函數名稱 | 用途 | JWT 驗證 |
|---------|------|---------|
| `create-user` | 管理員建立使用者帳號 | 是（預設） |
| `delete-user` | 管理員刪除使用者 | 是（預設） |
| `dev-switch-user` | 開發用角色切換（僅限測試信箱） | 是（預設） |
| `fetch-notion-page` | Notion 頁面資料擷取 | **否**（`verify_jwt = false`） |

### config.toml 設定

```toml
[functions.fetch-notion-page]
verify_jwt = false
```

---

## Secrets

| Secret | 說明 | 需手動設定？ |
|--------|------|------------|
| `SUPABASE_URL` | 自動提供 | ❌ |
| `SUPABASE_ANON_KEY` | 自動提供 | ❌ |
| `SUPABASE_SERVICE_ROLE_KEY` | 自動提供 | ❌ |
| `NOTION_API_TOKEN` | Notion API 整合金鑰 | ✅ |

```bash
supabase secrets set NOTION_API_TOKEN=你的Notion整合金鑰
```

---

## 前端環境變數

更新 `.env` 檔案：

```
VITE_SUPABASE_URL="https://你的新專案ID.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="你的新 anon key"
VITE_SUPABASE_PROJECT_ID="你的新 project ID"
```

---

## 手動處理項目清單

- [ ] 在 supabase.com 建立新專案
- [ ] 執行上方全部 SQL（或使用 `supabase db push`）
- [ ] 部署 4 個 Edge Functions（或使用 `supabase functions deploy`）
- [ ] 設定 `NOTION_API_TOKEN` Secret
- [ ] 建立 3 個 Storage Bucket 並上傳現有檔案
- [ ] 匯出舊專案資料 → 匯入新專案
- [ ] 重新建立使用者帳號（密碼無法匯出）
- [ ] 更新 `.env` 指向新專案
- [ ] 部署前端到 Netlify / Vercel / 其他平台
- [ ] 測試所有功能是否正常運作
