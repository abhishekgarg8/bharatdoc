# BharatDoc Production QA Results

Date: 2026-04-24

## Scope Executed

- Production web shell: `https://bharatdoc-web.vercel.app/`
- Production worker health: `https://bharatdocworker-production.up.railway.app/health`
- Supabase email signup and confirmation via Gmail
- Owner account creation, clinic creation, dashboard, settings, and doctor approval
- Doctor account creation, clinic join, pending approval gate, approved access, recording, transcription, summary, PDF, search, settings, session, responsive, and console/network checks
- Authenticated API probes for `/api/me`, `/api/auth/register`, `/api/dashboard`, `/api/clinic/admin`, `/api/patients/search`, `/api/recordings/{id}`, `/api/settings/preferences`, summary, and PDF endpoints

## Passing Evidence

- Worker health returned `200 {"ok":true,"service":"bharatdoc-worker"}`.
- PWA manifest returned `200` with `name: "BharatDoc"` and `display: "standalone"`.
- Unauthenticated `/dashboard` redirects to `/onboarding`.
- Fresh production confirmation link returned an access token and the confirmed user could log in with email/password.
- 2026-04-24 20:14 IST rerun: `/api/me` now returns expected `404 PROFILE_NOT_FOUND` for a confirmed user with no doctor profile.
- Owner clinic registration now returns `200` and redirects to `/dashboard`.
- Owner dashboard loads with the owner name, empty consultations, search entry, settings entry, bottom navigation, and start-recording CTA.
- Doctor signup and join request now pass: Gmail confirmation works, clinic lookup for `R2BJZZ` returns `200`, join request returns `200`, and protected routes redirect pending doctors to `/pending-approval`.
- Owner approval now passes: pending request appears in Settings, approve returns `200`, pending list clears, and active doctor count becomes 2.
- Approved doctor access now passes: dashboard, recording, search, and settings all load, and clinic-admin controls are hidden for the normal doctor.
- Recording controls pass in-browser: start, pause, resume, stop, local playback/save state, and missing Patient ID disables transcription.
- Direct production transcription with a valid WAV passes through Railway and opens a persisted recording detail page.
- Summary and PDF workflow passes: generate summary, edit, block PDF while unsaved, save, generate PDF, fetch signed URL as `application/pdf`, and persist the PDF artifact.
- Settings preferences pass: transcription language saves and persists after reload, missing `{{transcript}}` validation disables prompt save, reset prompt works, and prompt save succeeds.
- Clinic admin profile passes: owner sees clinic admin controls, active doctors expands to two active members, invalid short clinic code is rejected client-side without a save request, and normal doctor settings hide owner-only controls.
- Auth session fallback behavior passes after manually clearing storage: `/dashboard` redirects to `/onboarding`, re-login succeeds, and the dashboard session persists after reload.
- Responsive visual QA passes for the tested core screens at 390x844 and 1366x900: no horizontal overflow, no off-canvas interactive controls, and no console/network errors during the responsive pass.
- Final console/network pass is clean for the core happy-path APIs: worker health, manifest, login, `/api/me`, `/api/dashboard`, exact `/api/patients/search`, recording detail, and settings preferences all returned `200` with no console or page errors.
- Search exact-match and empty-state paths pass, but partial Patient ID search remains failing.

## Resolved Configuration Finding

**Resolved: Production web API env validation.**

Earlier in the run, owner onboarding was blocked by `400 VALIDATION_ERROR` from `/api/me` and `/api/auth/register`. Because `/api/me` has no request body, the validation error pointed to server runtime environment parsing rather than bad user input.

- Supabase CLI lists the linked project as `jtezgoegatwbvdqeogiy`.
- Supabase CLI shows both the anon and service-role JWT refs for that project match `jtezgoegatwbvdqeogiy`.
- The corrected production bundle embeds an anon JWT whose ref is `jtezgoegatwbvdqeogiy`.
- After redeploy/correction, `/api/me` returned the expected `404 PROFILE_NOT_FOUND` for a confirmed user without a doctor profile, `/api/auth/register` returned `200`, and owner onboarding completed.
- Current local `.env` still needs cleanup: Supabase URLs and service-role key point to `jtezgoegatwbvdqeogiy`, Railway URLs are present, but `NEXT_PUBLIC_SUPABASE_ANON_KEY` still decodes to old project ref `lnsccuqehnvafgmsahft`.

## Open Findings

**P1: Settings Sign out control does not sign the user out.**

Clicking Settings > Sign out leaves the doctor on `/settings` and the Supabase auth token remains in localStorage (`sb-jtezgoegatwbvdqeogiy-auth-token`). Manual storage clearing proves the protected-route redirect works, so the issue is the visible Sign out row not invoking `auth.signOut()` or redirecting.

**P2: Pending approval screen shows demo clinic details for real pending doctors.**

After joining clinic `R2BJZZ`, the pending screen displays `Sunrise Clinic`, code `MED42X`, owner `Dr. Kavita Rao`, and an old request date. Route guarding works, but the screen is not using the live pending request data.

**P2: Partial Patient ID search misses existing consultations.**

Exact search for `P-QA-250003` returns the saved consultation, but partial search for `250003` returns `0 consultations`. This blocks the partial-search part of T13.

**P3: Browser fake-mic recording blob is rejected by the worker.**

The in-browser fake microphone recording can be started, paused, resumed, stopped, saved locally, and retried without duplicate metadata. However, the worker rejects the fake-device blob with `400 Audio file might be corrupted or unsupported`. A direct valid WAV upload to the same production worker succeeds, so this may be an automation/fake-media artifact rather than a real microphone failure.

## Configuration Signals

- The latest production browser bundle calls Supabase project `jtezgoegatwbvdqeogiy` with a matching anon JWT ref.
- This repo’s local `.env` still has one mixed project value: `NEXT_PUBLIC_SUPABASE_ANON_KEY` points at old project `lnsccuqehnvafgmsahft`; Supabase URLs, service-role key, and Railway worker URLs point at the corrected production services.
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
- `test/screenshots/202604250001-owner-before-approve.png`
- `test/screenshots/202604250001-owner-after-approve.png`
- `test/screenshots/202604250001-doctor-active-login-filled.png`
- `test/screenshots/202604250001-doctor-active-dashboard.png`
- `test/screenshots/202604250001-doctor-active-recording.png`
- `test/screenshots/202604250001-doctor-active-search.png`
- `test/screenshots/202604250001-doctor-active-settings.png`
- `test/screenshots/202604250001-recording-ready-no-patient.png`
- `test/screenshots/202604250001-recording-active-no-patient.png`
- `test/screenshots/202604250001-recording-paused-no-patient.png`
- `test/screenshots/202604250001-recording-resumed-no-patient.png`
- `test/screenshots/202604250001-recording-stopped-no-patient-transcribe-disabled.png`
- `test/screenshots/202604250001-recording-ready-with-patient.png`
- `test/screenshots/202604250001-recording-active-with-patient.png`
- `test/screenshots/202604250001-recording-stopped-with-patient.png`
- `test/screenshots/202604250001-recording-transcribe-result.png`
- `test/screenshots/202604250001-recording-retry-ready.png`
- `test/screenshots/202604250001-recording-retry-result.png`
- `test/screenshots/202604250001-direct-transcription-detail.png`
- `test/screenshots/202604250001-summary-transcript-ready.png`
- `test/screenshots/202604250001-summary-generated.png`
- `test/screenshots/202604250001-summary-pdf-unsaved-gate.png`
- `test/screenshots/202604250001-summary-saved.png`
- `test/screenshots/202604250001-pdf-generated.png`
- `test/screenshots/202604250001-pdf-generated-followup.png`
- `test/screenshots/202604250001-generated-summary.pdf`
- `test/screenshots/202604250001-search-initial.png`
- `test/screenshots/202604250001-search-exact-result.png`
- `test/screenshots/202604250001-search-exception.png`
- `test/screenshots/202604250001-t13-search-empty-state.png`
- `test/screenshots/202604250001-settings-language-english-selected.png`
- `test/screenshots/202604250001-settings-language-saved.png`
- `test/screenshots/202604250001-settings-language-persisted.png`
- `test/screenshots/202604250001-settings-prompt-invalid.png`
- `test/screenshots/202604250001-settings-prompt-sample-invalid.png`
- `test/screenshots/202604250001-settings-prompt-reset.png`
- `test/screenshots/202604250001-settings-prompt-saved.png`
- `test/screenshots/202604250001-t15-owner-login-filled.png`
- `test/screenshots/202604250001-t15-owner-settings-admin.png`
- `test/screenshots/202604250001-t15-owner-active-doctors.png`
- `test/screenshots/202604250001-t15-owner-clinic-code-validation.png`
- `test/screenshots/202604250001-t16-settings-before-signout.png`
- `test/screenshots/202604250001-t16-signout-click-noop.png`
- `test/screenshots/202604250001-t16-cleared-session-redirect.png`
- `test/screenshots/202604250001-t16-relogin-dashboard.png`
- `test/screenshots/202604250001-t16-session-persisted-after-reload.png`
- `test/screenshots/202604250001-t17-mobile-dashboard.png`
- `test/screenshots/202604250001-t17-mobile-search-result.png`
- `test/screenshots/202604250001-t17-mobile-recording-detail.png`
- `test/screenshots/202604250001-t17-mobile-settings.png`
- `test/screenshots/202604250001-t17-desktop-dashboard.png`
- `test/screenshots/202604250001-t17-desktop-search-result.png`
- `test/screenshots/202604250001-t17-desktop-recording-detail.png`
- `test/screenshots/202604250001-t17-desktop-settings.png`
- `test/screenshots/202604250001-t18-final-console-network-pass.png`
