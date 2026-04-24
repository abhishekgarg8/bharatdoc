# BharatDoc Production QA Plan

Date: 2026-04-24

Production web: https://bharatdoc-web.vercel.app/
Production worker: https://bharatdocworker-production.up.railway.app
Screenshots: `test/screenshots/`

## Test Accounts

- Owner alias: `abhishekgarg8+bdqa-owner-20260424160852@gmail.com`
- Doctor alias: `abhishekgarg8+bdqa-doctor-20260424160852@gmail.com`

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
