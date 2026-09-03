-- ============================================================================
-- Supabase'in testte GEREKEN parçalarının taklidi — düz bir Postgres'te
-- migration + RPC testini çalıştırabilmek için. Docker/`supabase start`
-- gerekmiyor (bkz. README "Testler").
--
-- ÜRETİMDE ÇALIŞTIRILMAZ. Supabase'in gerçek `auth` şeması bundan çok daha
-- geniş; burada yalnız test yolunun dokunduğu nesneler var.
-- ============================================================================
create schema if not exists extensions;
-- Supabase'te pgcrypto `extensions` şemasındadır; migration'lar ve testler
-- `extensions.digest` / `gen_random_bytes` bekliyor. `public`'e KURMAYIN:
-- iki şemaya birden kurulamaz, ilki kazanır ve nitelikli çağrılar patlar.
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end $$;
grant usage on schema public, extensions to anon, authenticated;

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key,
  instance_id        uuid,
  aud                text,
  role               text,
  email              text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at         timestamptz,
  updated_at         timestamptz
);

-- Supabase'in gerçek auth.uid()'i ile aynı davranış: JWT claim'lerinden `sub`.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
