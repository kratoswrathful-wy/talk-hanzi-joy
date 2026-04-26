-- Per-file which special-instruction ids apply (ids match ai project settings special_instructions JSON)
alter table public.cat_files
  add column if not exists applicable_special_instruction_ids jsonb not null default '[]'::jsonb;

comment on column public.cat_files.applicable_special_instruction_ids is
  'Array of numeric ids matching project-level special instruction entries. Single source of truth for file↔instruction mapping.';
