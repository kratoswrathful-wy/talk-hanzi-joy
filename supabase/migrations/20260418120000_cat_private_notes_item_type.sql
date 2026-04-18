-- 私人筆記：區分筆記／待辦與待辦完成狀態
alter table public.cat_private_notes
  add column if not exists item_type text not null default 'note';

alter table public.cat_private_notes
  add column if not exists todo_done boolean not null default false;

comment on column public.cat_private_notes.item_type is 'note | todo';
comment on column public.cat_private_notes.todo_done is 'only meaningful when item_type = todo';
