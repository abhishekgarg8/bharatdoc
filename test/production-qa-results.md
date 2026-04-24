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

## Blocking Finding

**P0: Production auth is using a Supabase URL/key mismatch.**

Latest rerun after the project-id correction:

- `NEXT_PUBLIC_SUPABASE_URL` in the deployed bundle points to `https://jtezgoegatwbvdqeogiy.supabase.co`.
- The deployed anon JWT payload still has `ref: "lnsccuqehnvafgmsahft"`.
- Fresh production signup with `abhishekgarg8+bdqa-owner-rerun-20260424194557@gmail.com` fails before email confirmation.
- Supabase response: `401 {"message":"Invalid API key","hint":"Double check your Supabase `anon` or `service_role` API key."}`.
- Evidence: `test/screenshots/t02-rerun-owner-signup-after-submit.png`.

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

## Rerun After Supabase Project Correction

The blocker still reproduces on 2026-04-24 after the project-id correction, but the failure mode has changed.

Additional evidence:

- The deployed browser bundle now uses `NEXT_PUBLIC_SUPABASE_URL=https://jtezgoegatwbvdqeogiy.supabase.co`.
- The deployed browser bundle still embeds an anon JWT with `ref: "lnsccuqehnvafgmsahft"`.
- Production email/password login now fails at Supabase with `401 Invalid API key`.
- The current local `.env` shows the same mismatch: Supabase URL values point to `jtezgoegatwbvdqeogiy`, while `NEXT_PUBLIC_SUPABASE_ANON_KEY` still decodes to `lnsccuqehnvafgmsahft`.

Likely cause:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` was not updated when the Supabase project URL was corrected.
- Update and redeploy the anon key for project `jtezgoegatwbvdqeogiy`, then rerun T02.

## Configuration Signals

- The production browser bundle calls Supabase project `jtezgoegatwbvdqeogiy`.
- This repo’s local `.env` currently has mixed project values: Supabase URLs point at `jtezgoegatwbvdqeogiy`, while `NEXT_PUBLIC_SUPABASE_ANON_KEY` points at `lnsccuqehnvafgmsahft`.
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
