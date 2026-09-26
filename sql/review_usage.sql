-- Included expert reviews used by members (free, plan-covered).
-- Counted per calendar month and shared across a company circle.
-- RLS is ON with no policies, so only the service key can read/write,
-- matching how tender_requests is secured.
--
-- Run once in the Supabase SQL editor.

create table if not exists public.review_usage (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid,
  tender_id text,
  review_type text not null check (review_type in ('response','full')),
  created_at timestamptz not null default now()
);

alter table public.review_usage enable row level security;

create index if not exists review_usage_lookup_idx
  on public.review_usage (email, review_type, created_at);
