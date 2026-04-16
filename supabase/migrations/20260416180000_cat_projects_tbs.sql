alter table public.cat_projects
  add column if not exists read_tbs text[] not null default '{}',
  add column if not exists write_tb text default null;
