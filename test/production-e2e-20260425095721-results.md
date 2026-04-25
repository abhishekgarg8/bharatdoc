# BharatDoc Production Full E2E Results

Run ID: `20260425095721`
Production web: https://bharatdoc-web.vercel.app/
Production worker: https://bharatdocworker-production.up.railway.app
Plan: `test/production-e2e-20260425095721-plan.md`
Artifacts: `test/runs/20260425095721/`

## Summary

- Executed 18/18 planned production E2E test cases.
- Captured 95 screenshots in `test/runs/20260425095721/screenshots/`.
- Saved browser/API logs in `test/runs/20260425095721/logs/`.
- Saved generated PDF artifact: `test/runs/20260425095721/artifacts/e13-generated-summary.pdf`.
- Disposable clinic created: `BharatDoc E2E Clinic 095721`, code `E6CUDM`.
- Valid production recording created: `3fb9431c-3d99-4073-8f6a-3e97c412643d`, Patient ID `P-E2E-095721-C`.

## Passed Production Paths

- Availability, PWA manifest, worker health, and unauthenticated protected-route redirects.
- Invalid login and duplicate signup handling.
- Owner signup, Gmail confirmation, profile completion, clinic creation, dashboard, settings, and clinic admin API.
- Doctor signup, Gmail confirmation, invalid clinic lookup, join request, live pending-approval details, pending route guards, and pending sign-out.
- Owner approval and approved doctor access to dashboard, recording, search, and settings.
- Rejected doctor access gate after owner rejection. The auth user had to be seeded because production signup rate limiting blocked a second new signup.
- Recording controls: start, pause, resume, stop, local playback, and blank Patient ID disabling transcription.
- Production transcription with a valid WAV: metadata `201`, worker `/api/transcribe` `200`, persisted transcript, recording detail.
- Summary generation, edit/save, unsaved-PDF gate, PDF generation, signed PDF fetch as `application/pdf`.
- Search exact, partial, and no-match states. The previous partial-search defect is fixed in production.
- Settings language and prompt preferences: validation, reset, save, and reload persistence.
- Clinic admin active-doctor list, clinic-code validation, and normal doctor owner-admin API block with `403 OWNER_REQUIRED`.
- Visible Settings sign-out clears auth storage and redirects; re-login persists after reload.
- Responsive audit at 390x844 and 1366x900 found no horizontal overflow, no off-canvas interactive controls, no console errors, and no failed captured API responses.

## Findings

**P2: Production signup rate limit blocks rapid full E2E account creation.**

The approved-doctor signup succeeded, but repeated attempts to sign up the rejected-doctor account returned Supabase auth `429` with the UI message `Unable to create account. Please try again.` This prevented completing two full independent signup-confirmation flows in one production run. I seeded the rejected auth user with Supabase admin only to continue testing owner rejection and `/access-rejected`.

Evidence:

- `test/runs/20260425095721/screenshots/e08-rejected-doctor-signup-retry-result.png`
- `test/runs/20260425095721/screenshots/e08-rejected-doctor-signup-final-retry-result.png`
- `test/runs/20260425095721/logs/e08-rejected-signup-final-retry.json`

**P3: Chrome fake-mic blob is still rejected by production transcription.**

The browser recording controls work, but transcription of the Chrome fake-mic recording returned worker `500` and the UI showed `Unable to transcribe recording.` A direct valid WAV upload to the same production worker succeeded, so this remains likely an automation/fake-media format artifact rather than proof that real microphone recordings fail.

Evidence:

- `test/runs/20260425095721/screenshots/e12-browser-transcription-result.png`
- `test/runs/20260425095721/logs/e11-e12-browser-recording.json`
- Passing control: `test/runs/20260425095721/logs/e12-valid-wav-transcription.json`

## Confirmed Previous Fixes

- Pending approval screen now uses live clinic, owner, code, and request time.
- Partial Patient ID search now returns existing matching records.
- Settings Sign out now clears the Supabase auth token and redirects to onboarding.

## Key Evidence

- Owner onboarding: `test/runs/20260425095721/screenshots/e04-owner-dashboard.png`
- Pending approval live details: `test/runs/20260425095721/screenshots/e06-approved-doctor-pending-live-details.png`
- Owner approval: `test/runs/20260425095721/screenshots/e09-owner-after-approve.png`
- Approved doctor settings without admin controls: `test/runs/20260425095721/screenshots/e10-approved-doctor-settings-no-admin.png`
- Recording validation: `test/runs/20260425095721/screenshots/e11-recording-stopped-no-patient-disabled.png`
- Valid transcript detail: `test/runs/20260425095721/screenshots/e12-valid-wav-transcription-detail.png`
- PDF generated: `test/runs/20260425095721/screenshots/e13-pdf-generated.png`
- Partial search result: `test/runs/20260425095721/screenshots/e14-search-partial-result.png`
- Sign-out redirect: `test/runs/20260425095721/screenshots/e17-signout-onboarding.png`
- Desktop responsive dashboard: `test/runs/20260425095721/screenshots/e18-desktop-dashboard.png`
- Mobile responsive recording detail: `test/runs/20260425095721/screenshots/e18-mobile-recording-detail.png`

## Final Network/Console Audit

- Worker `/health`: `200 {"ok":true,"service":"bharatdoc-worker"}`
- Manifest: `200 application/manifest+json`
- Mobile dashboard/search/recording/settings: no failed captured API responses, no console errors.
- Desktop dashboard/search/recording/settings: no failed captured API responses, no console errors.
- Responsive audits: `horizontalOverflow: false` for all audited screens.

