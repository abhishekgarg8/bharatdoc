# Current Gap Findings

Fresh review date: April 24, 2026.

Scope: current codebase checked against `implementation-plan.md`, `Plan/BharatDoc_PRD.md`, web app route/client code, server APIs, worker APIs, Supabase repositories/migrations, smoke scripts, and env docs.

Notes:
- Older P1 findings around default demo fallbacks, blank Patient ID transcription, retry idempotency, stale PDFs, Unicode/multi-page PDF rendering, same-clinic summary edits, and non-atomic approval/rejection are materially fixed in the current code.
- This file lists active gaps only.

Resolution update, April 24, 2026:
- P1-1 is remediated: browser transcription audio now uploads directly to Railway `/api/transcribe`; the Vercel upload proxy route was removed; worker CORS is allowlisted by `WORKER_CORS_ORIGINS`.
- P1-2 is remediated in `Plan/env.template.txt` and env validation docs.
- P1-3 is reconciled in `implementation-plan.md`, `Plan/implementation-log.md`, and `docs/staging-smoke.md`. Local live smoke passed; staging smoke remains blocked until `STAGING_WEB_URL` and `STAGING_WORKER_URL` are set.

## Resolved P1 Findings

### P1-1. Web transcription upload still runs through Vercel instead of Railway

Files:
- `Plan/BharatDoc_PRD.md:398`
- `apps/web/app/api/recordings/[id]/transcription/route.ts:13`
- `apps/web/lib/server/worker-transcription-proxy.ts:50`
- `apps/web/components/recordings/recording-screen.tsx:346`

Problem:
- The PRD says `Upload audio -> Whisper transcription` is handled by Railway because it is timeout-sensitive.
- The browser currently posts the audio blob to a Next/Vercel API route first.
- That route calls `request.formData()`, holds the audio in the Vercel function, then forwards it to Railway.
- This keeps large/slow audio upload on Vercel, which can hit request body, memory, and execution time limits before Railway ever receives the recording.

Fix:
- Move browser audio upload directly to Railway, with the Supabase bearer token sent to the worker.
- Or upload audio directly to Supabase Storage using a signed upload path, then send the storage path to Railway for transcription.
- Add explicit tests/smoke coverage for realistic mobile audio sizes, not only tiny test blobs.
- If direct browser-to-worker upload is used, fix worker CORS allowlisting at the same time.

### P1-2. Vercel env template omits secrets required by web API routes

Files:
- `Plan/env.template.txt:10`
- `packages/shared/src/env.ts:5`
- `apps/web/lib/server/supabase.ts:5`

Problem:
- The Vercel `.env.local` section lists only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, and `RAILWAY_WORKER_URL`.
- `WebEnvSchema` also requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Web API routes call `createSupabaseServerClient()`, so onboarding, recordings, settings, clinic admin, search, and worker proxy routes can fail if deployment follows the template literally.

Fix:
- Add server-only Vercel variables to the web env template: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Clearly label them as Vercel server runtime secrets, not `NEXT_PUBLIC_*` browser values.
- Keep the Railway worker env section separate, because Railway also needs its own `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Add a deployment checklist that validates required Vercel and Railway env vars before smoke tests.

### P1-3. Phase 1 is marked verified while live smoke is still blocked

Files:
- `implementation-plan.md:84`
- `Plan/implementation-log.md:478`
- `scripts/live-flow-smoke.mjs`
- `scripts/staging-smoke.mjs`

Problem:
- `implementation-plan.md` marks remote migration application, live auth smoke, full live AI smoke, and browser screenshot review complete.
- `Plan/implementation-log.md` says `pnpm smoke:live-flow` still fails because Supabase cannot find `public.clinics` and `public.doctors` in the PostgREST schema cache.
- Staging smoke is also blocked by missing `STAGING_WEB_URL` and `STAGING_WORKER_URL`.
- These cannot all be true, so the current Phase 1 validation status is unreliable.

Fix:
- Fix the linked Supabase environment so PostgREST sees `clinics`, `doctors`, `clinic_join_requests`, and `recordings`.
- Re-run `pnpm smoke:live-flow` against the configured backend.
- Set staging URLs and run `pnpm smoke:staging`.
- Update the implementation plan/log with exact command output and screenshot paths.

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
- `apps/web/components/dashboard-page-client.tsx:106`
- `apps/web/components/dashboard-screen.tsx:37`

Problem:
- `DashboardPageClient` passes `pendingApprovalsCount: doctor?.role === "owner" ? 1 : 0`.
- It renders clinic context as `"Your clinic"` instead of the actual clinic name.
- `DashboardScreen` still defaults to demo doctor/clinic data and a default pending approval count of `1`.
- The top settings icon renders as a plain button with no navigation.

Fix:
- Load real clinic profile and pending approval count for owners.
- Return clinic name from `/api/me` or fetch a lightweight clinic context endpoint.
- Default all badge counts to `0`.
- Make the settings icon navigate to `/settings`.
- Add tests for owners with zero pending approvals and doctors with no badge.

### P2-3. Dashboard recent list is doctor-scoped, not clinic-scoped

Files:
- `apps/web/lib/server/recordings.ts:180`
- `apps/web/lib/server/supabase-recordings-repository.ts:46`

Problem:
- The dashboard service calls `listRecentRecordings(doctor.id, ...)`.
- The Supabase query filters by `doctor_id`.
- The PRD dashboard calls for recent recordings with doctor name in a clinic-scoped view.
- Doctors can search across the clinic, but the dashboard recent list only shows their own records.

Fix:
- Decide explicitly whether Dashboard should be doctor-scoped or clinic-scoped.
- If clinic-scoped, query by `clinic_id`, retain doctor names, and add cross-doctor tests.
- If doctor-scoped is intentional, update the PRD and UI copy so the product contract is not ambiguous.

### P2-4. Patient ID search is exact-only and result cards miss required context

Files:
- `apps/web/lib/server/supabase-recordings-repository.ts:61`
- `apps/web/components/search/search-screen.tsx:140`
- `apps/web/components/dashboard-record-card.tsx:10`
- `apps/web/lib/client/dashboard-data.ts:1`

Problem:
- The PRD requires exact or prefix Patient ID search.
- Current Supabase query uses `.eq("patient_id", patientId)`.
- Search results reuse the generic dashboard card and do not expose clinic name, consultation label, PDF availability/link, or explicit clinic-scope header text like the PRD describes.

Fix:
- Support exact and prefix matching while preserving clinic scoping and newest-first ordering.
- Add search-specific DTO fields for clinic name, label, and PDF status/link.
- Render a search-specific result card instead of the generic dashboard card.
- Add tests for exact, prefix, empty, cross-clinic, and PDF-ready cases.

### P2-5. Clinic-scoped detail view exposes edit/AI actions that only the owning doctor can perform

Files:
- `apps/web/lib/server/recordings.ts:190`
- `apps/web/components/recordings/transcript-summary-screen.tsx:62`
- `apps/web/lib/server/recordings.ts:224`
- `apps/worker/src/summary.ts`
- `apps/worker/src/pdf-generation.ts`

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
- `apps/web/lib/client/dashboard-data.ts:153`
- `apps/web/lib/client/local-recordings.ts`

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
- `apps/web/components/recordings/new-recording-page-client.tsx:17`
- `apps/web/components/recordings/recording-screen.tsx:391`

Problem:
- The PRD calls for clinic name on the recording screen as read-only context.
- It also calls for explicit offline messaging and reconnect/pending transcription visibility.
- Current recording screen says audio stays local, but it does not show clinic context and has no online/offline UI.

Fix:
- Pass clinic name into the recording page client and render it on the recording screen.
- Detect offline/online state and show explicit offline save/transcribe messaging.
- Keep transcription manual, but make pending local recordings visible on reconnect.

### P2-8. iOS MP4/AAC recording MIME path is missing

File:
- `apps/web/lib/client/audio-recorder.ts:80`

Problem:
- Recorder MIME negotiation only chooses `audio/webm` or `audio/wav`.
- The PRD calls out WebM/Opus for Android and MP4/AAC for iOS.
- Safari/iOS can fail or degrade without an `audio/mp4`/AAC path.

Fix:
- Try supported MIME types in order, including `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4;codecs=mp4a.40.2`, `audio/mp4`, then a safe fallback.
- Keep filename extensions aligned with MIME type.
- Add unit coverage for Safari/iOS support matrices.

### P2-9. Large transcription files are rejected instead of split

Files:
- `apps/worker/src/transcription.ts:44`
- `packages/shared/src/constants.ts`

Problem:
- The PRD says large audio files over 25 MB should be split into chunks with overlap and stitched.
- Current worker rejects audio above `MAX_AUDIO_BYTES_PHASE_1`.
- This is acceptable only if Phase 1 requirements and UX explicitly say large recordings are unsupported.

Fix:
- Implement chunk splitting and transcript stitching for oversized files.
- Or update Phase 1 requirements and UI to make the 25 MB limit explicit before upload.
- Add tests for oversized audio behavior.

### P2-10. Owner admin is missing removal/reapproval audit flows and recording counts

Files:
- `Plan/BharatDoc_PRD.md:329`
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
- `Plan/BharatDoc_PRD.md:341`
- `apps/web/components/settings/settings-screen.tsx:408`
- `apps/web/lib/server/clinic-admin.ts:43`

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
- `apps/web/app/pending-approval/page.tsx`
- `apps/web/app/access-rejected/page.tsx`

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
- The PRD asks for sample transcript testing of prompt behavior.
- The current UI can make doctors think they are testing AI output when they are only previewing the rendered prompt.

Fix:
- Let the doctor edit/paste a sample transcript.
- Run the prompt through a test-only summary-generation endpoint, or clearly label it as a render preview.
- Add validation that the test does not persist a recording summary.

### P2-15. Auth source of truth and contact-field naming are inconsistent

Files:
- `Plan/BharatDoc_PRD.md:67`
- `packages/shared/src/schemas.ts:28`
- `supabase/migrations/202604230001_initial_schema.sql:13`
- `apps/web/lib/server/auth.ts:3`
- `apps/web/lib/server/supabase-auth.ts:7`

Problem:
- The current implementation uses Supabase email/password auth.
- The PRD still describes Firebase phone OTP and Firebase public env keys.
- Active schemas and migrations still name the auth identifier `firebase_uid` and the contact field `phone`.
- `supabase-auth.ts` stores Supabase email in a field named `phoneNumber`, which flows into `doctors.phone` and phone-labelled UI.

Fix:
- Pick and document the Phase 1 auth source of truth.
- If Supabase email/password remains, rename/display contact fields as email or neutral contact fields.
- Update PRD, env docs, schemas, migrations, UI labels, and tests to match.

### P2-16. Public clinic-code lookup has no abuse guard

Files:
- `apps/web/app/api/clinics/lookup/route.ts:6`
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

### P2-17. Browser and staging smoke coverage is still demo/shell-heavy

Files:
- `apps/web/e2e/dashboard.spec.ts`
- `scripts/pwa-offline-smoke.mjs:24`
- `scripts/staging-smoke.mjs:1`
- `Plan/implementation-log.md:478`

Problem:
- Most Playwright flows use `?demo=1`.
- PWA offline smoke verifies demo routes.
- Staging smoke checks worker health, manifest, and app-shell HTML, but not authenticated API-backed flows.
- Production regressions in session gating, signed PDF reloads, real settings data, admin writes, and Supabase-backed search can pass the browser suite.

Fix:
- Keep demo E2E tests, but add authenticated production-mode browser tests with mocked Supabase/API responses.
- Add one local or staging smoke path that exercises real auth, real API routes, worker proxying/direct upload, and PDF signed URL reload behavior.
- Link latest smoke output and screenshots from the implementation log.

### P2-18. Worker CORS is unrestricted

File:
- `apps/worker/src/app.ts:20`

Problem:
- The Railway worker calls `app.use(cors())` with no origin allowlist.
- Bearer auth still protects data, but any browser origin can attempt worker API requests.
- For a clinical-records worker, browser-origin access should be limited to the deployed web app and local development origins.

Fix:
- Add a worker env var such as `WORKER_ALLOWED_ORIGINS`.
- Configure CORS to allow only Vercel/staging/local origins.
- Keep `/health` available for platform checks if needed.
- Add worker tests for allowed and rejected origins.

### P2-19. Generic server errors are returned to clients verbatim

Files:
- `apps/web/lib/server/errors.ts:31`
- `apps/worker/src/http-errors.ts:27`

Problem:
- Unknown `Error` objects are converted to API responses with `error.message`.
- Supabase, storage, OpenAI, and other internal errors can therefore leak implementation details to the browser.
- This is especially undesirable for auth, clinical records, and service-role-backed APIs.

Fix:
- Return a generic production message for unknown 500s.
- Log the real message server-side with a request ID.
- Preserve explicit `AppError`/`HttpError` messages for expected user-actionable errors.
- Add tests that raw dependency messages are not exposed for generic failures.
