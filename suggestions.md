# BharatDoc Production QA Suggestions
Production web: https://bharatdoc-web.vercel.app/
Production worker: https://bharatdocworker-production.up.railway.app
Screenshot evidence: `test/runs/20260628-chrome/screenshot-evidence/`

## Executive Summary
BharatDoc is broadly functional on the happy path. The live app loaded, unauthenticated protected routes redirected, the provided production account logged in and signed out, a new owner account was created with Gmail confirmation, owner onboarding created a clinic, recording worked in Chrome, transcription returned, summary generation completed, PDF generation completed, exact search found the created record, settings loaded, language loaded, and prompt validation correctly disabled save when `{{transcript}}` was missing.

The most serious issue found is a cross-account local recording leak on the dashboard. After signing out of the provided account and creating a brand-new clinic owner account, the new clinic dashboard immediately displayed Patient ID `2016378894` from the previous browser session as a local pending recording. Search for the fresh clinic correctly showed zero consultations, so this appears to be client-side IndexedDB/local dashboard merge leakage rather than a server clinic-scope leak. It still exposes patient identifiers across accounts on the same browser profile and should be treated as a privacy bug.

Doctor join, pending gate, owner approval, and rejection could not be completed in this run because two fresh doctor signup attempts failed with the generic message `Unable to create account. Please try again.` and no Gmail confirmation email arrived. The UI does not expose enough error detail to distinguish Supabase rate limiting, provider rejection, app configuration, or transient auth failure.

## What Passed

- Root URL redirected to `/onboarding`.
- Unauthenticated `/dashboard` redirected to onboarding.
- Public help and terms/privacy pages rendered.
- Railway worker `/health` returned `200` with `{ "ok": true, "service": "bharatdoc-worker" }`.
- Existing production login for `meetchinx@gmail.com` succeeded and landed on `/dashboard`.
- Existing account dashboard, search, recording entry, settings, language, prompt, help, terms/privacy, exact Patient ID search, recording detail, and sign-out worked.
- New owner alias signup succeeded, Gmail confirmation arrived, confirmation link worked, login reached profile setup, profile setup worked, and clinic creation worked.
- Fresh owner recording start, pause, resume, stop, transcription, summary, PDF, and search worked.
- Prompt editor validation caught a missing `{{transcript}}` placeholder and disabled `Save prompt`.
- Final Chrome console check reported no warnings or errors.

## Blocked Coverage

- Doctor signup failed twice after the owner signup. Tested aliases:
  - `abhishekgarg8+bd-e2e-doctor-20260628082921@gmail.com`
  - `abhishekgarg8+bd-e2e-doctor2-20260628082921@gmail.com`
- Gmail search found no confirmation emails for either doctor alias.
- Because of that, this run did not complete doctor join, pending approval gate, owner approval/rejection, or approved doctor access.

## Findings

### P0: Local recordings leak across signed-in accounts on the same browser

Evidence:

- Existing account dashboard showed Patient ID `2016378894`.
- After sign-out, a fresh owner account and fresh clinic `Chrome QA Clinic 082921` were created.
- The fresh clinic dashboard immediately showed `1 record · 1 pending transcription` with Patient ID `2016378894`.
- The fresh clinic search page showed `0 consultations`, confirming server-side clinic search did not return that prior record.
- Screenshot: `test/runs/20260628-chrome/screenshot-evidence/20-owner-dashboard-new-account-ready.png`.

Likely implementation cause:

- `LocalRecording` has no `auth_user_id`, `doctor_id`, `clinic_id`, or account namespace.
- `IndexedDbLocalRecordingRepository` uses one global database name: `bharatdoc-local-recordings`.
- `DashboardScreen` loads `repository.list()` and merges every local recording into the dashboard without filtering by the current doctor or clinic.
- Relevant code:
  - `apps/web/lib/client/local-recordings.ts:17`
  - `apps/web/lib/client/local-recordings.ts:94`
  - `apps/web/lib/client/local-recordings.ts:306`
  - `apps/web/lib/client/local-recordings.ts:373`
  - `apps/web/components/dashboard-screen.tsx:52`
  - `apps/web/components/dashboard-screen.tsx:62`

Recommended fix:

- Add local-recording ownership fields: `authUserId`, `doctorId`, `clinicId`, and preferably `createdUnderEmailHash`.
- Pass the authenticated doctor/clinic context into `DashboardScreen` and `RecordingScreen`.
- Filter local recordings by current `doctorId` or `clinicId` before displaying them.
- Consider per-user IndexedDB object stores or DB names, but still store ownership metadata so future migrations and support tools can reason about records.
- On sign-out, either hide all local records until the next account scope is known or explicitly offer a device-local cleanup action. Do not automatically delete clinical audio without confirmation.
- Add a migration path for existing unscoped local records: quarantine them behind a `Local recordings from another session` recovery screen instead of merging them into any dashboard.

Acceptance tests:

- Sign in as user A, create an unsynced local recording, sign out, sign in as user B on the same browser, assert user B dashboard does not show user A Patient ID.
- Sign back in as user A and assert user A can recover the local recording.
- Verify local records with `serverRecordingId` are still deduped against server records only when the current clinic/doctor scope matches.

### P1: Signup failures are too generic to debug or recover

Evidence:

- Owner signup worked.
- Two later fresh doctor aliases failed with `Unable to create account. Please try again.`
- No Gmail confirmation email arrived for either failed alias.
- Chrome console had no errors.
- Screenshots:
  - `test/runs/20260628-chrome/screenshot-evidence/40-doctor-after-signup-submit.png`
  - `test/runs/20260628-chrome/screenshot-evidence/42-doctor-signup-retry-result.png`

Likely implementation cause:

- `createSupabaseAuthClient().signUpWithPassword` maps all non-duplicate Supabase signup errors to one generic message.
- Relevant code: `apps/web/lib/client/auth-client.ts:114`.

Recommended fix:

- Preserve provider error codes in telemetry and expose actionable user copy for known cases: rate limit, email provider rejection, SMTP failure, disabled signup, weak password, invalid email, captcha requirement, and network failure.
- Include a non-sensitive request/error reference in the UI, for example `Signup failed. Reference: auth_signup_<timestamp/requestId>`.
- Add a production-safe `/api/auth/signup-diagnostics` or server-side log event for signup failures, without logging passwords or raw tokens.
- Add a resend-confirmation path if signup succeeded but the confirmation email was delayed or lost.
- Add E2E coverage for consecutive alias signups so QA can verify owner and doctor creation in one run.

Acceptance tests:

- Mock Supabase signup responses for rate limit, duplicate email, provider disabled, and network failure; assert specific UI copy.
- Production smoke should create owner and doctor aliases sequentially or clearly detect and report provider rate limits.

### P1: Internal PDF storage path is rendered to users

Evidence:

- Recording detail displayed an internal Supabase object path above the PDF preview.
- Existing account detail and fresh owner generated PDF both showed raw paths.
- Screenshots:
  - `test/runs/20260628-chrome/screenshot-evidence/08-existing-recording-detail.png`
  - `test/runs/20260628-chrome/screenshot-evidence/31-fresh-owner-pdf-outcome.png`

Implementation cause:

- The PDF panel renders `pdfStoragePath` directly.
- Relevant code: `apps/web/components/recordings/transcript-summary-screen.tsx:439`.

Recommended fix:
- Replace raw storage path with user-facing metadata: `PDF generated`, generated timestamp, version number, and expiry/refresh state.
- Keep storage paths in diagnostics/admin tooling only.
- Add a test that generated PDF paths are never visible in normal doctor UI.

### P2: Summary/PDF preview renders raw Markdown markers

Evidence:

- Summary preview displayed text like `**Chief Complaint**`.
- The current code renders summary blocks as plain paragraphs.
- Relevant code: `apps/web/components/recordings/transcript-summary-screen.tsx:461`.

Recommended fix:

- Either adjust prompts to return plain clinical text with no Markdown, or render a controlled Markdown subset.
- Do not pass raw Markdown into PDF output unless the PDF renderer converts it into headings/lists.
- Add snapshot tests for generated summary preview and PDF text.

### P2: Dashboard local/server merge needs stronger ownership and freshness semantics

Evidence:

- Fresh owner search showed zero server records, while dashboard showed a local pending record from a prior account.
- `mergeDashboardRecords` dedupes by ID but has no ownership or clinic checks.
- Relevant code: `apps/web/lib/client/dashboard-data.ts:184`.

Recommended fix:

- Merge only records that pass scope checks.
- For synced local records, prefer server state once the server record exists and belongs to the current clinic.
- Display local-only records in a separate `On this device` section with explicit account/clinic context.

### P2: Real production E2E needs seeded or admin-assisted doctor workflows

Evidence:

- Doctor signup became the blocker for join/approval coverage.
- The app has valuable owner admin flows, but they are difficult to repeatedly test when email signup is rate-limited or unstable.

Recommended fix:

- Add a production-safe QA harness that can create disposable confirmed users through a secured admin-only path, or use Supabase admin API in a locked CI environment.
- Seed owner, pending doctor, rejected doctor, and approved doctor fixtures per run with hard TTL cleanup.
- Keep normal public signup tests, but do not make every admin regression test depend on public email delivery.

### P3: Chrome PDF viewer automation was inconclusive, but the signed URL is valid

Evidence:

- Navigating Chrome directly to the signed PDF URL timed out at the automation layer and exposed no DOM text, which is common for browser PDF viewers.
- Direct fetch of the signed URL returned `200` and `application/pdf`.

Recommended fix:

- For QA, validate PDFs by HTTP status/content type plus rendered PDF text extraction or image rendering, not only browser DOM state.
- Save the generated PDF artifact into the run evidence bundle when possible.

## Recommended Next Implementation Order

1. Fix local recording ownership scoping before broader pilot use. This is the highest-risk privacy issue.
2. Improve signup error observability and retry/resend flows so QA and users can recover without guessing.
3. Add transcription quality gates before summaries/PDFs can be generated.
4. Remove internal storage paths from normal UI.
5. Add a seeded/admin-assisted production E2E path for owner/doctor approval and rejection flows.
6. Clean up summary/PDF Markdown rendering.

## Suggested Test Additions

- `local-recordings.account-scope.test.ts`: local recordings from account A do not render for account B.
- `dashboard.local-record-merge.scope.test.tsx`: `DashboardScreen` requires current doctor/clinic scope before showing local records.
- `auth.signup-errors.test.ts`: maps Supabase provider errors to specific copy and telemetry.
- `transcription.quality-gate.test.ts`: silence/noise/wrong-language recordings cannot advance to summary/PDF.
- `transcript-summary-screen.pdf-path.test.tsx`: no raw Supabase storage path appears in doctor UI.
- `production-admin-flow.spec.ts`: seeded pending doctor can be approved/rejected without relying on public signup email rate limits.

## Evidence Index

- Onboarding: `01-home.png`
- Existing account dashboard: `06-existing-dashboard-ready.png`
- Existing account recording detail: `08-existing-recording-detail.png`
- Existing account sign-out: `10-existing-after-signout-verified.png`
- Owner confirmation/signup: `12-owner-after-signup-submit.png`, `13-owner-confirmed-callback.png`
- Fresh owner leaked dashboard record: `20-owner-dashboard-new-account-ready.png`
- Fresh owner search empty server state: `22-fresh-owner-search.png`
- Recording lifecycle: `24-fresh-owner-recording-ready.png` through `28-fresh-owner-recording-stopped.png`
- Transcription outcome: `29-fresh-owner-transcription-outcome.png`
- Summary/PDF outcome: `31-fresh-owner-pdf-outcome.png`
- Search generated record: `32-fresh-owner-search-created-record.png`
- Settings/clinic code: `34-fresh-owner-settings.png`
- Prompt validation: `37-fresh-owner-prompt-invalid.png`
- Doctor signup failures: `40-doctor-after-signup-submit.png`, `42-doctor-signup-retry-result.png`
