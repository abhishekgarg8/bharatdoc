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

**P0: Production onboarding cannot create an owner clinic.**

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

## Configuration Signals

- The production browser bundle calls Supabase project `jtezgoegatwbvdqeogiy`.
- This repo’s local `.env` points at Supabase project `lnsccuqehnvafgmsahft`.
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
