# Kerala Auction Finder

A Kerala-focused BAANKNET auction finder for filtering, ranking, and inspecting
bank-listed auction properties.

The app is built as a Vinext/React frontend with static JSON fallback data,
Supabase database/auth support, GitHub Actions data refresh, and Cloudflare
Pages deployment.

## What Is Built

- BAANKNET auction listing UI
- Kerala-focused filters
- Ranking mode with Auction Score
- Property detail expansion
- BAANKNET notice/property outbound links
- Mobile-friendly filter drawer and auction cards
- Static JSON fallback data
- Supabase-backed data loading when configured
- Supabase magic-link login
- Supabase Google OAuth login
- Login gate after free auction actions
- Login event tracking schema and frontend insert
- On-demand Smart AI Score with market and rental analysis
- Server-side Gemini grounded comparable search API
- Daily GitHub Actions scrape/deploy workflow
- Cloudflare Pages build/deploy setup

## Current Local Path

```text
/Users/melvinjames/Documents/Codex/2026-07-11/hel
```

## Main Files

- `app/page.tsx`: main React UI, filters, ranking, auth modal, protected actions
- `app/globals.css`: all layout, desktop, and mobile styling
- `app/supabase.ts`: Supabase data/auth helpers and login-event writer
- `scripts/scrape_baanknet.py`: BAANKNET scraper
- `scripts/score_auctions.py`: scoring engine
- `scripts/push_to_supabase.py`: pushes scraped JSON into Supabase
- `scripts/prepare_cloudflare_pages.mjs`: prepares `dist-pages` for Cloudflare Pages
- `cloudflare/market-analysis-api.mjs`: Cloudflare server API for market analysis
- `public/data/auctions.json`: bundled auction data fallback
- `public/data/catalog.json`: bundled filter catalog fallback
- `public/data/area_profiles.json`: cached area profile/scoring support data
- `supabase/schema.sql`: Supabase tables, indexes, and RLS policies
- `.github/workflows/cloudflare-pages.yml`: daily scrape/build/deploy workflow
- `CLOUDFLARE_PAGES.md`: Cloudflare deployment notes
- `supabase/README.md`: Supabase setup and query notes

## Production Architecture

```text
User browser
  -> Cloudflare Pages
  -> Vinext/React auction finder
  -> Supabase Auth for login
  -> Supabase Postgres for auction data

GitHub Actions schedule/manual run
  -> BAANKNET scraper
  -> scoring engine
  -> Supabase data push
  -> Cloudflare Pages deployment
```

Current production URL:

```text
https://kerala-auction-finder.pages.dev
```

GitHub repository:

```text
https://github.com/theycallmeMJ/Auction-finder
```

Cloudflare Pages project:

```text
kerala-auction-finder
```

Supabase project URL:

```text
https://xpdduahsbxveogubysti.supabase.co
```

## Run Locally

Use the bundled Node/pnpm runtime if your shell does not have `node` or `pnpm`.

```bash
cd /Users/melvinjames/Documents/Codex/2026-07-11/hel
PATH=/Users/melvinjames/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  /Users/melvinjames/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm run dev
```

Open:

```text
http://localhost:3000
```

Stop a stuck local server:

```bash
lsof -ti tcp:3000 | xargs kill
lsof -ti tcp:3001 | xargs kill
```

Force stop if needed:

```bash
lsof -ti tcp:3000 | xargs kill -9
lsof -ti tcp:3001 | xargs kill -9
```

## Useful Commands

```bash
pnpm run dev
pnpm run build
pnpm run pages:build
pnpm run pages:deploy
python3 scripts/scrape_baanknet.py
python3 scripts/push_to_supabase.py
```

If `pnpm` is not available globally, use:

```bash
PATH=/Users/melvinjames/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
  /Users/melvinjames/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm run build
```

## Environment Variables

Local variables live in `.env.local`. Do not commit real secrets.

Public browser variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
NEXT_PUBLIC_ENABLE_GOOGLE_AUTH
VITE_ENABLE_GOOGLE_AUTH
NEXT_PUBLIC_FREE_PROTECTED_ACTIONS
VITE_FREE_PROTECTED_ACTIONS
NEXT_PUBLIC_AUTH_REDIRECT_URL
VITE_AUTH_REDIRECT_URL
```

Server/trusted job variable:

```text
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
GEMINI_MODEL
GEMINI_FALLBACK_MODELS
GEMINI_MODEL_COOLDOWN_MS
AI_PROVIDER
ENABLE_GOOGLE_SEARCH_GROUNDING
TAVILY_API_KEY
SEARCH_PROVIDER
```

Only use `SUPABASE_SERVICE_ROLE_KEY` from local scripts, cron, or GitHub Actions.
Never expose it in browser code.

Only set `GEMINI_API_KEY` as a Cloudflare Pages/Worker runtime secret or local
server-side variable. It must never be exposed as a `NEXT_PUBLIC_*` variable.

Production GitHub Actions secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

The Cloudflare token is used only by GitHub Actions to deploy to Pages. It
should have the minimum permissions needed for this project:

```text
Account -> Cloudflare Pages -> Edit
Account -> Account Settings -> Read
```

Cloudflare Pages production build env:

```text
NEXT_PUBLIC_FREE_PROTECTED_ACTIONS=10
VITE_FREE_PROTECTED_ACTIONS=10
NEXT_PUBLIC_AUTH_REDIRECT_URL=https://kerala-auction-finder.pages.dev
VITE_AUTH_REDIRECT_URL=https://kerala-auction-finder.pages.dev
```

## Data Flow

```text
BAANKNET
  -> scripts/scrape_baanknet.py
  -> public/data/auctions.json
  -> scripts/score_auctions.py
  -> optional scripts/push_to_supabase.py
  -> Supabase tables
  -> app/page.tsx
```

The frontend prefers Supabase when configured. If Supabase is missing or returns
no rows, it falls back to the static JSON files in `public/data`.

## GitHub Actions Refresh And Deploy

Workflow file:

```text
.github/workflows/cloudflare-pages.yml
```

Triggers:

- manual run from GitHub Actions using **Run workflow**
- daily schedule at `01:30 UTC`, which is `07:00 IST`

The workflow job is named `deploy`. It performs these steps:

1. Checkout repo
2. Setup Node 22
3. Setup pnpm 10
4. Install dependencies
5. Run `python3 scripts/scrape_baanknet.py`
6. Run `python3 scripts/push_to_supabase.py`
7. Commit refreshed `public/data/*.json`
8. Run `pnpm run pages:build`
9. Deploy `dist-pages` to Cloudflare Pages

The refresh step currently uses:

```text
BAANKNET_STATUSES=upcoming
BAANKNET_INCREMENTAL=1
BAANKNET_ENRICH_DETAILS=1
BAANKNET_ENRICH_LOCATION=1
BAANKNET_ENRICH_LIMIT=2000
BAANKNET_NEARBY_LIMIT=120
BAANKNET_SCORE=1
SUPABASE_REPLACE_STATUS_ROWS=1
```

Incremental mode compares fresh listing rows against the existing
`public/data/auctions.json` in the repo. If an auction ID/status is already
present and its listing signature is unchanged, the scraper reuses existing
detail fields instead of opening the BAANKNET detail page again.

When BAANKNET exposes map coordinates on the property page, the scraper stores
`latitude` and `longitude`. It then optionally enriches mapped properties with
nearby OpenStreetMap/Overpass evidence for schools/colleges, hospitals/clinics,
bus stands, and Kochi/Ernakulam metro stations. Missing map data is treated as
unknown, not as a negative signal.

Rows are re-enriched when the auction is new, key listing fields changed, or
the existing row has no captured detail fields. `SUPABASE_REPLACE_STATUS_ROWS=1`
clears old Supabase rows for the refreshed statuses before inserting the new
set, so expired or removed `upcoming` auctions do not linger in production.

The first full refresh can still take several minutes because it may need to
enrich many BAANKNET detail pages. Later daily runs should be much faster and
will print progress logs showing reused rows and detail pages still needed.

Manual run path:

```text
GitHub repo -> Actions -> Refresh BAANKNET data and deploy -> Run workflow
```

Manual runs have two modes:

```text
refresh_mode=normal
```

Runs the normal upcoming-auction refresh.

```text
refresh_mode=map-only
```

Runs `scripts/enrich_maps_only.py` against the existing `public/data/auctions.json`.
This skips listing search, auction-notice parsing, and possession refresh. It
only fills missing BAANKNET map coordinates and a capped batch of nearby
school/hospital/bus/metro evidence, then rescoring/push/deploy continues as
usual.

Use `nearby_limit` to control Overpass work for either mode. `120` is the safe
default; `300-500` is reasonable for a one-off catch-up run.

Expected success signs:

- GitHub Actions job ends green
- Cloudflare Pages deploy step prints a deployment URL
- Supabase `public.refresh_runs` gets a `success` row
- Supabase `public.auctions` row count updates

## Scraper

The scraper:

- starts a BAANKNET session
- reads CSRF/form fields
- calls BAANKNET AJAX search
- fetches upcoming/live/closed/cancelled statuses based on env
- parses listing cards
- optionally enriches each row from the auction notice detail page
- extracts richer fields such as EMD, increment price, inspection dates, branch,
  officer, borrower, property address, and area fields
- runs the scoring engine when enabled
- writes `public/data/auctions.json`, `catalog.json`, and area profile data

Useful scraper env vars:

```text
BAANKNET_STATE_ID=17
BAANKNET_DISTRICT_ID=
BAANKNET_STATUSES=upcoming,live,cancelled,closed
BAANKNET_INCREMENTAL=0
BAANKNET_DRY_RUN=0
BAANKNET_ENRICH_DETAILS=1
BAANKNET_ENRICH_LIMIT=1000
BAANKNET_SCORE=1
BAANKNET_MAX_CLOSED_PAGES=10
```

The GitHub workflow currently refreshes only upcoming auctions:

```text
BAANKNET_STATUSES=upcoming
BAANKNET_INCREMENTAL=1
BAANKNET_ENRICH_DETAILS=1
BAANKNET_ENRICH_LIMIT=2000
BAANKNET_SCORE=1
```

For a one-off full re-enrichment, run with `BAANKNET_INCREMENTAL=0`.

For a fast local check that only prints listing/merge counts and does not write
files, push data, build, or deploy:

```bash
BAANKNET_STATUSES=upcoming \
BAANKNET_INCREMENTAL=1 \
BAANKNET_DRY_RUN=1 \
BAANKNET_SCORE=0 \
python3 scripts/scrape_baanknet.py
```

## UI Functionality

The main UI supports:

- status tabs: Upcoming, Live, Closed, Cancelled
- state filter
- district filter
- city filter
- property type filter
- property subtype filter
- possession status filter
- loan availability filter
- min/max reserve price
- keyword search
- quick district pills
- quick price-band pills
- sort by soonest, latest, score, price low/high
- Search mode
- Rank mode
- top ranked area cards
- active filter chips
- load-more pagination
- mobile filter drawer
- mobile auction KPI row
- score breakdown accordion
- auction detail accordion
- AI market check inside auction details
- protected BAANKNET notice/property links

## Smart AI Score And Market Analysis

The property detail accordion includes **Generate Smart AI Score**. The browser calls:

```text
POST /api/properties/:auctionId/market-analysis
```

The Cloudflare worker:

1. loads the full auction row from Supabase using `auction_id`
2. normalises area, price, location and property fields
3. calculates deterministic completeness and preliminary scores
4. builds comparable sale/rental search context
5. checks `property_market_analysis` for an existing successful analysis for that auction
6. calls Tavily for sale/rental comparable search when configured
7. sends the auction facts, confirmed nearby location evidence, and Tavily evidence to Gemini for structured extraction
8. validates and post-processes comparables in application code
9. writes analysis, comparables and usage logs back to Supabase
10. returns a graceful deterministic fallback if search/Gemini is unavailable

The Smart AI Score is the investment-style summary returned by the same market
analysis endpoint. The market value cards remain separate and continue to show
comparable asking prices, adjusted market range, auction discount, rent, and
yield. Confirmed nearby schools/hospitals/bus/metro distances improve the
location part of the Smart AI Score only when daily sync has captured them.

Required Cloudflare runtime variables:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
GEMINI_MODEL
GEMINI_FALLBACK_MODELS=gemini-3.1-flash-lite,gemini-2.5-flash,gemini-3-flash
GEMINI_MODEL_COOLDOWN_MS=900000
AI_PROVIDER=gemini
ENABLE_GOOGLE_SEARCH_GROUNDING=false
TAVILY_API_KEY
SEARCH_PROVIDER=tavily
```

Tavily is the preferred comparable-search provider because it keeps web search
separate from Gemini reasoning and avoids Google Search Grounding quota surprises.
If `GEMINI_MODEL` hits quota or rate limits, the worker automatically tries
models listed in `GEMINI_FALLBACK_MODELS` from left to right before falling back
to cached or deterministic analysis. The response and usage log store the actual
Gemini model that succeeded. A quota-limited model is also placed on a best-effort
in-memory cooldown (`GEMINI_MODEL_COOLDOWN_MS`, default 15 minutes) so the same
running worker/local process skips it instead of repeatedly trying the exhausted
model first.
Once a successful Tavily-backed analysis exists for an `auction_id`, the worker
reuses it permanently and does not call Tavily again for that auction. Gemini
grounding remains optional for future use, but it may require a billing-enabled
Google AI/Gemini project. Without search/Gemini configuration, the endpoint still
returns deterministic data quality and preliminary analysis with a clear message.

Cache and usage tables:

```text
property_market_analysis
property_comparables
ai_usage_log
```

## Scoring

Auction Score is calculated from:

- Area Score
- Property Score
- Risk Score
- Confidence Score
- Bonus Score

Weights used in the UI:

```text
Area: 35%
Property: 25%
Risk: 20%
Confidence: 10%
Bonus: 10%
```

Current scoring is heuristic and based on available scraped data plus cached
area profiles. It is good enough for ranking and discovery, but not a financial
valuation model.

## Auth And Login Gate

The app allows a small number of free protected actions before asking users to
sign in.

Deep actions consume the free allowance:

- opening full auction details
- opening official BAANKNET notice/property links

After the allowance is exhausted, most interactive actions also require login:

- changing filters
- resetting filters
- sorting results
- switching Search/Rank modes
- opening score explanations
- using quick district or price-band pills
- loading more results

Current allowance:

```text
FREE_PROTECTED_ACTIONS = NEXT_PUBLIC_FREE_PROTECTED_ACTIONS or VITE_FREE_PROTECTED_ACTIONS or 2
```

Local default is 2, so the login modal appears on the third deep action. For
production, set `NEXT_PUBLIC_FREE_PROTECTED_ACTIONS=10` in Cloudflare Pages to
allow ten deep actions before sign-in. After the allowance is exhausted, most
app interactions are blocked until the user signs in.

Supported sign-in options:

- Google OAuth through Supabase
- Email magic link through Supabase

Google setup requires:

- Google Cloud OAuth client
- Supabase Google provider enabled
- Supabase callback URL registered in Google
- app URL configured in Supabase URL Configuration

Supabase callback URL currently used:

```text
https://xpdduahsbxveogubysti.supabase.co/auth/v1/callback
```

App URLs to allow in Supabase:

```text
http://localhost:3000
https://kerala-auction-finder.pages.dev
```

Supabase Auth URL Configuration should be:

```text
Site URL: https://kerala-auction-finder.pages.dev
Redirect URLs:
  http://localhost:3000
  http://localhost:3000/*
  https://kerala-auction-finder.pages.dev
  https://kerala-auction-finder.pages.dev/*
```

If the Site URL is left as `http://localhost:3000`, Google/magic-link login can
circle back to localhost even when the user started from production.

## Login History Tracking

The code now supports a custom `public.login_events` table.

After successful Supabase redirect login, the frontend inserts one event with:

- user id
- email
- provider
- source
- current path
- browser user agent
- timestamp

The app uses a local duplicate guard so page refreshes do not create repeated
events for the same session.

Run `supabase/schema.sql` in Supabase SQL Editor to create this table.

Query recent login events:

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

Status: code is implemented, but the remote Supabase project still needs the
latest SQL run if the table has not been created yet.

## Supabase Database

Tables in `supabase/schema.sql`:

- `public.auctions`
- `public.catalog_snapshots`
- `public.refresh_runs`
- `public.login_events`

`auctions` stores searchable columns plus the full auction JSON payload.

`catalog_snapshots` stores filter metadata.

`refresh_runs` stores the status and row counts for each scheduled or local
data push.

`login_events` stores app-level login history.

RLS is enabled. Public read is enabled for auction/catalog data. Login-event
writes are limited to authenticated users writing their own row.

Push scraped data to Supabase:

```bash
python3 scripts/push_to_supabase.py
```

Important Supabase setup:

- Run `supabase/schema.sql` in Supabase SQL Editor.
- If policies already exist, create only the missing tables/indexes/policies.
- Keep the service-role key only in `.env.local` or GitHub secrets.
- Use the anon key only in browser/public env variables.

Check latest refresh runs:

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

Check auction data freshness:

```sql
select
  count(*) as total_rows,
  max(scraped_at) as latest_scraped_at
from public.auctions;
```

Check latest catalog snapshot:

```sql
select
  kind,
  created_at
from public.catalog_snapshots
order by created_at desc;
```

## Hosting

Cloudflare Pages build settings:

```text
Framework preset: None
Build command: pnpm run pages:build
Build output directory: dist-pages
Node.js version: 22
Compatibility date: 2026-05-15
Compatibility flags: nodejs_compat
```

The `pages:build` command runs Vinext build and prepares `dist-pages` with a
Cloudflare `_worker.js` wrapper that serves static assets/data correctly.

Cloudflare deployment is currently handled by GitHub Actions using
`cloudflare/wrangler-action@v3`. Local manual deployment is still possible:

```bash
pnpm run pages:build
pnpm run pages:deploy
```

If local `node` or `pnpm` is missing, use the bundled Codex runtime command from
the **Run Locally** section.

## Daily Refresh Workflow

`.github/workflows/cloudflare-pages.yml` runs daily at:

```text
01:30 UTC
```

It:

1. installs dependencies
2. scrapes upcoming BAANKNET auctions
3. reuses existing enriched details for unchanged rows
4. enriches only new or changed auction detail pages
5. stores BAANKNET map coordinates when available
6. enriches a capped set of mapped properties with nearby school/hospital/bus/metro evidence
7. scores auctions
8. replaces Supabase rows for refreshed statuses and records a `refresh_runs` status row
9. commits refreshed `public/data/*.json`
10. builds Cloudflare Pages output with production action limit set to 10
11. deploys to Cloudflare Pages

Manual `map-only` mode changes step 2-6 to:

1. load existing `public/data/auctions.json`
2. find rows missing `latitude`/`longitude`
3. fetch BAANKNET property-page coordinates where available
4. find mapped rows missing `nearbyPlaces`
5. fetch a capped batch of OpenStreetMap/Overpass nearby evidence
6. rescore auctions using confirmed location evidence

Required GitHub secrets:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Troubleshooting:

- If the scraper step is slow, open the `Refresh upcoming auctions` step logs.
  Incremental refresh should print how many existing enriched rows were reused
  and how many detail pages still need to be fetched.
- If Supabase push fails, confirm `SUPABASE_SERVICE_ROLE_KEY` and
  `NEXT_PUBLIC_SUPABASE_URL` repo secrets.
- If Cloudflare deploy fails, confirm `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` repo secrets.
- If `refresh_runs` is missing, rerun the latest `supabase/schema.sql`.
- If the website still shows older data, check whether the workflow reached the
  Cloudflare deployment step.

## What Is Done

- Kerala auction finder UI
- interactive filters
- ranking and score breakdown
- richer auction details
- reserve price parsing fix for Lakh/Crore and comma values
- mobile layout improvements
- scrollable mobile filters
- detail/link login gate
- Supabase data loading
- Supabase push script
- Supabase auth helpers
- Google OAuth flow support
- magic-link flow support
- login event tracking code
- refresh run tracking code
- incremental refresh that skips unchanged detail pages
- Supabase stale status cleanup during refresh push
- Cloudflare Pages deployment setup
- daily GitHub Actions refresh/deploy workflow

## Pending / Next

- Confirm first GitHub Actions refresh/deploy run finishes successfully
- Confirm `refresh_runs` shows a success row after the first scheduled/manual run
- Confirm Google OAuth works on both `localhost:3000` and Cloudflare production URL
- Add a small admin-only page or script to view login events without opening Supabase SQL
- Add saved searches/watchlists for signed-in users
- Add email alerts for matching auctions
- Add payments/subscription gating if needed
- Improve area scoring with real OpenStreetMap/Nominatim enrichment
- Improve market-value/discount estimates with historical auction and local market data
- Add robust scraper tests or snapshot fixtures
- Add monitoring for BAANKNET layout/API changes
- Add privacy/terms copy before broader public launch

## Known Notes

- BAANKNET scraping should be done respectfully and at low frequency.
- Some fields can still be blank when BAANKNET does not expose them consistently.
- Scoring is directional, not legal/financial advice.
- Supabase Auth Admin API shows current users and last sign-in, but full auth
  audit logs are not exposed through this project REST API. That is why
  `login_events` was added.
- Refresh history is tracked in `public.refresh_runs` after the latest schema is
  applied in Supabase.
- Keep service-role keys out of browser code and public commits.
