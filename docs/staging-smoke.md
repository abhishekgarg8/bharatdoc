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

## Current Status

Last local validation: April 24, 2026.

- Local production smoke passed with `LIVE_FLOW_WEB_URL=http://127.0.0.1:3000 LIVE_FLOW_WORKER_URL=http://127.0.0.1:8080 pnpm smoke:live-flow`.
- The live smoke confirmed PostgREST visibility for `public.clinics`, `public.doctors`, `public.clinic_join_requests`, and `public.recordings`.
- The real AI/PDF flow completed with statuses: `transcribed`, `summary_ready`, and `pdf_saved`.
- Staging smoke is not yet runnable from this workspace because `.env` does not include `STAGING_WEB_URL` or `STAGING_WORKER_URL`.
