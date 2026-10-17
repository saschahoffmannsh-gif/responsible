-- Responsible – Datenbank (nur rs_*-Tabellen; ge_* und hm_* bleiben unberührt)
create table if not exists public.rs_user(
  id text primary key, name text not null, name_lc text not null unique,
  salt text not null, iter int not null, pass_hash text not null,
  avatar text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.rs_session(
  token text primary key, usr text not null references public.rs_user(id) on delete cascade,
  created_at timestamptz not null default now(), seen_at timestamptz not null default now());
create index if not exists rs_session_usr on public.rs_session(usr);
create table if not exists public.rs_fail(k text primary key, n int not null, t timestamptz not null);
create table if not exists public.rs_meta(k text primary key, v jsonb);

create table if not exists public.rs_group(
  id text primary key, name text not null, kind text not null default 'family' check (kind in ('family','team')),
  image text, owner text not null references public.rs_user(id) on delete cascade,
  created_at timestamptz not null default now());
create table if not exists public.rs_member(
  grp text not null references public.rs_group(id) on delete cascade,
  usr text not null references public.rs_user(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  color text not null default '#467ba6', joined_at timestamptz not null default now(),
  primary key (grp, usr));
create index if not exists rs_member_usr on public.rs_member(usr);
create table if not exists public.rs_invite(
  token text primary key, grp text not null references public.rs_group(id) on delete cascade,
  created_by text references public.rs_user(id) on delete set null,
  created_at timestamptz not null default now(), expires_at timestamptz not null,
  max_uses int not null default 50, uses int not null default 0, revoked boolean not null default false);
create index if not exists rs_invite_grp on public.rs_invite(grp);

-- Generische, synchronisierte Datensätze je Gruppe:
-- coll: cal (Termine/Aufträge), todo (offener Pool), shop (Einkauf), feed (Kalenderquelle), fev (Termin aus Quelle/Müll), done (Bestätigung)
create sequence if not exists public.rs_seq;
create table if not exists public.rs_item(
  grp text not null references public.rs_group(id) on delete cascade,
  coll text not null, id text not null, data jsonb, deleted boolean not null default false,
  rev int not null default 1, seq bigint not null default nextval('public.rs_seq'),
  updated_by text, updated_at timestamptz not null default now(),
  primary key (grp, coll, id));
create index if not exists rs_item_seq on public.rs_item(grp, seq);
create or replace function public.rs_item_touch() returns trigger language plpgsql as $$
begin new.seq := nextval('public.rs_seq'); new.updated_at := now(); return new; end $$;
drop trigger if exists rs_item_touch on public.rs_item;
create trigger rs_item_touch before insert or update on public.rs_item for each row execute function public.rs_item_touch();

alter table public.rs_user enable row level security;
alter table public.rs_session enable row level security;
alter table public.rs_fail enable row level security;
alter table public.rs_meta enable row level security;
alter table public.rs_group enable row level security;
alter table public.rs_member enable row level security;
alter table public.rs_invite enable row level security;
alter table public.rs_item enable row level security;

-- Speicher für Profil- und Gruppenbilder (öffentlich lesbar über zufällige Pfade, Schreiben nur über die Function)
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('responsible', 'responsible', true, 1048576, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Cron: tägliche Aktualisierung der abonnierten ICS-Kalender
insert into public.rs_meta(k, v) values ('cron', to_jsonb(encode(gen_random_bytes(24), 'hex'))) on conflict (k) do nothing;
select cron.unschedule(jobid) from cron.job where jobname = 'rs-feeds';
select cron.schedule('rs-feeds', '17 3 * * *', $$
  select net.http_post(
    url := 'https://wlujgkbtpjxuekwsgnmg.supabase.co/functions/v1/responsible/cron',
    headers := jsonb_build_object('content-type','application/json','x-rs-cron', (select v #>> '{}' from public.rs_meta where k = 'cron')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$$);
