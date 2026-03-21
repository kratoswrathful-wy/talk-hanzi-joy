
-- Create permission_settings table for field/section permission config
CREATE TABLE IF NOT EXISTS public.permission_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.permission_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read permissions" ON public.permission_settings;
CREATE POLICY "Anyone authenticated can read permissions"
  ON public.permission_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Executives can update permissions" ON public.permission_settings;
CREATE POLICY "Executives can update permissions"
  ON public.permission_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'executive'))
  WITH CHECK (public.has_role(auth.uid(), 'executive'));

DROP POLICY IF EXISTS "Executives can insert permissions" ON public.permission_settings;
CREATE POLICY "Executives can insert permissions"
  ON public.permission_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'executive'));

-- Insert default permission config（僅在尚無任何列時）
INSERT INTO public.permission_settings (config)
SELECT '{
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
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.permission_settings LIMIT 1);
