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

## 3. Auth

The browser client in `app/supabase.ts` supports magic-link and Google OAuth
through Supabase Auth. The sign-in modal appears after the free detail-view
allowance is used.

## 4. Login tracking

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

## 5. Refresh tracking

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
