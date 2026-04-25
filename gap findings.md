# Current Gap Findings

Fresh review date: April 25, 2026.

Scope: current codebase checked against `implementation-plan.md`, `Plan/BharatDoc_PRD.md`, web route/client code, server APIs, worker APIs, Supabase repositories/migrations, local recording logic, smoke scripts, and env validation.

Notes:
- Fixed findings have been removed.
- Remaining findings are reprioritized by production risk: P2, then P3.
- No active P0 findings are known.
- No active P1 findings are known.

## P2 - Product Correctness / Workflow Completeness

### P2-1. Auth source of truth and contact-field naming are inconsistent

Files:
- `Plan/BharatDoc_PRD.md`
- `packages/shared/src/schemas.ts`
- `supabase/migrations/202604230001_initial_schema.sql`
- `apps/web/lib/server/supabase-auth.ts`
- `apps/web/lib/server/onboarding.ts`

Problem:
- The implementation uses Supabase email/password auth.
- The PRD still describes Firebase phone OTP.
- Schemas and migrations still name the auth identifier `firebase_uid`.
- `supabase-auth.ts` stores Supabase email in a field named `phoneNumber`, which flows into `doctors.phone` and phone-labelled UI.
- There is no phone number input in signup, so current "phone" values are actually email/contact identifiers.

Fix:
- Pick and document the Phase 1 auth source of truth.
- If Supabase email/password remains, rename/display contact fields as email or neutral contact fields.
- Update PRD, env docs, schemas, migrations, UI labels, and tests to match.
- Migrate existing records that have email addresses stored in the phone column.

### P2-2. iOS recording MIME negotiation still does not implement the MP4/AAC path

Files:
- `apps/web/lib/client/audio-recorder.ts`

Problem:
- Recorder MIME negotiation only chooses `audio/webm` or `audio/wav`.
- The PRD calls out WebM/Opus for Android and MP4/AAC for iOS.
- Filename mapping for MP4/M4A has been fixed, but capture still does not attempt an iOS-compatible MP4/AAC MIME type.

Fix:
- Try supported MIME types in order, including `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4;codecs=mp4a.40.2`, `audio/mp4`, and `audio/wav`.
- Add unit coverage for Safari/iOS support matrices and WAV fallback behavior.

### P2-3. Large transcription files are rejected instead of split or explained before upload

Files:
- `apps/worker/src/transcription.ts`
- `packages/shared/src/constants.ts`
- `apps/web/components/recordings/recording-screen.tsx`

Problem:
- The PRD says large audio files over 25 MB should be split into chunks with overlap and stitched.
- Current worker rejects audio above `MAX_AUDIO_BYTES_PHASE_1`.
- The UI does not warn doctors before upload that larger recordings are unsupported.

Fix:
- Implement chunk splitting and transcript stitching for oversized files.
- Or update Phase 1 requirements and UI to make the 25 MB limit explicit before upload.
- Add tests for oversized audio behavior.

### P2-4. Clinic-scoped detail view exposes edit/AI actions that only the owning doctor can perform

Files:
- `apps/web/lib/server/recordings.ts`
- `apps/web/components/recordings/transcript-summary-screen.tsx`

Problem:
- Recording detail loads by clinic scope, so a doctor can open another doctor's recording from search.
- Summary save, summary generation, and PDF generation are doctor-owner scoped.
- The UI does not receive a `can_edit`/ownership flag, so it still renders Generate, Save, and PDF actions that fail for another doctor's recording.

Fix:
- Return ownership/permission flags from the recording detail API.
- Hide or disable edit, summary, and PDF actions for read-only clinic records.
- If clinic-wide editing is intended, define the authorization/audit model and make server and worker paths consistent.
- Add tests for own-record editable detail and other-doctor read-only detail.

### P2-5. Existing local records can mask newer server status on Dashboard

Files:
- `apps/web/lib/client/dashboard-data.ts`
- `apps/web/lib/client/local-recordings.ts`

Problem:
- `mergeDashboardRecords` iterates local records before server records when IDs match.
- After transcription, a local record can share the server recording ID.
- If the server record later moves to `summary_ready` or `pdf_saved`, the stale local dashboard record can win.

Fix:
- Prefer server records when a local record already has `serverRecordingId`.
- Or clear/update local records after successful server sync.
- Add tests for server `pdf_saved` beating stale local `transcribed`.

### P2-6. Owner admin is missing removal/reapproval audit flows and recording counts

Files:
- `Plan/BharatDoc_PRD.md`
- `apps/web/lib/server/clinic-admin.ts`
- `apps/web/lib/server/supabase-clinic-admin-repository.ts`
- `apps/web/components/settings/settings-screen.tsx`

Problem:
- PRD owner admin includes active doctor recording counts, remove-from-clinic, rejected/removed doctor history, and re-approve.
- Current admin model supports pending approvals, active doctor listing, and clinic profile edits only.
- Active doctor rows do not include total recording count.

Fix:
- Add backend/admin flows for remove doctor, rejected/removed list, and re-approve, with self-removal protection.
- Include total recording count per active doctor.
- Add owner authorization and audit tests.

### P2-7. Dashboard recent list scope is unresolved

Files:
- `apps/web/lib/server/recordings.ts`
- `apps/web/lib/server/supabase-recordings-repository.ts`

Problem:
- `getDashboardSnapshotForUser()` calls `listRecentRecordings(doctor.id, ...)`.
- The Supabase query filters by `doctor_id`.
- The PRD dashboard language and UI show doctor names in recent records, which implies a clinic-scoped recent consultation view.
- Search is clinic-scoped, but dashboard recent records only show the current doctor's recordings.

Fix:
- Decide explicitly whether Dashboard is doctor-scoped or clinic-scoped.
- If clinic-scoped, query by `clinic_id`, retain doctor names, and add cross-doctor tests.
- If doctor-scoped is intentional, update the PRD and UI copy.

### P2-8. Recording screen misses clinic and offline/reconnect context

Files:
- `apps/web/components/recordings/new-recording-page-client.tsx`
- `apps/web/components/recordings/recording-screen.tsx`

Problem:
- The PRD calls for clinic name on the recording screen as read-only context.
- It also calls for explicit offline messaging and reconnect/pending transcription visibility.
- Current recording screen says audio stays local, but it does not show clinic context and has no online/offline UI.

Fix:
- Pass clinic name into the recording page client and render it on the recording screen.
- Detect offline/online state and show explicit offline save/transcribe messaging.
- Keep transcription manual, but make pending local recordings visible on reconnect.

### P2-9. Delete account remains unsupported in Settings

Files:
- `apps/web/components/settings/settings-screen.tsx`

Problem:
- `Delete account` renders without a handler, confirmation flow, or backend support.
- The PRD includes delete account with confirmation.

Fix:
- Implement delete account with confirmation and backend support.
- Or remove the row until the flow is supported.
- Add tests for delete confirmation state and cancellation.

### P2-10. Raw Zod JSON shown as error when form is submitted with empty email

Files:
- `apps/web/lib/client/auth-client.ts`
- `packages/shared/src/auth.ts`

Problem:
- `normalizeEmail("")` throws a `ZodError`.
- `authErrorMessage` treats any `Error` as displayable and returns `.message`.
- `ZodError.message` is JSON and can render verbatim in the red auth banner.

Fix:
- Detect `ZodError` or `.issues` in `authErrorMessage`.
- Map validation errors to user-readable messages such as "Please enter a valid email."
- Add tests for empty email and invalid password auth messages.

### P2-11. Settings "Pending approvals" row is not interactive

Files:
- `apps/web/components/settings/settings-screen.tsx`

Problem:
- The `SettingsRow` for "Pending approvals" shows a badge count but has no action.
- The pending doctor cards appear separately in "Owner review" below, but the row does not link or scroll to them.

Fix:
- Add an `onClick` to scroll to the pending-approval section, or add a dedicated approval page.
- Add tests for the row action.

### P2-12. Settings "Help & support" and "Terms and privacy" rows have no actions

Files:
- `apps/web/components/settings/settings-screen.tsx`

Problem:
- Both rows render as button-like rows with no `href` or `onClick`.
- Clicking either does nothing.

Fix:
- Wire "Help & support" to a support URL, help page, or email link.
- Wire "Terms and privacy" to a terms/privacy page or external URL.
- If the destinations are not ready, render them as disabled/non-interactive rows.

### P2-13. "Summary prompt" badge always shows "Edited" regardless of saved prompt

Files:
- `apps/web/components/settings/settings-screen.tsx`

Problem:
- `promptEdited` always evaluates to `true` because the default prompt is non-empty.
- The "Edited" badge appears even when the doctor is using the default prompt.

Fix:
- Pass the doctor's `custom_prompt` value into `SettingsScreen`.
- Compare it to `DEFAULT_SUMMARY_PROMPT`.
- Only show "Edited" when the saved custom prompt differs from the default.

## P3 - Polish / Test Depth / Performance Follow-up

### P3-1. Prompt test action is only string interpolation

Files:
- `apps/web/components/settings/prompt-editor-screen.tsx`

Problem:
- `Test sample` only interpolates the prompt with a hardcoded transcript.
- Doctors may think they are testing AI output when they are only previewing the rendered prompt.

Fix:
- Rename to "Preview prompt" and explain that it does not call AI.
- Or add a test-only summary-generation endpoint.
- Add validation that prompt testing does not persist a recording summary.

### P3-2. Non-dashboard protected pages still do serial auth/resource requests

Files:
- `apps/web/components/settings/settings-page-client.tsx`
- `apps/web/components/settings/prompt-editor-page-client.tsx`
- `apps/web/components/settings/transcription-language-page-client.tsx`
- `apps/web/components/recordings/recording-detail-page-client.tsx`
- `apps/web/components/recordings/new-recording-page-client.tsx`

Problem:
- Dashboard/search were collapsed into `/api/dashboard`, but several protected pages still fetch `/api/me` before route-specific data.
- Each call verifies the Supabase token remotely.
- This keeps avoidable request waterfalls on important production screens.

Fix:
- Return doctor/account-state context from route-specific APIs.
- Or add combined page-bootstrap endpoints for settings, preferences, and recording detail.
- Add latency tests or smoke timing logs for protected page bootstraps.

### P3-3. Browser and staging smoke coverage is still demo/shell-heavy

Files:
- `apps/web/e2e/dashboard.spec.ts`
- `scripts/pwa-offline-smoke.mjs`
- `scripts/staging-smoke.mjs`
- `Plan/implementation-log.md`

Problem:
- Most Playwright flows use `?demo=1`.
- PWA offline smoke verifies demo routes.
- Staging smoke checks worker health, manifest, and app-shell HTML, but not authenticated API-backed flows.

Fix:
- Keep demo E2E tests, but add authenticated production-mode browser tests with mocked Supabase/API responses.
- Add one local or staging smoke path that exercises real auth, real API routes, worker upload, summary/PDF generation, and PDF signed URL reload behavior.
- Link latest smoke output and screenshots from the implementation log.
