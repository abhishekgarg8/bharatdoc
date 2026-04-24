# BharatDoc Production QA Plan

Date: 2026-04-24

Production web: https://bharatdoc-web.vercel.app/
Production worker: https://bharatdocworker-production.up.railway.app
Screenshots: `test/screenshots/`

## Test Accounts

- Owner alias: `abhishekgarg8+bdqa-owner-20260424160852@gmail.com`
- Doctor alias: `abhishekgarg8+bdqa-doctor-20260424160852@gmail.com`
- Confirmed-owner fallback alias: `abhishekgarg8+bdqa-owner-admin-20260424160852@gmail.com`
- Confirmed-doctor fallback alias: `abhishekgarg8+bdqa-doctor-admin-20260424160852@gmail.com`
- Fresh production owner alias: `abhishekgarg8+bdqa-owner-prod-20260424190352@gmail.com`
- Rerun owner alias: `abhishekgarg8+bdqa-owner-rerun-20260424194557@gmail.com`

## Test Cases

- [x] T01 Production availability: web app loads, protected routes redirect unauthenticated users, PWA manifest is valid, and Railway `/health` returns the expected service payload.
- [ ] T02 Owner account creation: create a new owner account, complete profile details, create a clinic, and land on dashboard.
- [ ] T03 Owner dashboard: verify doctor identity, empty/recent consultation state, bottom navigation, search entry, settings entry, and start-recording CTA.
- [ ] T04 Doctor account creation: create a new doctor account, use owner clinic code lookup, submit join request, and land on pending approval.
- [ ] T05 Pending approval gate: verify pending doctor cannot access dashboard, recording, search, or settings.
- [ ] T06 Owner approval: sign in as owner, verify pending request appears in Settings, approve the doctor, and verify the request disappears.
- [ ] T07 Approved doctor access: sign in as approved doctor and verify dashboard, recording, search, and settings load.
- [ ] T08 Recording happy path: create a consultation recording with Patient ID, exercise start/pause/resume/stop/playback states, and verify local save.
- [ ] T09 Recording validation and retry: verify transcription is blocked without Patient ID and failed transcription can be retried without duplicate metadata.
- [ ] T10 Production transcription: upload recorded audio directly to Railway, receive transcript, and open the recording detail page.
- [ ] T11 Summary workflow: generate summary, edit it, save it, and verify unsaved changes gate PDF generation.
- [ ] T12 PDF workflow: generate PDF, verify signed PDF link appears, open it, and confirm it renders.
- [ ] T13 Search: search by exact/partial Patient ID and verify clinic-scoped results and empty state.
- [ ] T14 Settings preferences: change transcription language, save prompt changes, validate missing `{{transcript}}`, reset prompt, and confirm persisted settings after reload.
- [ ] T15 Clinic admin profile: expand active doctors, edit clinic profile/code validation, and confirm owner-only controls are hidden for normal doctors.
- [ ] T16 Auth/session behavior: logout or clear session, verify redirects, log back in, and confirm session persistence after reload.
- [ ] T17 Responsive visual QA: capture core screens at mobile viewport and desktop viewport, checking overflow, clipped text, overlapping elements, and unusable controls.
- [ ] T18 Console/network QA: review browser console and key API responses for production errors during the run.

## Run Notes

- T01 completed with screenshots `t01-home-onboarding-mobile.png`, `t01-dashboard-redirect-mobile.png`, and `t01-onboarding-desktop.png`.
- T02 is blocked in production. The owner signup reaches email confirmation and login, but create-clinic registration fails with `400 {"error":{"code":"VALIDATION_ERROR","message":"Request validation failed."}}` from `/api/auth/register`.
- The same authenticated session also receives `400` from `/api/me`, so protected production API routes are not healthy enough to complete owner onboarding.
- API probing with the current UI payload, the payload without `medical_reg_no`, a camelCase profile variant, and the old flat PRD payload all returned the same `VALIDATION_ERROR`.
- Production browser bundle uses Supabase project `jtezgoegatwbvdqeogiy`; local `.env` points at `lnsccuqehnvafgmsahft`, so local admin-created fallback users cannot sign into production.
- Tests T03-T18 remain unchecked because they depend on completing production onboarding or accessing a valid active doctor account.
- Rerun after project-id correction: production still blocks T02 at login. The deployed browser bundle now uses `NEXT_PUBLIC_SUPABASE_URL=https://jtezgoegatwbvdqeogiy.supabase.co`, but its embedded anon JWT still has `ref: "lnsccuqehnvafgmsahft"`.
- The production login request now fails at Supabase with `401 Invalid API key`, captured in `t02-rerun-owner-failure.png`.
- Current local `.env` has the same mismatch: `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` point to `jtezgoegatwbvdqeogiy`, while `NEXT_PUBLIC_SUPABASE_ANON_KEY` is still for `lnsccuqehnvafgmsahft`.
- 2026-04-24 rerun with `abhishekgarg8+bdqa-owner-rerun-20260424194557@gmail.com`: production signup fails before email confirmation with `401 {"message":"Invalid API key","hint":"Double check your Supabase `anon` or `service_role` API key."}` from `https://jtezgoegatwbvdqeogiy.supabase.co/auth/v1/signup`.
- Screenshot evidence: `t02-rerun-owner-signup-filled.png` and `t02-rerun-owner-signup-after-submit.png`.
