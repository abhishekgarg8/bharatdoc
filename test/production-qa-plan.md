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
- [x] T06 Owner approval: sign in as owner, verify pending request appears in Settings, approve the doctor, and verify the request disappears.
- [x] T07 Approved doctor access: sign in as approved doctor and verify dashboard, recording, search, and settings load.
- [x] T08 Recording happy path: create a consultation recording with Patient ID, exercise start/pause/resume/stop/playback states, and verify local save.
- [x] T09 Recording validation and retry: verify transcription is blocked without Patient ID and failed transcription can be retried without duplicate metadata.
- [x] T10 Production transcription: upload recorded audio directly to Railway, receive transcript, and open the recording detail page.
- [x] T11 Summary workflow: generate summary, edit it, save it, and verify unsaved changes gate PDF generation.
- [x] T12 PDF workflow: generate PDF, verify signed PDF link appears, open it, and confirm it renders.
- [x] T13 Search: search by exact/partial Patient ID and verify clinic-scoped results and empty state. Result: failed partial Patient ID search.
- [x] T14 Settings preferences: change transcription language, save prompt changes, validate missing `{{transcript}}`, reset prompt, and confirm persisted settings after reload.
- [x] T15 Clinic admin profile: expand active doctors, edit clinic profile/code validation, and confirm owner-only controls are hidden for normal doctors.
- [x] T16 Auth/session behavior: logout or clear session, verify redirects, log back in, and confirm session persistence after reload. Result: failed visible Sign out control; manual clear/re-login path passed.
- [x] T17 Responsive visual QA: capture core screens at mobile viewport and desktop viewport, checking overflow, clipped text, overlapping elements, and unusable controls.
- [x] T18 Console/network QA: review browser console and key API responses for production errors during the run.

## Run Notes

- T01 completed with screenshots `t01-home-onboarding-mobile.png`, `t01-dashboard-redirect-mobile.png`, and `t01-onboarding-desktop.png`.
- Historical 2026-04-24 pre-fix: owner onboarding was blocked by `400 VALIDATION_ERROR` from `/api/me` and `/api/auth/register`; probing showed this came from server runtime environment validation rather than the submitted form body.
- Supabase CLI debug confirmed production project `jtezgoegatwbvdqeogiy` and matching anon/service-role JWT refs. The deployed bundle was later updated to the same anon project ref, resolving the earlier production key mismatch.
- Local `.env` was stale during the debug pass: `NEXT_PUBLIC_SUPABASE_ANON_KEY` decoded to old project `lnsccuqehnvafgmsahft`, and `NEXT_PUBLIC_RAILWAY_WORKER_URL` was missing.
- 2026-04-24 20:14 IST rerun: `/api/me` now returns expected `404 PROFILE_NOT_FOUND` for a confirmed user with no doctor profile, owner registration returns `200`, and dashboard loads with owner name, empty consultations, search, settings, and start-recording CTA.
- 2026-04-25 rerun: owner settings load, clinic admin API returns `200`, clinic code is `R2BJZZ`, and no pending doctors are present before doctor signup.
- 2026-04-25 doctor signup: confirmed `abhishekgarg8+bdqa-doctor-20260424201448@gmail.com`, clinic lookup for `R2BJZZ` returned `200`, join request returned `200`, and dashboard/recording/search/settings routes redirect to `/pending-approval`.
- Pending approval UI bug: pending screen displays demo details (`Sunrise Clinic`, `MED42X`, `Dr. Kavita Rao`) instead of the actual joined clinic `R2BJZZ`.
- 2026-04-25 owner approval: approved doctor from Settings; `/api/clinic/admin` shows `activeDoctorsCount: 2` and no pending approvals.
- 2026-04-25 approved doctor access: doctor dashboard, recording page, search, and settings all load with `200` API responses; owner-only clinic admin controls are hidden in doctor Settings.
- 2026-04-25 recording: fake microphone start/pause/resume/stop works, audio saves locally, and Transcribe is disabled without Patient ID.
- 2026-04-25 retry: failed transcription retry did not create duplicate metadata; `P-QA-250002` remained one server record after retry.
- 2026-04-25 worker transcription: valid synthetic WAV upload to Railway returned `200`, saved transcript, and recording detail loaded for `P-QA-250003`.
- 2026-04-25 summary/PDF: summary generation, edit, unsaved-PDF gate, save, PDF generation, signed URL fetch `200 application/pdf`, and saved PDF file all passed.
- Search bug: exact search for `P-QA-250003` passes, but partial search for `250003` returns `0 consultations`.
- 2026-04-25 settings preferences: language changed to English, saved, and persisted after reload; invalid summary prompt without `{{transcript}}` shows validation and disables save; reset prompt and save default prompt both passed.
- 2026-04-25 clinic admin: owner Settings loaded with clinic admin controls, active doctors expanded to two members, clinic-code validation rejected `BAD` with no save, and normal doctor Settings still hides owner-only controls.
- T16 executed with a product failure: clicking Settings > Sign out leaves the doctor on `/settings` and the Supabase auth token remains in localStorage. Manual session clear redirects `/dashboard` to `/onboarding`; re-login succeeds and persists after dashboard reload.
- 2026-04-25 responsive QA: mobile 390x844 and desktop 1366x900 screenshots captured for dashboard, exact search result, recording detail, and settings. Automated overflow audit found no horizontal overflow or off-canvas interactive controls; console/network were clean during the responsive pass.
- 2026-04-25 console/network QA: final pass had no browser console errors, no page errors, worker `/health` returned `200`, manifest returned `200`, and key production APIs returned `200` (`/api/me`, `/api/dashboard`, `/api/patients/search`, `/api/recordings/{id}`, `/api/settings/preferences`).
- T13 partial execution: exact search for `P-QA-250003` passes and explicit no-match search shows the expected empty state, but partial search for `250003` still misses the existing consultation.
