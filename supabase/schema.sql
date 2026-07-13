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

create table if not exists public.property_market_analysis (
  id uuid primary key default gen_random_uuid(),
  auction_id text not null,
  bank_property_id text,
  input_hash text not null,
  source_updated_at timestamp with time zone,
  provider text not null,
  model text not null,
  grounding_enabled boolean not null default true,
  property_snapshot jsonb not null,
  deterministic_analysis jsonb not null,
  search_context jsonb not null,
  raw_ai_analysis jsonb,
  processed_analysis jsonb not null,
  grounded_sources jsonb not null default '[]'::jsonb,
  status text not null,
  error_message text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.property_comparables (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references public.property_market_analysis(id) on delete cascade,
  auction_id text not null,
  comparable_type text not null,
  title text,
  locality text,
  property_type text,
  bhk numeric,
  built_up_area_sqft numeric,
  land_area_cents numeric,
  asking_price numeric,
  monthly_rent numeric,
  price_per_sqft numeric,
  source_name text,
  source_url text,
  published_or_updated_at timestamp with time zone,
  similarity_score numeric,
  match_reason text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  auction_id text,
  grounded boolean not null default false,
  request_count integer not null default 1,
  search_query_count integer,
  cached boolean not null default false,
  success boolean not null default false,
  error_code text,
  created_at timestamp with time zone not null default now()
);

alter table public.auctions enable row level security;
alter table public.catalog_snapshots enable row level security;
alter table public.refresh_runs enable row level security;
alter table public.login_events enable row level security;
alter table public.property_market_analysis enable row level security;
alter table public.property_comparables enable row level security;
alter table public.ai_usage_log enable row level security;

drop policy if exists "Public can read auctions" on public.auctions;
drop policy if exists "Public can read catalog snapshots" on public.catalog_snapshots;
drop policy if exists "Public can read refresh runs" on public.refresh_runs;
drop policy if exists "Authenticated users can create own login events" on public.login_events;
drop policy if exists "Authenticated users can read own login events" on public.login_events;
drop policy if exists "Public can read successful property market analysis" on public.property_market_analysis;
drop policy if exists "Public can read property comparables" on public.property_comparables;

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

create policy "Public can read successful property market analysis"
  on public.property_market_analysis
  for select
  using (status = 'success');

create policy "Public can read property comparables"
  on public.property_comparables
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

create unique index if not exists property_market_analysis_unique_idx
  on public.property_market_analysis (auction_id, input_hash, provider, model);

create index if not exists property_market_analysis_auction_idx
  on public.property_market_analysis (auction_id, created_at desc);

create index if not exists property_market_analysis_status_idx
  on public.property_market_analysis (status, created_at desc);

create index if not exists property_comparables_analysis_idx
  on public.property_comparables (analysis_id);

create index if not exists property_comparables_auction_idx
  on public.property_comparables (auction_id);

create index if not exists ai_usage_log_created_idx
  on public.ai_usage_log (created_at desc);

create index if not exists ai_usage_log_auction_created_idx
  on public.ai_usage_log (auction_id, created_at desc);

-- Use the Supabase service-role key only from cron/scraper jobs, never in the browser.
-- The frontend should use only NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
