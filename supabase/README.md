# Supabase setup

This project can keep using the bundled JSON files, or read auction data from
Supabase when these public browser variables are set:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are also
accepted for compatibility, but this Vinext/Vite app exposes `VITE_*` variables
to browser code.

## 1. Create tables

Open the Supabase SQL editor and run:

```sql
-- paste supabase/schema.sql here
```

The tables use row level security with public read policies. Writes should only
come from trusted jobs that use the service-role key.

Tables created by `schema.sql`:

- `public.auctions`: searchable auction rows plus full JSON payload
- `public.catalog_snapshots`: latest filter/catalog metadata
- `public.refresh_runs`: one row per scraper/Supabase push run
- `public.login_events`: app-level login history after successful sign-in
- `public.property_market_analysis`: cached AI market-analysis responses
- `public.property_comparables`: sale/rental comparables extracted from analysis
- `public.ai_usage_log`: provider usage and success/failure logging

If Supabase warns that a policy already exists, the database was partially set
up earlier. Create only the missing tables/indexes/policies or drop/recreate
only policies, never production data tables unless you intentionally want to
wipe data.

## 2. Seed current data

Create a local `.env` or export these values in your terminal:

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Then push the generated BAANKNET JSON into Supabase:

```bash
python3 scripts/push_to_supabase.py
```

After that, the frontend will prefer Supabase data when
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are available,
and fall back to `/public/data/*.json` when they are not.

Each push also writes a row to `public.refresh_runs`, so scheduled refreshes
can be audited later.

## 3. GitHub Actions production refresh

The production workflow lives at:

```text
.github/workflows/cloudflare-pages.yml
```

It runs manually and daily at `01:30 UTC` / `07:00 IST`.

Required GitHub repository secrets:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

The Supabase service-role key is required because the workflow replaces auction
rows and writes refresh status rows. Do not expose it to browser code.

Workflow data steps:

1. scrape upcoming BAANKNET auctions
2. reuse existing enriched fields for unchanged auctions
3. enrich only new or changed auction detail pages
4. score auctions
5. clear old Supabase rows for refreshed statuses, usually `upcoming`
6. push `public.auctions`
7. push `public.catalog_snapshots`
8. write `public.refresh_runs`
9. deploy the updated frontend to Cloudflare Pages

Production refresh env:

```text
BAANKNET_STATUSES=upcoming
BAANKNET_INCREMENTAL=1
BAANKNET_ENRICH_DETAILS=1
BAANKNET_ENRICH_LIMIT=2000
BAANKNET_SCORE=1
SUPABASE_REPLACE_STATUS_ROWS=1
```

`SUPABASE_REPLACE_STATUS_ROWS=1` prevents stale upcoming auctions from staying
in Supabase after BAANKNET removes or expires them.

## 4. Auth

The browser client in `app/supabase.ts` supports magic-link and Google OAuth
through Supabase Auth. The sign-in modal appears after the free detail-view
allowance is used.

## 5. Login tracking

Run the latest `supabase/schema.sql` in the SQL editor to create
`public.login_events`.

The app records one login event after a successful Supabase redirect sign-in.
Rows include:

- `user_id`
- `email`
- `provider`
- `source`
- `path`
- `user_agent`
- `created_at`

To inspect recent login history in Supabase SQL editor:

```sql
select
  created_at,
  email,
  provider,
  source,
  path,
  user_agent
from public.login_events
order by created_at desc
limit 50;
```

## 6. Refresh tracking

Run the latest `supabase/schema.sql` in the SQL editor to create
`public.refresh_runs`.

`scripts/push_to_supabase.py` creates a `running` row at the beginning of each
push, then updates it to `success` or `failed`.

To inspect the latest refreshes:

```sql
select
  started_at,
  finished_at,
  status,
  source,
  auction_count,
  catalog_pushed,
  error_message
from public.refresh_runs
order by started_at desc
limit 20;
```

To verify latest auction/catalog writes:

```sql
select
  count(*) as total_rows,
  max(scraped_at) as latest_scraped_at
from public.auctions;

select
  kind,
  created_at
from public.catalog_snapshots
order by created_at desc;
```

## 7. AI market analysis

The Cloudflare worker endpoint is:

```text
POST /api/properties/:auctionId/market-analysis
```

It uses the service-role key server-side to read the full auction record, cache
the analysis, write comparable rows, and log usage. Browser code never receives
the service-role key or Gemini key.

Required Cloudflare runtime variables:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
GEMINI_MODEL
AI_PROVIDER=gemini
ENABLE_GOOGLE_SEARCH_GROUNDING=true
```

Inspect latest AI analysis cache rows:

```sql
select
  auction_id,
  provider,
  model,
  grounding_enabled,
  status,
  error_message,
  created_at
from public.property_market_analysis
order by created_at desc
limit 20;
```

Inspect AI usage:

```sql
select
  provider,
  model,
  auction_id,
  grounded,
  cached,
  success,
  error_code,
  created_at
from public.ai_usage_log
order by created_at desc
limit 50;
```
