-- CAT 模組層變更紀錄加入測試／正式環境標記。
-- 舊資料無可靠身分欄位可回推，統一歸入 production；新寫入由應用程式明確帶 env。
ALTER TABLE public.cat_module_logs
ADD COLUMN IF NOT EXISTS env text;

UPDATE public.cat_module_logs
SET env = 'production'
WHERE env IS NULL;

ALTER TABLE public.cat_module_logs
ALTER COLUMN env SET DEFAULT 'production';

ALTER TABLE public.cat_module_logs
ALTER COLUMN env SET NOT NULL;

ALTER TABLE public.cat_module_logs
DROP CONSTRAINT IF EXISTS cat_module_logs_env_check;

ALTER TABLE public.cat_module_logs
ADD CONSTRAINT cat_module_logs_env_check
CHECK (env IN ('production', 'test'));

CREATE INDEX IF NOT EXISTS cat_module_logs_env_module_at_idx
ON public.cat_module_logs (env, module, at DESC);
