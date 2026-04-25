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
- Active production doctor alias: `abhishekgarg8+bdqa-doctor-20260424201448@gmail.com`

## Test Cases

- [x] T01 Production availability: web app loads, protected routes redirect unauthenticated users, PWA manifest is valid, and Railway `/health` returns the expected service payload.
- [x] T02 Owner account creation: create a new owner account, complete profile details, create a clinic, and land on dashboard.
- [x] T03 Owner dashboard: verify doctor identity, empty/recent consultation state, bottom navigation, search entry, settings entry, and start-recording CTA.
- [x] T04 Doctor account creation: create a new doctor account, use owner clinic code lookup, submit join request, and land on pending approval.
- [x] T05 Pending approval gate: verify pending doctor cannot access dashboard, recording, search, or settings.
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
- Latest debug after Supabase CLI access: Supabase project `jtezgoegatwbvdqeogiy` has anon and service-role keys whose JWT refs both match `jtezgoegatwbvdqeogiy`.
- Latest production bundle now has a `jtezgoegatwbvdqeogiy` anon key, so the earlier deployed anon-key mismatch appears fixed.
- Local `.env` is still stale: `NEXT_PUBLIC_SUPABASE_ANON_KEY` decodes to `lnsccuqehnvafgmsahft`.
- Production still blocks T02 because `/api/me` returns `400 VALIDATION_ERROR` for a valid authenticated user, and `/api/auth/register` returns the same error.
- Because `/api/me` has no request body, this points to server runtime env validation failing in `parseWebEnv(process.env)`.
- Known missing required web env locally: `NEXT_PUBLIC_RAILWAY_WORKER_URL`. The deployed recording bundle also does not contain the Railway worker URL literal, so this public env appears unset at build/deploy time.
- 2026-04-24 20:14 IST rerun: `/api/me` now returns expected `404 PROFILE_NOT_FOUND` for a confirmed user with no doctor profile, owner registration returns `200`, and dashboard loads with owner name, empty consultations, search, settings, and start-recording CTA.
- 2026-04-25 rerun: owner settings load, clinic admin API returns `200`, clinic code is `R2BJZZ`, and no pending doctors are present before doctor signup.
- 2026-04-25 doctor signup: confirmed `abhishekgarg8+bdqa-doctor-20260424201448@gmail.com`, clinic lookup for `R2BJZZ` returned `200`, join request returned `200`, and dashboard/recording/search/settings routes redirect to `/pending-approval`.
- Pending approval UI bug: pending screen displays demo details (`Sunrise Clinic`, `MED42X`, `Dr. Kavita Rao`) instead of the actual joined clinic `R2BJZZ`.
