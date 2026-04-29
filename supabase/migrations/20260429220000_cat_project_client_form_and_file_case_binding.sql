alter table public.cat_projects
  add column if not exists client_question_form_url text not null default '';

alter table public.cat_files
  add column if not exists related_lms_case_id uuid null;

alter table public.cat_files
  add column if not exists related_lms_case_title text not null default '';
