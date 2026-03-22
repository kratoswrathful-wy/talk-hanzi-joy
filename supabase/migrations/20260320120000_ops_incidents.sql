-- 重大故障／維運紀錄（與 docs/HANDOFF.md 分工：此表供組織內查時間線與結論）

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
  ON public.ops_incidents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert ops incidents"
  ON public.ops_incidents FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update ops incidents"
  ON public.ops_incidents FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete ops incidents"
  ON public.ops_incidents FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER set_ops_incidents_updated_at
  BEFORE UPDATE ON public.ops_incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 種子：近期黑畫面類事件摘要（可於後台增修）
INSERT INTO public.ops_incidents (
  occurred_at,
  title,
  severity,
  symptoms,
  root_cause,
  resolution,
  affected_modules,
  reference_links
)
VALUES
  (
    '2026-03-01T00:00:00Z',
    '內部註記、客戶請款：閃登入或黑畫面',
    'major',
    '進入模組後短暫閃現登入或正確畫面，隨後整頁變黑；Network 多為 200。',
    '按鈕文案使用了未定義的變數（僅接 ui、未接 useUiButtonLabel），執行期 ReferenceError 導致 React 整頁崩潰。',
    '為「新增」等按鈕補上對應的 useUiButtonLabel 與預設文案；部署後應恢復。',
    ARRAY['internal_notes', 'client_invoices']::text[],
    '{"handoff_section": "內部註記詳情"}'::jsonb
  ),
  (
    '2026-03-15T00:00:00Z',
    '案件詳情：載入後約一秒黑畫面',
    'major',
    '先顯示載入或正確畫面，資料就緒後工具列渲染時整頁變黑。',
    '工具列按鈕使用了 lbRevertToDraft 等文案變數，但未以 useUiButtonLabel 宣告。',
    '補齊五個 revert／cancel／delete 相關按鈕的 useUiButtonLabel；詳見 registry cases_detail_*。',
    ARRAY['cases', 'case_detail']::text[],
    '{"handoff_section": "React Hooks（案件詳情頁）"}'::jsonb
  ),
  (
    '2026-03-10T00:00:00Z',
    '程式碼整理與穩定性（持續）',
    'info',
    '設定頁肥大、案件資料量大時首屏慢或異常資料導致編輯器崩潰等。',
    '屬架構與資料防呆並行演進，非單一版本可「全部關閉」。',
    '設定拆至 src/components/settings/；案件 loadCaseIfMissing、mergeIncomingCase、CaseBodyEditorBoundary 等已文件化於 docs/HANDOFF.md。',
    ARRAY['settings', 'cases']::text[],
    '{"docs": ["docs/HANDOFF.md", "docs/CODEMAP.md"]}'::jsonb
  );
