-- Tender alerts: one saved-search row per user. The app and website both read
-- and write this through the tender-alerts Netlify function (service key), and
-- the send-alerts scheduled job reads it to email matches.
--
-- Run this once in the Supabase SQL editor.

create table if not exists public.tender_alerts (
  user_id          uuid primary key,
  email            text not null,
  sectors          jsonb not null default '[]'::jsonb,   -- ["care","facilities"]
  service_types    jsonb not null default '[]'::jsonb,   -- ["home_care","supported_living"]
  regions          jsonb not null default '[]'::jsonb,   -- ["london","south_east"]
  value_band       text  not null default 'any',         -- any | u100k | 100k_500k | 500k_1m | 1m_5m | 5m_plus
  email_on         boolean not null default true,
  push_on          boolean not null default false,       -- reserved for push (needs a store build)
  frequency        text  not null default 'daily',       -- instant | daily | weekly
  last_notified_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- RLS is left OFF here to match the rest of the schema (a proper policy set is
-- part of the planned admin security build). All access goes through the
-- service-key functions, never the anon key, so no anon policy is added.
