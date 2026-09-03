-- Secure admin bootstrap: replace the unsafe "first registered user becomes admin" flow.
-- Run this after the admin account exists in Supabase Auth.
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from public.profiles
where lower(email) = lower('itssohailsodhar@gmail.com')
on conflict (user_id, role) do nothing;
