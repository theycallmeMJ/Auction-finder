# Cloudflare Pages Deployment

This app can be hosted on Cloudflare Pages for a cleaner free URL such as:

```text
https://kerala-auction-finder.pages.dev
```

## Option 1: Deploy From GitHub

1. Push this project to a GitHub repository.
2. In Cloudflare, create a Pages project from that repository.
3. Use these build settings:

```text
Framework preset: None
Build command: pnpm run pages:build
Build output directory: dist-pages
Node.js version: 22
```

4. Add these GitHub repository secrets if you want the included daily refresh workflow to deploy automatically:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

The workflow runs daily at `01:30 UTC`, refreshes upcoming BAANKNET auctions,
commits `public/data/*.json`, builds, and deploys to Cloudflare Pages.

## Option 2: Deploy From This Machine

After logging in to Wrangler:

```bash
pnpm run pages:deploy
```

That command builds the app, prepares `dist-pages`, and deploys it to a
Cloudflare Pages project named `kerala-auction-finder`.

## Current Data Model

There is no database yet. Auction data is bundled as JSON:

```text
public/data/auctions.json
public/data/catalog.json
public/data/area_profiles.json
```

Supabase can be added later for login, saved searches, payments, and user-level
access.
