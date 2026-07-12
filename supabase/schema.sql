create table if not exists public.auctions (
  auction_id text not null,
  status text not null,
  bank_property_id text,
  title text not null,
  reserve_price numeric,
  state text,
  district text,
  city text,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  possession_status text,
  score integer,
  payload jsonb not null,
  scraped_at timestamp with time zone not null default now(),
  primary key (auction_id, status)
);

create index if not exists auctions_status_idx on public.auctions (status);
create index if not exists auctions_location_idx on public.auctions (state, district, city);
create index if not exists auctions_price_idx on public.auctions (reserve_price);
create index if not exists auctions_score_idx on public.auctions (score desc nulls last);
create index if not exists auctions_start_at_idx on public.auctions (start_at);
create index if not exists auctions_payload_gin_idx on public.auctions using gin (payload);

create table if not exists public.catalog_snapshots (
  kind text primary key,
  payload jsonb not null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.refresh_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'unknown',
  status text not null default 'running',
  started_at timestamp with time zone not null default now(),
  finished_at timestamp with time zone,
  auction_count integer not null default 0,
  catalog_pushed boolean not null default false,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  email text,
  provider text,
  source text,
  path text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

alter table public.auctions enable row level security;
alter table public.catalog_snapshots enable row level security;
alter table public.refresh_runs enable row level security;
alter table public.login_events enable row level security;

create policy "Public can read auctions"
  on public.auctions
  for select
  using (true);

create policy "Public can read catalog snapshots"
  on public.catalog_snapshots
  for select
  using (true);

create policy "Public can read refresh runs"
  on public.refresh_runs
  for select
  using (true);

create index if not exists refresh_runs_started_idx
  on public.refresh_runs (started_at desc);

create index if not exists refresh_runs_status_idx
  on public.refresh_runs (status);

create policy "Authenticated users can create own login events"
  on public.login_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Authenticated users can read own login events"
  on public.login_events
  for select
  to authenticated
  using (auth.uid() = user_id);

create index if not exists login_events_user_created_idx
  on public.login_events (user_id, created_at desc);

create index if not exists login_events_created_idx
  on public.login_events (created_at desc);

-- Use the Supabase service-role key only from cron/scraper jobs, never in the browser.
-- The frontend should use only NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
