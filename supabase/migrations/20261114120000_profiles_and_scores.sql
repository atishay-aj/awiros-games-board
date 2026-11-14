-- Awiros Games: one profile per Google account that joined, and their daily scores.
-- Browsers never touch these tables: only the `api` Edge Function (service role) does.

create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  handle       text not null unique check (handle ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  email        text,
  joined_at    timestamptz not null default now()
);

create table public.scores (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (user_id) on delete cascade,
  played_on  date not null,
  game       text not null check (game in ('krillion', 'perceptle', 'chainle', 'worldle', 'wordle', 'maptap', 'globle')),
  value      integer not null check (value between 0 and 1000000),
  label      text not null check (char_length(label) between 1 and 60),
  puzzle     integer,
  detail     jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 4000),
  pasted     text check (char_length(pasted) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, played_on, game)
);

create index scores_played_on_idx on public.scores (played_on desc);

alter table public.profiles enable row level security;
alter table public.scores enable row level security;

revoke all on table public.profiles, public.scores from anon, authenticated;
grant select, insert, update, delete on table public.profiles, public.scores to service_role;

-- Removing someone: Authentication → Users → delete their account in the Supabase
-- dashboard. Their profile and scores are removed with it.
