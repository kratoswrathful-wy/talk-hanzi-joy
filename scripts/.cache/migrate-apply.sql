BEGIN;

-- 1. 寫入 cat_files 連結（僅尚未連結的檔案）
UPDATE cat_files SET related_lms_case_id = '8e810242-6027-4b13-9d26-9953c20b1a9b', related_lms_case_title = 'Austria 260424' WHERE id = 'a3974a19-95a2-4d5c-87a2-5053aafb2ec4' AND related_lms_case_id IS NULL;
UPDATE cat_files SET related_lms_case_id = '4f1da055-1c79-49d5-abd1-e54601611a0b', related_lms_case_title = 'Austria 260508' WHERE id = 'a3974a19-95a2-4d5c-87a2-5053aafb2ec4' AND related_lms_case_id IS NULL;
UPDATE cat_files SET related_lms_case_id = 'd887db66-05ce-41fa-a857-0d54fbdbf665', related_lms_case_title = 'WIZA 260528' WHERE id = 'db93aa57-5535-4d49-af9b-ee75004e8efb' AND related_lms_case_id IS NULL;
UPDATE cat_files SET related_lms_case_id = 'feb46131-54ab-49de-88b2-a90ad1f130fa', related_lms_case_title = 'Michael Page 260421' WHERE id = 'c286f9b8-b273-4ee2-b03f-6531d5081519' AND related_lms_case_id IS NULL;
UPDATE cat_files SET related_lms_case_id = '41e32d86-3dad-478e-bea5-0d71f61bb6fd', related_lms_case_title = 'WIZA 260527' WHERE id = 'edc84d32-6ed4-44f5-ad95-6a4f2af2aebc' AND related_lms_case_id IS NULL;

-- 2. 啟用 cat_tool_enabled
UPDATE cases SET cat_tool_enabled = true WHERE id IN ('8e810242-6027-4b13-9d26-9953c20b1a9b', '4f1da055-1c79-49d5-abd1-e54601611a0b', 'd887db66-05ce-41fa-a857-0d54fbdbf665', 'feb46131-54ab-49de-88b2-a90ad1f130fa', '41e32d86-3dad-478e-bea5-0d71f61bb6fd');

-- 3. 自 cases.tools[] 移除已遷移的自研工具列（already_linked 全移；would_link 僅檔案已成功連到本案者）
WITH to_strip(case_id, tool_entry_id, file_id) AS (
  VALUES
  ('a90960e0-b70d-492e-a225-4e503d3e7285'::uuid, 'te-1773073214214', NULL::uuid),
  ('3cc1c666-0e19-4e98-9294-0f34103c882c'::uuid, 'te-default', NULL::uuid),
  ('43b614d9-e6fb-499a-8447-a06184b915e9'::uuid, 'te-1775550434991', NULL::uuid),
  ('4e747d28-6fae-4f24-bf70-1ac12d32851d'::uuid, 'te-default', NULL::uuid),
  ('bf759319-8812-4ad9-a90b-2bea5311865b'::uuid, 'te-1774238012458', NULL::uuid),
  ('0252ff48-75ce-45b1-8714-1a02312beadc'::uuid, 'te-default', NULL::uuid),
  ('00a758a2-4bf8-4fdb-9649-c232615018e9'::uuid, 'te-1774238012458', NULL::uuid),
  ('a1685d33-9ec6-4070-8690-1a7994c5e73e'::uuid, 'te-1773073214214', NULL::uuid),
  ('2b56ebc3-aa67-4b6b-a395-f47b35d917a4'::uuid, 'te-1774238012458', NULL::uuid),
  ('0bba04bf-b5e8-4893-8367-d21a43e78318'::uuid, 'te-1775550434991', NULL::uuid),
  ('849b5f80-9c8b-4167-93ee-64f5f5739c52'::uuid, 'te-1774238012458', NULL::uuid),
  ('96dff563-d779-4401-9a07-2d2a65aff202'::uuid, 'te-1775550434991', NULL::uuid),
  ('64abeaee-e5bb-43c6-b924-99e55594beeb'::uuid, 'te-default', NULL::uuid),
  ('5efd961a-4700-4da1-b1be-68b3771b9ef4'::uuid, 'te-default', NULL::uuid),
  ('b7dbabd4-f689-4096-b526-7053ea07f033'::uuid, 'te-1774238012458', NULL::uuid),
  ('554cdb28-c4cf-425a-a718-92e6f88a0e1b'::uuid, 'te-1775550434991', NULL::uuid),
  ('3b88ef4f-d0aa-4dbe-8b3d-435ab29579da'::uuid, 'te-default', NULL::uuid),
  ('325b3e8f-e876-4932-90c3-f603f7b08d2b'::uuid, 'te-default', NULL::uuid),
  ('5876e446-db7b-463e-880f-5a6f831d8017'::uuid, 'te-1774238012458', NULL::uuid),
  ('f0d7257d-8eaf-4ce3-9b83-7fae290baf67'::uuid, 'te-1775550434991', NULL::uuid),
  ('8e810242-6027-4b13-9d26-9953c20b1a9b'::uuid, 'te-1773073214214', 'a3974a19-95a2-4d5c-87a2-5053aafb2ec4'::uuid),
  ('4f1da055-1c79-49d5-abd1-e54601611a0b'::uuid, 'te-1773073214214', 'a3974a19-95a2-4d5c-87a2-5053aafb2ec4'::uuid),
  ('d887db66-05ce-41fa-a857-0d54fbdbf665'::uuid, 'te-1775550434991', 'db93aa57-5535-4d49-af9b-ee75004e8efb'::uuid),
  ('feb46131-54ab-49de-88b2-a90ad1f130fa'::uuid, 'te-default', 'c286f9b8-b273-4ee2-b03f-6531d5081519'::uuid),
  ('41e32d86-3dad-478e-bea5-0d71f61bb6fd'::uuid, 'te-1775550434991', 'edc84d32-6ed4-44f5-ad95-6a4f2af2aebc'::uuid)
),
eligible AS (
  SELECT DISTINCT s.case_id, s.tool_entry_id
  FROM to_strip s
  WHERE s.file_id IS NULL
     OR EXISTS (
       SELECT 1 FROM cat_files f
       WHERE f.id = s.file_id AND f.related_lms_case_id = s.case_id
     )
)
UPDATE cases c
SET tools = COALESCE(
  (
    SELECT jsonb_agg(elem ORDER BY ord)
    FROM (
      SELECT elem, ordinality AS ord
      FROM jsonb_array_elements(c.tools) WITH ORDINALITY AS t(elem, ordinality)
      WHERE NOT EXISTS (
        SELECT 1 FROM eligible e
        WHERE e.case_id = c.id AND elem->>'id' = e.tool_entry_id
      )
    ) filtered
  ),
  '[]'::jsonb
)
WHERE c.id IN (SELECT case_id FROM eligible);

COMMIT;
