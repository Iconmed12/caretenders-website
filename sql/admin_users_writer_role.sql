-- Allow the new 'writer' role on admin_users.
--
-- Symptom this fixes: creating a Writer staff login fails with Postgres error
-- 23514 (check constraint violation) because admin_users.role has a CHECK that
-- only permits owner/manager/admin. The app code was updated to allow 'writer'
-- but the database constraint was not. Run this once in the Supabase SQL editor.
--
-- It drops whatever CHECK constraint on admin_users references the role column
-- (the name can vary), then adds one that includes 'writer'.

do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'admin_users'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table admin_users drop constraint %I', c.conname);
  end loop;
end $$;

alter table admin_users
  add constraint admin_users_role_check
  check (role in ('owner', 'manager', 'admin', 'writer'));
