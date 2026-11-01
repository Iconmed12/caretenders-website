-- Pay-on-account charges for extra reviews (beyond a plan's included allowance).
-- A member requests a review in the app; a row is created here and the card on
-- file is charged immediately (server-side Stripe, off-session - NOT an in-app
-- purchase, so no Apple/Google cut). The team is notified when a charge is paid
-- so the review can be delivered. Written only by the service-key functions.
--
-- Run this once in the Supabase SQL editor.

create table if not exists public.review_charges (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  email            text not null,
  review_type      text not null,              -- 'response' | 'full'
  tender_id        text,
  tender_title     text,
  amount           integer not null,           -- pence (PLACEHOLDER prices for now)
  status           text not null default 'pending',  -- pending | paid | failed
  stripe_payment_intent text,
  fail_reason      text,
  created_at       timestamptz not null default now(),
  paid_at          timestamptz
);

create index if not exists review_charges_user_idx on public.review_charges (user_id);

-- RLS left OFF like the rest of the schema; only the service-key functions touch it.
