-- Tender claim/lock: stop two staff working the same pending tender at once.
-- locked_by holds the email of whoever claimed it, locked_at when they claimed.
-- A claim auto-expires after 15 minutes of inactivity (enforced in the function),
-- so a tender never gets stuck if someone forgets to release it or logs off.
-- No deletes involved: the lock is just two nullable columns, set and cleared by
-- the admin-tender-lock server function (service key).

alter table tenders add column if not exists locked_by  text;
alter table tenders add column if not exists locked_at  timestamptz;

-- Helps the "is this still locked" lookups stay quick.
create index if not exists tenders_locked_by_idx on tenders (locked_by);
