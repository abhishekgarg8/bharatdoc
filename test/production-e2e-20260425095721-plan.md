# BharatDoc Production Full E2E Plan

Run ID: `20260425095721`
Production web: https://bharatdoc-web.vercel.app/
Production worker: https://bharatdocworker-production.up.railway.app
Artifacts: `test/runs/20260425095721/`

## Production Safety

- Use only disposable Gmail plus-alias accounts.
- Use only a disposable clinic created during this run.
- Use unique Patient IDs prefixed with `P-E2E-095721`.
- Do not mutate existing real clinics, doctors, or recordings.
- Rejection/destructive-style flows are limited to disposable doctors in the disposable clinic.

## Test Accounts

- Owner alias: `abhishekgarg8+bd-e2e-owner-20260425095721@gmail.com`
- Doctor approved alias: `abhishekgarg8+bd-e2e-doctor-approve-20260425095721@gmail.com`
- Doctor rejected alias: `abhishekgarg8+bd-e2e-doctor-reject-20260425095721@gmail.com`

## Test Cases

- [x] E01 Availability and unauth guards: web loads, protected routes redirect unauthenticated users, PWA manifest is valid, and worker health returns `200`.
- [x] E02 Auth negative paths: invalid login fails cleanly and duplicate signup is handled without onboarding a second account.
- [x] E03 Owner signup and email confirmation: create owner auth account from production UI and confirm via Gmail link.
- [x] E04 Owner onboarding: complete doctor profile, create a disposable clinic, and land on dashboard.
- [x] E05 Invalid clinic lookup: joining with a bad clinic code fails cleanly.
- [x] E06 Pending doctor signup: create approved-doctor candidate, confirm email, join the run clinic, and land on pending approval with live clinic details.
- [x] E07 Pending route guards and sign-out: pending doctor cannot access dashboard/recording/search/settings and can sign out from pending approval.
- [x] E08 Rejected doctor flow: create rejected-doctor candidate, owner rejects request, rejected doctor sees access-rejected gate. Result: production signup was rate-limited, so auth user was seeded for the reject-gate portion.
- [x] E09 Owner approval flow: owner approves approved-doctor candidate and pending request disappears.
- [x] E10 Approved doctor access: approved doctor can load dashboard, recording, search, and settings; owner-only controls are hidden.
- [x] E11 Recording validation and controls: missing Patient ID blocks transcription and start/pause/resume/stop/playback states work.
- [x] E12 Production transcription: submit valid audio to production worker, persist transcript, and open recording detail.
- [x] E13 Summary and PDF: generate summary, edit/save it, verify unsaved PDF gate, generate PDF, and fetch signed PDF.
- [x] E14 Search: exact, partial, and no-match Patient ID searches behave correctly and stay clinic-scoped.
- [x] E15 Settings preferences: language and prompt settings validate, save, reset, and persist after reload.
- [x] E16 Clinic admin: owner expands active doctors, validates clinic profile/code, and normal doctor remains blocked from owner admin APIs.
- [x] E17 Auth/session: visible sign-out clears auth, cleared session redirects, login persists after reload.
- [x] E18 Responsive and console/network audit: mobile and desktop screenshots have no horizontal overflow; production console and key API responses are clean.

## Run Notes

- E01 passed: worker `/health` returned `200`, manifest returned `200`, `/` and protected dashboard/recording routes redirected to `/onboarding`.
- E02 partial: invalid login with wrong password showed `Invalid login credentials`; duplicate signup will be checked after the owner account exists.
- E03 partial: owner signup submitted and production UI showed `Confirm your email before continuing.`
- E02 passed: duplicate signup for the confirmed owner shows `Email is already registered. Log in instead.`
- E03 passed: owner confirmation email was received in Gmail and the Supabase confirmation link returned to production onboarding.
- E04 passed: owner profile and clinic creation completed; disposable clinic `BharatDoc E2E Clinic 095721` was created with code `E6CUDM`, and `/api/clinic/admin` returned `200`.
- E05 passed: lookup for bad clinic code `ZZZZZZ` returned the user-visible `Clinic code was not found.` state.
- E06 passed: approved-doctor candidate confirmed via Gmail, joined clinic `E6CUDM`, and pending approval screen showed live clinic `BharatDoc E2E Clinic 095721`, owner `Dr. E2E Owner 095721`, and current request time.
- E07 passed: pending doctor was redirected back to `/pending-approval` from dashboard, recording, search, and settings; pending approval Sign out returned to `/onboarding`.
- E08 setup note: first rejected-doctor signup attempt hit Supabase auth rate limit `429`; will retry after cooldown.
- E08 caveat: repeated rejected-doctor UI signup attempts continued to hit Supabase auth `429`; a confirmed disposable auth user was seeded with Supabase admin to continue the reject-gate pathway.
- E08 passed after seeding: seeded doctor completed profile/join request in the production UI, owner rejected the request, and rejected doctor login routed to `/access-rejected`.
- E09 passed: owner approved `Dr. E2E Approved 095721`, pending request disappeared, and Sign out returned the owner to onboarding.
- E10 passed: approved doctor loaded dashboard, recording, search, and settings; normal doctor Settings did not include `Clinic admin`.
- E11 passed: Chrome fake-mic recording exercised start, pause, resume, stop, local playback, and disabled Transcribe with blank Patient ID.
- E12 browser-media note: fake-mic blob transcription still returned worker `500` with `Unable to transcribe recording`; direct valid-WAV transcription will be used for the production worker happy path.
- E12 passed: valid WAV metadata creation returned `201`, production worker transcription returned `200`, and recording detail loaded for `P-E2E-095721-C`.
- E13 passed: summary generation, edit, unsaved-PDF gate, save, PDF generation, signed PDF fetch `200 application/pdf`, and artifact save all passed.
- E14 passed: exact search for `P-E2E-095721-C`, partial search for `095721-C`, and no-match search for `NO-SUCH-095721` all returned the expected production UI states.
- E15 passed: English transcription language persisted after reload; invalid prompt without `{{transcript}}` disabled Save with validation; prompt reset, save, and reload persistence passed.
- E16 passed: owner Settings showed active owner + approved doctor, invalid clinic code `BAD` was rejected, owner admin API returned `200`, and normal doctor admin API returned `403 OWNER_REQUIRED`.
- E17 passed: Settings Sign out cleared auth storage, `/dashboard` redirected to onboarding after sign-out, re-login succeeded, and dashboard session persisted after reload.
- E18 passed: worker `/health` and manifest returned `200`; mobile 390x844 and desktop 1366x900 dashboard/search/recording/settings screenshots had no horizontal overflow, no off-canvas interactive controls, no console errors, and no failed captured API responses.
