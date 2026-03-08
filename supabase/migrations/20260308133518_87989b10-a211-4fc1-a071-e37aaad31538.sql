
ALTER TABLE public.permission_settings ADD COLUMN env text NOT NULL DEFAULT 'production';

-- Duplicate existing config for test environment
INSERT INTO public.permission_settings (config, env, updated_by)
SELECT config, 'test', updated_by FROM public.permission_settings WHERE env = 'production' LIMIT 1
ON CONFLICT DO NOTHING;
