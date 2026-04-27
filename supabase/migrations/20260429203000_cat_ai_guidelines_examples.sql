-- CAT AI Guidelines: add examples payload for inline exemplar cards
alter table if exists public.cat_ai_guidelines
  add column if not exists examples jsonb not null default '[]'::jsonb;

comment on column public.cat_ai_guidelines.examples is
  '準則條目範例清單（JSONB）：[{id,state(ok|bad|neutral),src,tgt,note}]';
