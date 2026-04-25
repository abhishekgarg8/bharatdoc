# BharatDoc Production QA Results

Date: 2026-04-24

## Scope Executed

- Production web shell: `https://bharatdoc-web.vercel.app/`
- Production worker health: `https://bharatdocworker-production.up.railway.app/health`
- Supabase email signup and confirmation via Gmail
- Owner login and create-clinic onboarding attempt
- Authenticated API probes for `/api/me` and `/api/auth/register`

## Passing Evidence

- Worker health returned `200 {"ok":true,"service":"bharatdoc-worker"}`.
- PWA manifest returned `200` with `name: "BharatDoc"` and `display: "standalone"`.
- Unauthenticated `/dashboard` redirects to `/onboarding`.
- Fresh production confirmation link returned an access token and the confirmed user could log in with email/password.
- 2026-04-24 20:14 IST rerun: `/api/me` now returns expected `404 PROFILE_NOT_FOUND` for a confirmed user with no doctor profile.
- Owner clinic registration now returns `200` and redirects to `/dashboard`.
- Owner dashboard loads with the owner name, empty consultations, search entry, settings entry, bottom navigation, and start-recording CTA.
- Doctor signup and join request now pass: Gmail confirmation works, clinic lookup for `R2BJZZ` returns `200`, join request returns `200`, and protected routes redirect pending doctors to `/pending-approval`.

## Blocking Finding

**Resolved: Production web API env validation.**

Latest debug after Supabase CLI access:

- Supabase CLI lists the linked project as `jtezgoegatwbvdqeogiy`.
- Supabase CLI shows both the anon and service-role JWT refs for that project match `jtezgoegatwbvdqeogiy`.
- The latest production onboarding bundle also embeds an anon JWT whose ref is `jtezgoegatwbvdqeogiy`, so the previously observed deployed anon-key mismatch appears fixed.
- A confirmed production user can log in and reaches the profile step.
- `GET /api/me` still returns `400 VALIDATION_ERROR`.
- `POST /api/auth/register` still returns `400 VALIDATION_ERROR`.

Because `/api/me` has no request body, the validation error is coming from server runtime validation, not user input. In this codebase, `/api/me` calls `createSupabaseServerClient()`, which calls `getWebEnv()`, which validates the entire `WebEnvSchema`.

Required web env vars include:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_RAILWAY_WORKER_URL`
- `RAILWAY_WORKER_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Current local `.env` still has `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the old `lnsccuqehnvafgmsahft` project and is missing `NEXT_PUBLIC_RAILWAY_WORKER_URL`. The deployed recording bundle also does not contain the Railway worker URL literal, which is consistent with `NEXT_PUBLIC_RAILWAY_WORKER_URL` being unset at build/deploy time.

Latest rerun: this specific blocker is resolved for `/api/me` and `/api/auth/register`. Continue production QA from T04.

Previous blocker before the rerun:

After a confirmed production email/password login, the UI reaches the profile and clinic steps. Submitting the create-clinic form fails with:

```json
{"error":{"code":"VALIDATION_ERROR","message":"Request validation failed."}}
```

Observed API responses:

- `GET /api/me` after login: `400`
- `POST /api/auth/register` with current UI payload: `400 VALIDATION_ERROR`
- `POST /api/auth/register` without `medical_reg_no`: `400 VALIDATION_ERROR`
- `POST /api/auth/register` with camelCase profile key: `400 VALIDATION_ERROR`
- `POST /api/auth/register` with old flat PRD payload: `400 VALIDATION_ERROR`

This blocks owner onboarding, doctor join requests, approvals, recording, transcription, summary, PDF, search, settings, and session persistence testing in production.

## Open Findings

**P2: Pending approval screen shows demo clinic details for real pending doctors.**

After joining clinic `R2BJZZ`, the pending screen displays `Sunrise Clinic`, code `MED42X`, owner `Dr. Kavita Rao`, and an old request date. Route guarding works, but the screen is not using the live pending request data.

## Required Fix

Update the web deployment environment and redeploy Vercel:

- Set `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the anon key for `jtezgoegatwbvdqeogiy`.
- Set `NEXT_PUBLIC_RAILWAY_WORKER_URL=https://bharatdocworker-production.up.railway.app`.
- Confirm `RAILWAY_WORKER_URL=https://bharatdocworker-production.up.railway.app`.
- Confirm `SUPABASE_URL=https://jtezgoegatwbvdqeogiy.supabase.co`.
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is the service-role key for `jtezgoegatwbvdqeogiy`.
- Set `NEXT_PUBLIC_SITE_URL=https://bharatdoc-web.vercel.app/`.
- Set `NEXT_PUBLIC_ENABLE_DEMO_MODE=false`.

After redeploy, `/api/me` for a logged-in user with no doctor profile should return `404 PROFILE_NOT_FOUND`, not `400 VALIDATION_ERROR`.

## Configuration Signals

- The latest production browser bundle calls Supabase project `jtezgoegatwbvdqeogiy` with a matching anon JWT ref.
- This repo’s local `.env` still has mixed project values: Supabase URLs point at `jtezgoegatwbvdqeogiy`, while `NEXT_PUBLIC_SUPABASE_ANON_KEY` points at `lnsccuqehnvafgmsahft`.
- This repo’s local `.env` is missing `NEXT_PUBLIC_RAILWAY_WORKER_URL`.
- Vercel CLI under the currently logged-in account cannot inspect `bharatdoc-web.vercel.app`; the deployment is not under that Vercel context, so production env values could not be read directly.
- Admin-created fallback users in the local `.env` project cannot sign into production, confirming the projects differ.
- The production signup request sends `redirect_to` for a Vercel preview URL, while the received email link falls back to `https://bharatdoc-web.vercel.app/`.

## Screenshots

- `test/screenshots/t01-home-onboarding-mobile.png`
- `test/screenshots/t01-dashboard-redirect-mobile.png`
- `test/screenshots/t01-onboarding-desktop.png`
- `test/screenshots/t02-owner-prod-signup-filled.png`
- `test/screenshots/t02-owner-prod-signup-after-submit.png`
- `test/screenshots/t02-owner-prod-login-after-confirm.png`
- `test/screenshots/t02-owner-prod-profile-step.png`
- `test/screenshots/t02-owner-prod-profile-filled.png`
- `test/screenshots/t02-owner-prod-clinic-filled.png`
- `test/screenshots/t02-owner-prod-failure.png`
- `test/screenshots/t02-rerun-owner-signup-filled.png`
- `test/screenshots/t02-rerun-owner-signup-after-submit.png`
- `test/screenshots/t02-rerun-owner-login-filled.png`
- `test/screenshots/t02-rerun-owner-failure.png`
- `test/screenshots/rerun-20260424195604-owner-admin-login-filled.png`
- `test/screenshots/rerun-20260424195604-owner-admin-login-result.png`
- `test/screenshots/rerun-20260424195604-owner-prod-login-result.png`
- `test/screenshots/rerun-20260424201448-owner-login-filled.png`
- `test/screenshots/rerun-20260424201448-owner-login-result.png`
- `test/screenshots/rerun-20260424201448-owner-profile-filled.png`
- `test/screenshots/rerun-20260424201448-owner-clinic-filled.png`
- `test/screenshots/rerun-20260424201448-owner-register-result.png`
- `test/screenshots/202604250001-owner-settings.png`
- `test/screenshots/202604250001-doctor-signup-filled.png`
- `test/screenshots/202604250001-doctor-signup-result.png`
- `test/screenshots/202604250001-doctor-email-confirmed.png`
- `test/screenshots/202604250001-doctor-profile-filled.png`
- `test/screenshots/202604250001-doctor-clinic-found.png`
- `test/screenshots/202604250001-doctor-pending-after-join.png`
- `test/screenshots/202604250001-doctor-pending-gate-dashboard.png`
- `test/screenshots/202604250001-doctor-pending-gate-recordings-new.png`
- `test/screenshots/202604250001-doctor-pending-gate-search.png`
- `test/screenshots/202604250001-doctor-pending-gate-settings.png`
