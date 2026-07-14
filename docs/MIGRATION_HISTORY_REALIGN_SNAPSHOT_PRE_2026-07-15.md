狀態：規劃中

# Migration 歷史對齊——對齊前快照（唯讀）

- **日期**：2026-07-15（臺灣）
- **專案**：`wshsmerltcakffllgyul`（正式庫）
- **來源**：`SELECT version, name, length(array_to_string(statements, E'\n')) AS sql_len FROM supabase_migrations.schema_migrations ORDER BY version`
- **性質**：僅紀錄；**尚未**對 `schema_migrations` 做任何 repair／UPDATE
- **對應計畫**：[`MIGRATION_HISTORY_REALIGN_PLAN_2026-07.md`](MIGRATION_HISTORY_REALIGN_PLAN_2026-07.md)

| version | name | sql_len |
|---|---|---:|
| 20260305092158 | c333bc05-afc1-4728-96d7-a26aae40c810 | 4890 |
| 20260305092216 | 4048f04b-8e5f-433b-b20c-1da93706fac8 | 198 |
| 20260305092235 | 902da9d9-1d82-428c-9c48-fb2d63372884 | 1003 |
| 20260305094453 | 3d3fb615-1a01-45ba-8dae-a9ac822a95b1 | 4809 |
| 20260305095441 | 65399ad0-2aef-4513-9f98-5491fb4f5da7 | 1127 |
| 20260305105333 | 6ffa8106-34c4-4575-b9b6-e36d6a02af38 | 1968 |
| 20260306042635 | e7cc3127-c06d-4984-94cb-1d1c85362d2b | 2067 |
| 20260306050009 | b673ffe1-cd94-4c95-bcbe-2c3b3ed0383d | 180 |
| 20260306102516 | 164e8bed-4a6a-4b16-9727-6c4e560a7a04 | 194 |
| 20260306155749 | 55481eea-03d9-48d9-9307-5e619bd0d12b | 1279 |
| 20260307014946 | c21942ef-8eaf-4c5b-ac4e-39d1b4a2d4a9 | 1178 |
| 20260307020911 | c77f0ed4-2343-486f-b40b-5574f1d6af9b | 667 |
| 20260307223426 | 0646f94f-90a6-49ac-adb5-f7d9a58fdd3b | 2677 |
| 20260308002218 | a36babf1-e690-4d45-8145-eeaa7602b69a | 406 |
| 20260308122345 | ff110f18-3cbb-4327-ab02-47ceeb044d98 | 108 |
| 20260308124503 | 54ec0281-2fee-4fed-ab16-db2624f39795 | 94 |
| 20260308133518 | 87989b10-a211-4fc1-a071-e37aaad31538 | 328 |
| 20260308135237 | 767897d7-22b7-4fdf-a0e1-124810b2301b | 223 |
| 20260308151605 | 5b1573b1-3bca-442e-9415-dc67dcda4d51 | 2313 |
| 20260308153556 | a318dd12-2c34-43bf-96d6-392466f0ce95 | 277 |
| 20260308160759 | 0f230d24-6439-497a-a390-9729e098cf03 | 102 |
| 20260308161438 | 5b850d91-f40f-4945-b41a-488562864d68 | 90 |
| 20260308170328 | 03c9865f-c0c4-4fab-8965-e37fbc8a2c80 | 306 |
| 20260308170548 | 8a96ac0b-2644-4a8a-9cf8-091645f6fe55 | 72 |
| 20260308175251 | 4de0b1bf-9044-4c50-bc8f-8219d80dcb7a | 1892 |
| 20260308181116 | d717813b-a33c-43e1-a8d0-bf9cd0f2e85a | 391 |
| 20260308193923 | 4d6e303f-9f12-4362-9674-52ea426e2700 | 90 |
| 20260308203320 | 5fac2283-2958-48e1-aaa9-a62efc322607 | 229 |
| 20260308210056 | 7a78c13b-d0d5-472d-a56f-2fe486b09288 | 294 |
| 20260309042122 | 78bcdf37-db4e-4270-bdd5-10d0fc68e136 | 136 |
| 20260309043951 | 0b7c1062-b0a8-4b6e-97b2-e4f028349587 | 97 |
| 20260309123509 | 0ec3999c-fec2-4486-8d3b-57ff743f9857 | 88 |
| 20260309125038 | 654f8586-13d2-48f8-ba39-7597d9311ef4 | 252 |
| 20260309151444 | 3ec0c1f1-69c5-46fa-8a49-114d06291f48 | 280 |
| 20260309171008 | bb9a0a6e-3814-462e-8032-5c4ac4746b9e | 174 |
| 20260309213709 | 8d6928e3-68f5-44ca-aad5-7721aef2f141 | 111 |
| 20260309214316 | ed0b28cc-d534-4606-969d-6349344d8ce2 | 80 |
| 20260309234057 | a8d4b04e-d1f2-45ed-864c-92848fd18305 | 544 |
| 20260310015230 | febe22c7-7037-4c75-a0a5-c8ddf1e0d247 | 58 |
| 20260310015440 | 9d1a430d-33c2-489c-8a72-98e6da107bb4 | 535 |
| 20260311114006 | 38e11f69-3062-4e18-8ec9-0bd61fce6e7a | 796 |
| 20260312091708 | 500050a2-38bb-4621-8762-1f59670daa45 | 1683 |
| 20260312091845 | 7bb1b1a2-6eca-4b9d-99b7-12f7e519adcc | 100 |
| 20260312180701 | 8781d2ae-f4ec-4261-9c59-0d61396a12a2 | 1086 |
| 20260312181549 | c232fbe8-2b07-4b8d-bf0f-2348372e2025 | 935 |
| 20260313024916 | d1c78ef6-3774-47f1-a427-7d50d102dcf2 | 94 |
| 20260313170643 | 730f19bf-3a42-435b-afc6-728c8e4c9f57 | 100 |
| 20260314075548 | c278569a-d0c8-4990-9b6c-2eb1d5cb7435 | 85 |
| 20260319120000 | user_slack_oauth | 1652 |
| 20260320120000 | ops_incidents | 2855 |
| 20260321120000 | case_files_storage_update_policy | 413 |
| 20260322120000 | profile_receive_case_reply_slack | 417 |
| 20260322140000 | repair_case_files_storage_rls | 1313 |
| 20260323120000 | case_files_bucket_file_size_limit | 357 |
| 20260323150000 | inquiry_slack_records | 107 |
| 20260324120000 | profiles_slack_message_defaults | 457 |
| 20260411120000 | client_invoices_adjustment_lines | 175 |
| 20260412120000 | edit_log_gates | 690 |
| 20260415120000 | cat_assignments | 2154 |
| 20260415133000 | cat_cloud_core | 6459 |
| 20260415150000 | cat_file_assignments | 1788 |
| 20260416180000 | cat_projects_tbs | 151 |
| 20260417120000 | cat_notes_redesign | 5486 |
| 20260418120000 | cat_private_notes_item_type | 396 |
| 20260419120000 | cat_segments_user_system_lock | 491 |
| 20260419130000 | cat_segments_tags | 207 |
| 20260419140000 | cat_projects_tm_penalties | 106 |
| 20260421120000 | cat_segments_segment_revision | 2447 |
| 20260421120100 | cat_files_applicable_special_instructions | 434 |
| 20260423180000 | cat_work_memo_attachments | 2067 |
| 20260425193000 | cat_segment_edit_leases | 3643 |
| 20260426143000 | cat_ai_cloud | 4106 |
| 20260426220000 | cat_ai_project_guidelines | 173 |
| 20260427153000 | cat_ai_category_tags_list_hidden | 169 |
| 20260428120000 | cat_lease_same_user_takeover | 1941 |
| 20260428180000 | cat_tbs_online_sheet | 680 |
| 20260429121500 | cat_tbs_existing_lock_manual | 605 |
| 20260429203000 | cat_ai_guidelines_examples | 303 |
| 20260429210000 | cat_tbs_online_tabs | 239 |
| 20260429220000 | cat_project_client_form_and_file_case_binding | 298 |
| 20260429234626 | cat_file_assignments_self_insert | 229 |
| 20260430074500 | cat_file_assignments_self_insert | 667 |
| 20260430120000 | cat_files_google_sheet_url_format | 344 |
| 20260501140000 | cat_projects_question_form_columns | 307 |
| 20260502062853 | cat_views | 3113 |
| 20260502120000 | cat_ai_issue_groups | 1499 |
| 20260502120001 | rls_initplan_fix | 18103 |
| 20260502130000 | perf_indexes | 674 |
| 20260502130500 | internal_notes_consultation_slack_records | 410 |
| 20260502140000 | rls_initplan_fix | 21385 |
| 20260502160000 | cat_files_default_mq_role | 430 |
| 20260503120000 | cat_original_files_storage | 1745 |
| 20260504210000 | cat_segments_source_change_info | 205 |
| 20260505180000 | cat_translator_question_form_prefs | 1035 |
| 20260507120000 | cat_segments_global_id | 375 |
| 20260507180000 | cat_segments_batch_patch | 3776 |
| 20260508120000 | sync_cat_file_assignments_fn | 2735 |
| 20260508130000 | sync_cat_file_assignments_fn_fix_translator_jsonb | 2490 |
| 20260510130000 | cat_segments_mq_roles | 366 |
| 20260511120000 | cat_ai_project_settings_project_ai_instructions | 956 |
| 20260602120000 | cat_segments_batch_patch_position | 3758 |
| 20260603120000 | cat_segments_xliff_tu_id | 3972 |
| 20260610120000 | cat_files_related_lms_case_id_index | 221 |
| 20260610140000 | sync_cat_workflow_assignments | 8978 |
| 20260610200000 | cases_cat_tool_enabled | 1185 |
| 20260612120000 | cat_workflow_phase_b | 9506 |
| 20260614120000 | invoice_payment_date_edit | 1349 |
| 20260614160000 | cat_workflow_b4_v4 | 9213 |
| 20260615120000 | fix_collab_row_id_text | 8810 |
| 20260616120000 | cat_workflow_b6_prep_review | 8095 |
| 20260617120000 | cat_workflow_b7a_first_edited_at | 1279 |
| 20260618120000 | cat_workflow_b7c_file_user_access | 977 |
| 20260618130000 | cat_user_ui_prefs | 736 |
| 20260619120000 | cat_segments_review_restore | 416 |
| 20260621120000 | cat_phase_c_snapshots | 5647 |
| 20260621130000 | cat_phase_c_annotations | 4770 |
| 20260623120000 | cat_ai_project_settings_batch_introduction | 278 |
| 20260623131500 | cat_workflow_prep_dispatch_decouple | 6135 |
| 20260628120000 | cat_segments_mq_inserted_match | 83 |
| 20260629140000 | cat_assign_unify_uuid_resync | 10467 |
| 20260630120000 | test_mode_env_isolation | 14960 |
| 20260630130000 | cat_user_segment_markers | 988 |
| 20260630140000 | cat_user_ui_prefs_qa_report_surface | 326 |
| 20260702120000 | cat_ai_user_batch_prefs | 1092 |
| 20260703121703 | w5_fk_indexes | 3447 |
| 20260703121719 | w5_rls_initplan_stragglers | 577 |
| 20260703121737 | w5_merge_permissive_billing_policies | 2182 |
| 20260703154440 | w10_translator_row_read_tighten | 1392 |
| 20260703175926 | w10_fees_visible_mask_view | 2018 |
| 20260704024703 | w10_fees_translator_readonly | 2098 |
| 20260704030404 | w10_fees_write_admin_only_and_view | 2426 |
| 20260704032559 | w10_fees_write_admin_only_and_view | 2065 |
| 20260704180000 | cat_ai_model_registry | 8394 |
| 20260714024357 | cat_wf_assignment_sync_no_downgrade_v2 | 4567 |
| 20260714024418 | cat_wf_assignment_sync_no_downgrade_v2_sync | 8701 |
| 20260714071002 | cat_meta_items_display_map | 785 |
| 20260714071532 | cat_segments_patch_meta_items | 3660 |
| 20260714120000 | cat_wf_assignment_sync_no_downgrade | 14270 |
| 20260714130000 | cat_meta_items_display_map | 833 |
| 20260714140000 | cat_segments_patch_meta_items | 3832 |

**列數**：144

**備註**：DB 仍保留 `supabase_migrations._backup_20260430205338`（見 [`MIGRATION_HISTORY_REPAIR_2026-07-04.md`](MIGRATION_HISTORY_REPAIR_2026-07-04.md)）；本快照未改動該備份表。
