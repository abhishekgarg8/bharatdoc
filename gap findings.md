# Current Gap Findings

Fresh review date: April 24, 2026.

Scope: current codebase checked against `implementation-plan.md`, `Plan/BharatDoc_PRD.md`, web route/client code, server APIs, worker APIs, Supabase repositories/migrations, local recording logic, smoke scripts, and env validation.

Notes:
- Active gaps only are listed below.
- Previously closed findings have been pruned from this file.
- Source code review was read-only; this Markdown file was updated because the request explicitly asked for gaps to be maintained here.

## P1 Findings

### P1-1. Re-transcription can leave stale summary/PDF artifacts attached to a changed transcript

Files:
- `apps/worker/src/transcription.ts:89`
- `apps/worker/src/repositories.ts:92`

Problem:
- The worker transcription path accepts any doctor-owned recording and then updates `audio_storage_path`, `transcript`, and `status = 'transcribed'`.
- It does not constrain the current recording status to `recorded`.
- It does not clear `summary` or `pdf_storage_path`.
- A direct or retried `/api/transcribe` call against a recording that already reached `summary_ready` or `pdf_saved` can change the transcript while leaving old summary/PDF content in the row.
- That reintroduces a clinical integrity problem: derived documentation can remain attached to source text it no longer represents.

Fix:
- Make transcription state transitions explicit.
- Either reject transcription unless the recording is still `recorded`, or clear all derived fields (`summary`, `pdf_storage_path`) when transcript/audio changes.
- Prefer a database update predicate such as `where status = 'recorded'` or a versioned transcript/summary/PDF model.
- Add tests for re-transcribing `summary_ready` and `pdf_saved` recordings.

## P2 Findings

### P2-1. Onboarding writes are still not transactional

File:
- `apps/web/lib/server/supabase-onboarding-repository.ts:32`

Problem:
- Owner onboarding inserts the clinic first and the owner doctor second.
- Doctor join onboarding inserts the doctor first and the join request second.
- A partial failure can leave orphan clinics or pending doctors without join requests.
- The read-before-write `findDoctorByAuthUid` check also leaves a duplicate-submit race window.

Fix:
- Move owner creation into a Supabase RPC/database transaction.
- Move doctor join creation into a Supabase RPC/database transaction.
- Use unique constraints/RPC behavior for duplicate-account safety.
- Add tests for partial failure and duplicate submit behavior.

### P2-2. Dashboard still uses hardcoded clinic/admin context

Files:
- `apps/web/components/dashboard-page-client.tsx:108`
- `apps/web/components/dashboard-screen.tsx:37`

Problem:
- `DashboardPageClient` passes `pendingApprovalsCount: doctor?.role === "owner" ? 1 : 0`.
- It renders clinic context as `"Your clinic"` instead of the real clinic name.
- `DashboardScreen` still defaults to demo doctor/clinic data and a default pending approval count of `1`.
- The top settings icon renders as a plain button without navigation.

Fix:
- Return clinic name and owner pending approval count from `/api/dashboard` or a lightweight clinic context endpoint.
- Default badge counts to `0`.
- Make the settings icon navigate to `/settings`.
- Add tests for owners with zero pending approvals and doctors with no badge.

### P2-3. Dashboard recent list is doctor-scoped, not clinic-scoped

Files:
- `apps/web/lib/server/recordings.ts:195`
- `apps/web/lib/server/supabase-recordings-repository.ts:46`

Problem:
- `getDashboardSnapshotForUser()` calls `listRecentRecordings(doctor.id, ...)`.
- The Supabase query filters by `doctor_id`.
- The PRD dashboard language and UI show doctor names in recent records, which implies a clinic-scoped recent consultation view.
- Search is clinic-scoped, but dashboard recent records only show the current doctor's recordings.

Fix:
- Decide explicitly whether Dashboard is doctor-scoped or clinic-scoped.
- If clinic-scoped, query by `clinic_id`, retain doctor names, and add cross-doctor tests.
- If doctor-scoped is intentional, update the PRD and UI copy.

### P2-4. Patient ID search is exact-only and result cards miss required context

Files:
- `apps/web/lib/server/supabase-recordings-repository.ts:61`
- `apps/web/components/search/search-screen.tsx:140`
- `apps/web/components/dashboard-record-card.tsx:10`

Problem:
- The PRD requires exact or prefix Patient ID search.
- Current Supabase query uses `.eq("patient_id", patientId)`.
- Search results reuse the generic dashboard card and do not expose clinic name, consultation label, PDF availability/link, or richer search-specific context.

Fix:
- Support exact and prefix matching while preserving clinic scoping and newest-first ordering.
- Add search-specific DTO fields for clinic name, label, and PDF status/link.
- Render a search-specific result card.
- Add tests for exact, prefix, empty, cross-clinic, and PDF-ready cases.

### P2-5. Clinic-scoped detail view exposes edit/AI actions that only the owning doctor can perform

Files:
- `apps/web/lib/server/recordings.ts:219`
- `apps/web/components/recordings/transcript-summary-screen.tsx:290`
- `apps/web/components/recordings/transcript-summary-screen.tsx:333`

Problem:
- Recording detail loads by clinic scope, so a doctor can open another doctor's recording from search.
- Summary save, summary generation, and PDF generation are doctor-owner scoped.
- The UI does not receive a `can_edit`/ownership flag, so it still renders Generate, Save, and PDF actions that will fail for another doctor's recording.

Fix:
- Return ownership/permission flags from the recording detail API.
- Hide or disable edit, summary, and PDF actions for read-only clinic records.
- If clinic-wide editing is intended, define the authorization/audit model and make server and worker paths consistent.
- Add tests for own-record editable detail and other-doctor read-only detail.

### P2-6. Existing local records can mask newer server status on Dashboard

Files:
- `apps/web/lib/client/dashboard-data.ts:163`
- `apps/web/lib/client/local-recordings.ts:373`

Problem:
- `mergeDashboardRecords` iterates local records before server records when IDs match.
- After transcription, a local record can share the server recording ID.
- If the server record later moves to `summary_ready` or `pdf_saved`, the stale local `transcribed` dashboard record can win.

Fix:
- Prefer server records when a local record already has `serverRecordingId`.
- Or clear/update local records after successful server sync.
- Add tests for server `pdf_saved` beating stale local `transcribed`.

### P2-7. Recording screen misses clinic and offline/reconnect context

Files:
- `apps/web/components/recordings/new-recording-page-client.tsx:96`
- `apps/web/components/recordings/recording-screen.tsx:402`

Problem:
- The PRD calls for clinic name on the recording screen as read-only context.
- It also calls for explicit offline messaging and reconnect/pending transcription visibility.
- Current recording screen says audio stays local, but it does not show clinic context and has no online/offline UI.

Fix:
- Pass clinic name into the recording page client and render it on the recording screen.
- Detect offline/online state and show explicit offline save/transcribe messaging.
- Keep transcription manual, but make pending local recordings visible on reconnect.

### P2-8. iOS MP4/AAC recording path and filename handling are incomplete

Files:
- `apps/web/lib/client/audio-recorder.ts:88`
- `apps/web/lib/client/transcription-api.ts:33`

Problem:
- Recorder MIME negotiation only chooses `audio/webm` or `audio/wav`.
- The PRD calls out WebM/Opus for Android and MP4/AAC for iOS.
- Direct worker upload names any non-MP4 recording `recording.webm`, even if the MIME type is `audio/wav`.

Fix:
- Try supported MIME types in order, including `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4;codecs=mp4a.40.2`, `audio/mp4`, `audio/wav`.
- Keep filename extensions aligned with MIME type.
- Add unit coverage for Safari/iOS support matrices and WAV fallback naming.

### P2-9. Large transcription files are rejected instead of split or explained before upload

Files:
- `apps/worker/src/transcription.ts:49`
- `packages/shared/src/constants.ts:14`

Problem:
- The PRD says large audio files over 25 MB should be split into chunks with overlap and stitched.
- Current worker rejects audio above `MAX_AUDIO_BYTES_PHASE_1`.
- The UI does not warn doctors before upload that larger recordings are unsupported.

Fix:
- Implement chunk splitting and transcript stitching for oversized files.
- Or update Phase 1 requirements and UI to make the 25 MB limit explicit before upload.
- Add tests for oversized audio behavior.

### P2-10. Owner admin is missing removal/reapproval audit flows and recording counts

Files:
- `Plan/BharatDoc_PRD.md:302`
- `apps/web/lib/server/clinic-admin.ts:20`
- `apps/web/lib/server/supabase-clinic-admin-repository.ts:85`
- `apps/web/components/settings/settings-screen.tsx:333`

Problem:
- PRD owner admin includes active doctor recording counts, remove-from-clinic, rejected/removed doctor history, and re-approve.
- Current admin model supports pending approvals, active doctor listing, and clinic profile edits only.
- Active doctor rows do not include total recording count.

Fix:
- Add backend/admin flows for remove doctor, rejected/removed list, and re-approve, with self-removal protection.
- Include total recording count per active doctor.
- Add owner authorization and audit tests.

### P2-11. Clinic code is editable even though the PRD says read-only

Files:
- `Plan/BharatDoc_PRD.md:307`
- `apps/web/components/settings/settings-screen.tsx:408`
- `apps/web/lib/server/clinic-admin.ts:205`

Problem:
- The PRD says clinic code is displayed read-only and tap-to-copy.
- Current Settings UI lets owners edit and save the clinic code.
- Changing clinic codes can break onboarding expectations and needs a deliberate product/security decision.

Fix:
- Make clinic code read-only with copy behavior.
- Remove `clinic_code` from normal profile update input unless the product explicitly supports rotation.
- If rotation is supported, add audit logging, confirmation, and tests for old/new code behavior.

### P2-12. Pending/rejected access screens are static and inert

Files:
- `apps/web/components/onboarding/pending-approval-screen.tsx:6`
- `apps/web/components/onboarding/access-rejected-screen.tsx:6`

Problem:
- Pending approval screen hardcodes `Sunrise Clinic`, `MED42X`, owner name, and requested date.
- The pending screen `Sign out` button has no handler.
- The rejected screen `Join a different clinic` button has no handler.

Fix:
- Load current doctor/clinic/join-request context from authenticated APIs.
- Show real clinic and request details.
- Wire sign-out and retry/join-different-clinic flows.
- Add tests for pending, active, and rejected account states.

### P2-13. Account settings actions are inert

File:
- `apps/web/components/settings/settings-screen.tsx:507`

Problem:
- Settings shows `Sign out` and `Delete account`, but both render as buttons without handlers.
- The PRD includes logout and delete account with confirmation.

Fix:
- Wire `Sign out` to the Supabase auth client and redirect to onboarding.
- Implement delete account with confirmation and backend support, or remove the row until supported.
- Add tests for sign-out behavior and delete confirmation state.

### P2-14. Prompt test action is only string interpolation

File:
- `apps/web/components/settings/prompt-editor-screen.tsx:22`

Problem:
- `Test sample` only interpolates the prompt with a hardcoded transcript.
- The current UI can make doctors think they are testing AI output when they are only previewing the rendered prompt.

Fix:
- Let the doctor edit/paste a sample transcript.
- Run the prompt through a test-only summary-generation endpoint, or clearly label it as a render preview.
- Add validation that the test does not persist a recording summary.

### P2-15. Auth source of truth and contact-field naming are inconsistent

Files:
- `Plan/BharatDoc_PRD.md:319`
- `packages/shared/src/schemas.ts:28`
- `supabase/migrations/202604230001_initial_schema.sql:13`
- `apps/web/lib/server/supabase-auth.ts:26`

Problem:
- The current implementation uses Supabase email/password auth.
- The PRD still describes Firebase phone OTP.
- Active schemas and migrations still name the auth identifier `firebase_uid` and the contact field `phone`.
- `supabase-auth.ts` stores Supabase email in a field named `phoneNumber`, which flows into `doctors.phone` and phone-labelled UI.

Fix:
- Pick and document the Phase 1 auth source of truth.
- If Supabase email/password remains, rename/display contact fields as email or neutral contact fields.
- Update PRD, env docs, schemas, migrations, UI labels, and tests to match.

### P2-16. Public clinic-code lookup has no abuse guard

Files:
- `apps/web/app/api/clinics/lookup/route.ts:8`
- `apps/web/lib/server/onboarding.ts:62`

Problem:
- Clinic lookup is public and returns clinic name/address for any valid code.
- There is no rate limit, bot check, attempt throttling, or abuse telemetry.
- That creates a clinic enumeration and join-spam surface.

Fix:
- Add IP/session rate limiting and basic abuse telemetry.
- Consider requiring an authenticated Supabase session before lookup.
- Keep response data minimal until the user is authenticated.
- Add tests for throttled repeated invalid lookups.

### P2-17. Non-dashboard protected pages still do serial auth/resource requests

Files:
- `apps/web/components/settings/settings-page-client.tsx:101`
- `apps/web/components/settings/prompt-editor-page-client.tsx:56`
- `apps/web/components/settings/transcription-language-page-client.tsx:56`
- `apps/web/components/recordings/recording-detail-page-client.tsx:63`
- `apps/web/components/recordings/new-recording-page-client.tsx:52`

Problem:
- Dashboard/search were collapsed into `/api/dashboard`, but settings, prompt, language, recording detail, and new recording still fetch `/api/me` before fetching route-specific data or rendering the target screen.
- Each call verifies the Supabase token remotely.
- This keeps avoidable request waterfalls on important production screens.

Fix:
- Return doctor/account-state context from the route-specific APIs.
- Or add combined page-bootstrap endpoints for settings, preferences, and recording detail.
- Add latency tests or smoke timing logs for protected page bootstraps.

### P2-18. Browser and staging smoke coverage is still demo/shell-heavy

Files:
- `apps/web/e2e/dashboard.spec.ts:3`
- `scripts/pwa-offline-smoke.mjs:24`
- `scripts/staging-smoke.mjs:58`
- `Plan/implementation-log.md:478`

Problem:
- Most Playwright flows use `?demo=1`.
- PWA offline smoke verifies demo routes.
- Staging smoke checks worker health, manifest, and app-shell HTML, but not authenticated API-backed flows.
- Production regressions in session gating, signed PDF reloads, real settings data, admin writes, and Supabase-backed search can pass the browser suite.

Fix:
- Keep demo E2E tests, but add authenticated production-mode browser tests with mocked Supabase/API responses.
- Add one local or staging smoke path that exercises real auth, real API routes, worker upload, summary/PDF generation, and PDF signed URL reload behavior.
- Link latest smoke output and screenshots from the implementation log.

### P2-19. Generic server errors are returned to clients verbatim

Files:
- `apps/web/lib/server/errors.ts:36`
- `apps/worker/src/http-errors.ts:39`

Problem:
- Unknown `Error` objects are converted to API responses with `error.message`.
- Supabase, storage, OpenAI, and other internal errors can therefore leak implementation details to the browser.
- This is especially undesirable for auth, clinical records, and service-role-backed APIs.

Fix:
- Return a generic production message for unknown 500s.
- Log the real message server-side with a request ID.
- Preserve explicit `AppError`/`HttpError` messages for expected user-actionable errors.
- Add tests that raw dependency messages are not exposed for generic failures.
