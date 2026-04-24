# Current Gap Findings

Fresh review date: April 24, 2026.

Scope: current codebase checked against `implementation-plan.md`, `Plan/BharatDoc_PRD.md`, deployment/env docs, web app routes, server APIs, worker APIs, Supabase migrations, and tests. Older findings that are now fixed are not repeated here.

## P1 Findings

### P1-1. Vercel env template omits secrets required by web API routes

Files:
- `Plan/env.template.txt`
- `packages/shared/src/env.ts`
- `apps/web/lib/server/supabase.ts`
- `apps/web/app/api/auth/register/route.ts`

Problem:
- The template says the Vercel `.env.local` only needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, and `RAILWAY_WORKER_URL`.
- But `WebEnvSchema` also requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- The web API routes call `createSupabaseServerClient()`, so onboarding, recordings, settings, clinic admin, search, and proxy routes can fail at runtime if the user follows the template literally.
- This also conflicts with the template language that places the Supabase service-role key only under the Railway worker section.

Fix:
- Update the web env template to include server-only Vercel variables: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Clearly label them as Vercel server runtime secrets, not `NEXT_PUBLIC_*` values.
- Keep the worker env section separate, because Railway also needs its own `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Add a startup/deploy checklist that verifies Vercel and Railway both have the required non-public secrets.

### P1-2. Production routes still expose demo mode through `?demo=1`

Files:
- `apps/web/app/dashboard/page.tsx`
- `apps/web/app/search/page.tsx`
- `apps/web/app/settings/page.tsx`
- `apps/web/app/recordings/new/page.tsx`
- `apps/web/app/recordings/[id]/page.tsx`
- `apps/web/app/settings/prompt/page.tsx`
- `apps/web/app/settings/language/page.tsx`

Problem:
- App routes enable demo mode directly from the public query string.
- A production user can open `/dashboard?demo=1`, `/settings?demo=1`, or a demo recording detail without an authenticated session.
- The screens show plausible doctors, clinics, patient records, PDFs, and owner-approval flows.
- In a clinical documentation product, publicly switchable fake clinical data can be mistaken for real state and can also mask broken auth or backend configuration during staging.

Fix:
- Disable query-string demo mode in production builds.
- Gate demo mode behind an explicit server env flag such as `NEXT_PUBLIC_ENABLE_DEMO_MODE=true` for local/test deployments only.
- Visually watermark any demo-only surface if it remains available outside tests.
- Add route tests that verify `?demo=1` does not bypass auth when demo mode is disabled.

### P1-3. Patient ID is not enforced before transcription

Files:
- `apps/web/components/recordings/recording-screen.tsx`
- `apps/web/lib/client/local-recordings.ts`
- `apps/web/lib/server/recordings.ts`
- `apps/worker/src/transcription.ts`
- `apps/web/components/recordings/recording-screen.test.tsx`

Problem:
- The PRD and implementation plan say Patient ID is mandatory before transcription/PDF.
- The local repository intentionally allows finalizing a stopped recording without Patient ID, which is correct for post-record tagging.
- But the UI then allows `Transcribe` with a blank Patient ID.
- The web metadata route accepts `patient_id: null`.
- The worker transcription path does not require `recording.patient_id`.
- Tests currently assert that authenticated recordings can sync and transcribe without Patient ID, which codifies the wrong product rule.

Fix:
- Keep stop/save local recording allowed without Patient ID.
- Block `Transcribe` until `patientId` normalizes to a non-empty value.
- Enforce Patient ID in `createRecordingMetadataForDoctor` when the intent is transcription, or enforce it in `transcribeRecording`.
- Keep PDF/summary enforcement as-is.
- Replace tests that expect null-Patient transcription with tests that verify local save succeeds but transcription is blocked until a Patient ID is added.

### P1-4. Saved PDFs still reopen with a demo data URL after reload

Files:
- `apps/web/components/recordings/transcript-summary-screen.tsx`
- `apps/web/lib/client/recording-detail-data.ts`
- `apps/web/lib/client/summary-api.ts`
- `apps/web/app/api/recordings/[id]/route.ts`

Problem:
- A loaded recording with `pdfStoragePath` initializes `pdfUrl` to `demoPdfSignedUrl`.
- The detail API returns `pdf_storage_path`, but not a fresh signed Supabase URL.
- A real `pdf_saved` consultation can therefore display a fake/demo PDF link after refresh.

Fix:
- Add server support for fetching a fresh signed URL for the stored PDF path.
- Return `pdf_signed_url` or equivalent from the recording detail API when `pdf_storage_path` exists.
- Initialize `pdfUrl` from the signed URL, not demo data.
- Keep demo URLs only in explicit demo mode.
- Add tests for reloading a real `pdf_saved` recording.

### P1-5. End-to-end validation records still conflict

Files:
- `implementation-plan.md`
- `Plan/implementation-log.md`
- `scripts/live-flow-smoke.mjs`
- `docs/staging-smoke.md`

Problem:
- `implementation-plan.md` marks remote migration application, live auth smoke, full live AI smoke, and screenshot review complete.
- `Plan/implementation-log.md` still says `pnpm smoke:live-flow` fails because Supabase cannot find `public.clinics` and `public.doctors` in the PostgREST schema cache.
- Staging smoke remains blocked by missing `STAGING_WEB_URL` and `STAGING_WORKER_URL`.
- These records cannot all be true, so the current Phase 1 validation status is unreliable.

Fix:
- Re-run `pnpm smoke:live-flow` against the configured backend after migrations are applied.
- Re-run `pnpm smoke:staging` after staging URLs are set.
- Confirm PostgREST sees `public.clinics`, `public.doctors`, `clinic_join_requests`, and `recordings`.
- Update the implementation plan/log with exact command output and screenshot paths.

## P2 Findings

### P2-1. Onboarding writes are still not transactional

File:
- `apps/web/lib/server/supabase-onboarding-repository.ts`

Problem:
- Owner onboarding inserts the clinic first and the doctor second.
- Doctor join onboarding inserts the doctor first and the join request second.
- A partial failure can leave orphan clinics or pending doctors without join requests.
- The read-before-write `findDoctorByAuthUid` check also leaves a duplicate-submit race window.

Fix:
- Move owner creation into a Supabase RPC/database transaction.
- Move doctor join creation into a Supabase RPC/database transaction.
- Use unique constraints for duplicate-account safety.
- Add tests for partial failure and duplicate submit behavior.

### P2-2. iOS MP4/AAC recording MIME path is missing

File:
- `apps/web/lib/client/audio-recorder.ts`

Problem:
- Recorder MIME negotiation only chooses `audio/webm` or `audio/wav`.
- The PRD calls out WebM/Opus for Android and MP4/AAC for iOS.
- Safari/iOS can fail or degrade without an `audio/mp4`/AAC path.

Fix:
- Try supported MIME types in order, including `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4;codecs=mp4a.40.2`, `audio/mp4`, then a safe fallback.
- Keep filename extensions aligned with MIME type.
- Add unit coverage for Safari/iOS support matrices.

### P2-3. Patient ID search is exact-only

File:
- `apps/web/lib/server/supabase-recordings-repository.ts`

Problem:
- The PRD requires exact or prefix Patient ID search.
- Current Supabase query uses `.eq("patient_id", patientId)`.
- Prefix searches such as `P-104` will not return `P-10470`.

Fix:
- Change the query to support exact and prefix matching.
- Preserve clinic scoping and newest-first ordering.
- Add tests for exact, prefix, empty, and cross-clinic cases.

### P2-4. Dashboard still uses hardcoded clinic/admin context

Files:
- `apps/web/components/dashboard-page-client.tsx`
- `apps/web/components/dashboard-screen.tsx`

Problem:
- `DashboardPageClient` passes `pendingApprovalsCount: doctor?.role === "owner" ? 1 : 0`.
- It also renders clinic context as `"Your clinic"` instead of the actual clinic name.
- `DashboardScreen` still defaults `pendingApprovalsCount` to `1`.
- The top settings icon is a plain button with no navigation.

Fix:
- Load real clinic profile and pending approval count for owners.
- Return clinic name from `/api/me` or fetch a lightweight clinic context endpoint.
- Default all badge counts to `0`.
- Make the dashboard settings icon navigate to `/settings`.
- Add tests for owners with zero pending approvals and doctors with no badge.

### P2-5. Dashboard recent list is doctor-scoped, not clinic-scoped

Files:
- `apps/web/lib/server/recordings.ts`
- `apps/web/lib/server/supabase-recordings-repository.ts`

Problem:
- The dashboard service calls `listRecentRecordings(doctor.id, ...)`.
- The Supabase query filters by `doctor_id`.
- The PRD dashboard calls for recent recordings with doctor name in a clinic-scoped view.
- Doctors can search across the clinic, but the dashboard recent list only shows their own records.

Fix:
- Decide explicitly whether Dashboard should be doctor-scoped or clinic-scoped.
- If clinic-scoped, query by `clinic_id`, retain doctor names, and add cross-doctor tests.
- If doctor-scoped is intentional, update the PRD and UI copy so the product contract is not ambiguous.

### P2-6. Search result UI does not expose all PRD-required context

Files:
- `apps/web/components/search/search-screen.tsx`
- `apps/web/components/dashboard-record-card.tsx`
- `apps/web/lib/client/dashboard-data.ts`

Problem:
- Search results reuse the generic dashboard card.
- PRD search results should show clinic scope context, clinic name, doctor name, label, status, and PDF link when available.
- Current result data does not include clinic name, label, or PDF availability/link.

Fix:
- Add search-specific result DTO fields for clinic name, label, and PDF status/link.
- Render a search-specific result card instead of the generic dashboard card.
- Keep exact/prefix search clinic-scoped.

### P2-7. Pending/rejected access screens are static and inert

Files:
- `apps/web/components/onboarding/pending-approval-screen.tsx`
- `apps/web/components/onboarding/access-rejected-screen.tsx`
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

### P2-8. Account settings actions are inert

File:
- `apps/web/components/settings/settings-screen.tsx`

Problem:
- Settings shows `Sign out` and `Delete account`, but both render as buttons without handlers.
- The PRD includes logout and delete account with confirmation.

Fix:
- Wire `Sign out` to the Supabase auth client and redirect to onboarding.
- Either implement delete account with confirmation and backend support, or remove the row until it is supported.
- Add tests for sign-out behavior and delete confirmation state.

### P2-9. Owner admin is missing removal/reapproval audit flows

Files:
- `Plan/BharatDoc_PRD.md`
- `apps/web/lib/server/clinic-admin.ts`
- `apps/web/components/settings/settings-screen.tsx`

Problem:
- PRD owner admin includes active doctor recording counts, remove-from-clinic, rejected/removed doctor history, and re-approve.
- Current server/client admin model supports pending approvals, active doctors, and clinic profile edits only.
- The UI also lets owners edit clinic code, while the PRD says clinic code is read-only and tap-to-copy.

Fix:
- Add backend/admin flows for remove doctor, rejected/removed list, and re-approve, with self-removal protection.
- Include total recording count per active doctor.
- Make clinic code read-only unless the product decision changes.
- Add owner authorization and audit tests.

### P2-10. Recording screen misses clinic and offline/reconnect context

File:
- `apps/web/components/recordings/recording-screen.tsx`

Problem:
- The PRD calls for clinic name on the recording screen.
- It also calls for offline messaging and reconnect/pending transcription visibility.
- Current recording screen says audio stays local, but it does not show clinic context and has no `navigator.onLine`/online-offline UI.

Fix:
- Pass clinic name into the recording page client and show it as read-only context.
- Detect offline/online state and show explicit offline save/transcribe messaging.
- Keep transcription manual, but make pending local recordings visible on reconnect.

### P2-11. Synced local recordings can mask newer server status on Dashboard

Files:
- `apps/web/lib/client/dashboard-data.ts`
- `apps/web/lib/client/local-recordings.ts`

Problem:
- `mergeDashboardRecords` keeps local records before server records when IDs match.
- After transcription, a local record can share the server recording ID.
- If the server record later moves to `summary_ready` or `pdf_saved`, the stale local `transcribed` dashboard record can win.

Fix:
- Prefer server records when a local record already has `serverRecordingId`.
- Or clear/update local records after successful server sync.
- Add tests for server `pdf_saved` beating stale local `transcribed`.

### P2-12. Large transcription files are rejected instead of split

Files:
- `apps/worker/src/transcription.ts`
- `packages/shared/src/constants.ts`

Problem:
- The PRD says large audio files over 25 MB should be split into chunks with overlap and stitched.
- Current worker rejects audio above `MAX_AUDIO_BYTES_PHASE_1`.
- This is acceptable as a short-term limit only if the PRD/UX clearly says large recordings are unsupported in Phase 1.

Fix:
- Implement chunk splitting and transcript stitching for oversized files.
- Or update Phase 1 requirements and UI to make the 25 MB limit explicit before upload.
- Add tests for oversized audio behavior.

### P2-13. Prompt test action is only string interpolation

File:
- `apps/web/components/settings/prompt-editor-screen.tsx`

Problem:
- `Test sample` only interpolates the prompt with a hardcoded transcript.
- The PRD asks for sample transcript testing of prompt behavior.
- The current UI can make doctors think they are testing AI output when they are only previewing the rendered prompt.

Fix:
- Let the doctor edit/paste a sample transcript.
- Run the prompt through a test-only summary-generation endpoint, or clearly label it as a render preview.
- Add validation that the test does not persist a recording summary.

### P2-14. Auth source of truth and contact-field naming are inconsistent

Files:
- `Plan/BharatDoc_PRD.md`
- `Plan/env.template.txt`
- `packages/shared/src/schemas.ts`
- `supabase/migrations/202604230001_initial_schema.sql`
- `apps/web/lib/server/supabase-auth.ts`

Problem:
- The current implementation uses Supabase email/password auth.
- The PRD still describes Firebase phone OTP and Firebase public env keys.
- Active schemas and migrations still name the auth identifier `firebase_uid` and the contact field `phone`.
- `supabase-auth.ts` stores Supabase email in a field named `phoneNumber`, which flows into `doctors.phone` and phone-labelled UI.

Fix:
- Pick and document the Phase 1 auth source of truth.
- If Supabase email/password remains, rename/display contact fields as email or neutral contact fields.
- Update PRD, env docs, schemas, migrations, UI labels, and tests to match.

### P2-15. Browser and staging smoke coverage is still demo/shell-heavy

Files:
- `apps/web/e2e/dashboard.spec.ts`
- `scripts/pwa-offline-smoke.mjs`
- `scripts/staging-smoke.mjs`
- `Plan/implementation-log.md`

Problem:
- Most Playwright flows use `?demo=1`.
- PWA offline smoke verifies demo routes.
- Staging smoke checks worker health and app-shell HTML, but not authenticated API-backed flows.
- Production regressions in session gating, signed PDF reloads, real settings data, admin writes, and Supabase-backed search can pass the browser suite.

Fix:
- Keep demo E2E tests, but add authenticated production-mode browser tests with mocked Supabase/API responses.
- Add one local or staging smoke path that exercises real auth, real API routes, and PDF signed URL reload behavior.
- Link latest smoke output and screenshots from the implementation log.

### P2-16. Worker CORS is unrestricted

File:
- `apps/worker/src/app.ts`

Problem:
- The Railway worker calls `app.use(cors())` with no origin allowlist.
- Bearer auth still protects data, but any browser origin can attempt requests to the worker API.
- For a clinical-records worker, browser-origin access should be limited to the deployed web app and local development origins.

Fix:
- Add a worker env var such as `WORKER_ALLOWED_ORIGINS`.
- Configure CORS to allow only Vercel/staging/local origins.
- Keep `/health` available for platform checks if needed.
- Add worker tests for allowed and rejected origins.
