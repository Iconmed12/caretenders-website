-- Delivery board fields on review_charges.
-- Run this once in the Supabase SQL editor (Run, no RLS change needed; the board
-- is served by admin-only service-key functions).
--
-- delivery_status: 'todo' (paid, nobody started it) | 'in_progress' (a writer
-- claimed it) | 'delivered' (done and sent). Only PAID reviews ever appear on
-- the board, so this tracks the human work after the money is in.

alter table review_charges add column if not exists delivery_status text not null default 'todo';
alter table review_charges add column if not exists assigned_to  text;
alter table review_charges add column if not exists assigned_at  timestamptz;
alter table review_charges add column if not exists delivered_at timestamptz;
alter table review_charges add column if not exists delivered_by text;
