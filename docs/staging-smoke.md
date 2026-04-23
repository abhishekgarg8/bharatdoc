# Staging Smoke Checks

Run after Vercel and Railway deploys have completed:

```bash
STAGING_WEB_URL=https://your-vercel-preview.example \
STAGING_WORKER_URL=https://your-railway-worker.example \
pnpm smoke:staging
```

The smoke script verifies:

- Railway worker `/health` returns the BharatDoc worker payload.
- Vercel serves the PWA manifest with standalone display.
- Core app-shell routes `/dashboard` and `/recordings/new` render HTML.

Before running this against a staging environment, confirm Supabase migrations and private `audio`, `pdfs`, and `assets` buckets are applied, and that Vercel/Railway environment variables match `.env`.
