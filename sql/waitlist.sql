-- Pre-launch waitlist: people who asked to be emailed when Cana Bids goes live.
-- Captures the referrer so we can see HOW people are finding us. Written only by
-- the waitlist-signup function (service key).
--
-- Run this once in the Supabase SQL editor.

create table if not exists public.waitlist (
  email       text primary key,
  referer     text,        -- the page that sent them (how they found us)
  user_agent  text,
  created_at  timestamptz not null default now()
);

-- RLS left OFF like the rest of the schema; only the service-key function writes here.
