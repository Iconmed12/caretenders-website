-- One row per device push token. A user can have several (phone, tablet). The
-- app registers a token through the register-push function (service key), and
-- send-alerts reads them to deliver push notifications via Expo's push service.
--
-- Run this once in the Supabase SQL editor.

create table if not exists public.push_tokens (
  token       text primary key,          -- Expo push token, unique per install
  user_id     uuid not null,
  email       text,
  platform    text,                      -- ios | android
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

-- RLS left OFF like the rest of the schema. Only the service-key functions
-- (register-push, send-alerts) ever touch this table, never the anon key.
