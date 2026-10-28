-- Responsible 1.1: Verläufe (Nachrichten/Bilder/Sprachnachrichten/Erinnerungen) und Web Push
-- Nachrichten liegen als rs_item mit coll = 'msg' (data.thread verweist auf den Verlauf eines Termins/Auftrags).
create index if not exists rs_item_msg_thread on public.rs_item(grp, (data->>'thread')) where coll = 'msg';
create index if not exists rs_item_rem_due on public.rs_item(((data->>'at'))) where coll = 'msg' and deleted = false and data->>'type' = 'reminder' and data->>'sent' is null;

-- Privater Speicher für Anhänge (nur über signierte URLs abrufbar)
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('responsible-media', 'responsible-media', false, 4194304,
  array['image/jpeg','audio/mp4','audio/webm','audio/ogg','audio/mpeg','audio/aac','audio/x-m4a'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table public.rs_meta add column if not exists t timestamptz not null default now();

-- Push-Abos je Gerät
create table if not exists public.rs_push(
  endpoint text primary key,
  usr text not null references public.rs_user(id) on delete cascade,
  p256dh text not null, auth text not null, ua text,
  created_at timestamptz not null default now(), last_ok timestamptz, fails int not null default 0);
create index if not exists rs_push_usr on public.rs_push(usr);
alter table public.rs_push enable row level security;

-- VAPID-Schlüssel (nur Service-Role liest rs_meta)
insert into public.rs_meta(k, v) values ('vapid', '{"publicKey":"<öffentlich>","privateKey":"<geheim – nur in der DB>"}'::jsonb) on conflict (k) do nothing;

-- Cron: jede Minute fällige Erinnerungen versenden
select cron.unschedule(jobid) from cron.job where jobname = 'rs-reminders';
select cron.schedule('rs-reminders', '* * * * *', $$
  select net.http_post(
    url := 'https://wlujgkbtpjxuekwsgnmg.supabase.co/functions/v1/responsible/cron',
    headers := jsonb_build_object('content-type','application/json','x-rs-cron', (select v #>> '{}' from public.rs_meta where k = 'cron')),
    body := '{"job":"reminders"}'::jsonb, timeout_milliseconds := 30000);
$$);
