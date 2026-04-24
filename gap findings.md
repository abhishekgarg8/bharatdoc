# Current Gap Findings

Fresh review date: April 24, 2026.

Scope: current codebase checked against `implementation-plan.md`, `Plan/BharatDoc_PRD.md`, and the current app/worker implementation. Older P1 findings that are now fixed are not repeated here.

## P1 Findings

### P1-1. Production Settings can still render demo admin data

Files:
- `apps/web/components/settings/settings-page-client.tsx`
- `apps/web/components/settings/settings-screen.tsx`
- `apps/web/components/bottom-nav.tsx`

Problem:
- `SettingsScreen` still defaults to demo doctor, clinic, active doctors, and pending approvals.
- `SettingsPageClient` only passes `activeDoctors` and `pendingApprovals` when their arrays are non-empty.
- An owner with zero real pending approvals can therefore see the demo pending doctor.
- A non-owner can still get a default settings badge count through `BottomNav`.

Fix:
- Do not use demo defaults in production settings props.
- Pass empty arrays explicitly from `SettingsPageClient`.
- Default `BottomNav` `settingsBadgeCount` to `0`.
- Keep demo settings data only behind explicit demo mode.
- Add tests for owner with zero pending approvals and non-owner settings.

### P1-2. Existing saved PDFs reopen with a demo PDF URL

Files:
- `apps/web/components/recordings/transcript-summary-screen.tsx`
- `apps/web/lib/client/recording-detail-data.ts`
- `apps/web/lib/client/summary-api.ts`
- `apps/web/app/api/recordings/[id]/route.ts`

Problem:
- A loaded recording with `pdfStoragePath` initializes `pdfUrl` to `demoPdfSignedUrl`.
- The detail API returns `pdf_storage_path`, but not a fresh signed Supabase URL.
- A real saved clinical PDF can therefore open a fake/demo PDF after reload.

Fix:
- Add server support for fetching a fresh signed URL for the stored PDF path.
- Return `pdf_signed_url` or equivalent from the recording detail API when `pdf_storage_path` exists.
- Initialize `pdfUrl` from the signed URL, not demo data.
- Use demo URLs only in explicit demo mode.
- Add tests for reloading a `pdf_saved` recording.

### P1-3. End-to-end validation records conflict

Files:
- `implementation-plan.md`
- `Plan/implementation-log.md`
- `scripts/live-flow-smoke.mjs`
- `docs/staging-smoke.md`

Problem:
- `implementation-plan.md` now claims the remote migration, live auth smoke, full live AI smoke, and screenshot review are complete.
- The implementation log still says `pnpm smoke:live-flow` is blocked by Supabase schema/cache problems.
- Staging smoke is documented but blocked by missing staging URLs.
- These records cannot both be true, so Phase 1 validation status is currently unreliable.

Fix:
- Re-run or produce logs for `pnpm smoke:live-flow` and `pnpm smoke:staging`.
- Confirm PostgREST schema cache sees `public.clinics`, `public.doctors`, `clinic_join_requests`, and `recordings`.
- Reconcile `implementation-plan.md` and `Plan/implementation-log.md` with exact pass/fail evidence.
- Keep screenshots or smoke output paths linked from the implementation log.

### P1-4. Owner approval RPC is exposed too broadly

Files:
- `supabase/migrations/202604240001_review_clinic_join_request_rpc.sql`
- `apps/web/lib/server/supabase-clinic-admin-repository.ts`

Problem:
- `review_clinic_join_request` is a `security definer` function.
- The function trusts caller-supplied `p_owner_id`, `p_request_id`, and `p_doctor_id`.
- The migration does not revoke default `EXECUTE` privileges from `public`, `anon`, or `authenticated`.
- If this RPC is callable through Supabase with the anon key, it can bypass the Next.js owner checks and directly approve/reject join requests.

Fix:
- Add a migration that revokes execute from `public`, `anon`, and `authenticated`.
- Grant execute only to the server-side role that actually needs it, or remove `security definer` and enforce owner identity inside the function using Supabase auth claims.
- Do not trust `p_owner_id` as authority unless it is verified against the authenticated caller.
- Add a migration contract test that checks the revoke/grant statements.

### P1-5. App routes do not consistently enforce active account status

Files:
- `apps/web/components/recordings/new-recording-page-client.tsx`
- `apps/web/components/settings/settings-page-client.tsx`
- `apps/web/components/dashboard-page-client.tsx`
- `apps/web/components/search/search-page-client.tsx`
- `apps/web/components/recordings/recording-detail-page-client.tsx`

Problem:
- `/recordings/new` only checks that a Supabase token exists, then renders the recorder.
- `/settings` fetches `/api/me` and renders profile/settings even if the doctor is `pending_approval` or `rejected`.
- Other app routes rely on downstream API failures and show generic sign-in errors instead of routing pending/rejected users to the locked screens.
- The PRD says `pending_approval` and `rejected` accounts should not access app features.

Fix:
- Add a shared client-side account gate for protected app routes.
- Fetch `/api/me` before rendering app surfaces and redirect by `account_status`.
- Keep `/pending-approval` and `/access-rejected` as the only allowed destinations for inactive accounts.
- Add tests for pending/rejected users deep-linking to dashboard, settings, recording, search, prompt, language, and detail routes.

## P2 Findings

### P2-1. Onboarding writes are still not transactional

File:
- `apps/web/lib/server/supabase-onboarding-repository.ts`

Problem:
- Owner onboarding inserts the clinic first and the doctor second.
- Doctor join onboarding inserts the doctor first and the join request second.
- A partial failure can leave orphan clinics or pending doctors without join requests.

Fix:
- Move owner creation into a Supabase RPC/database transaction.
- Move doctor join creation into a Supabase RPC/database transaction.
- Keep the existing duplicate-account behavior, but close the read-before-write race.
- Add tests for partial-failure/duplicate-submit behavior.

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
- Add unit coverage for Safari/iOS-style support matrices.

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

### P2-4. Dashboard/admin badges still use hardcoded or default counts

Files:
- `apps/web/components/dashboard-page-client.tsx`
- `apps/web/components/dashboard-screen.tsx`
- `apps/web/components/bottom-nav.tsx`

Problem:
- Dashboard passes `pendingApprovalsCount: doctor?.role === "owner" ? 1 : 0`.
- `DashboardScreen` and `BottomNav` still default the settings badge count to `1`.
- The top settings icon on the dashboard is a plain button with no navigation.

Fix:
- Load the real pending approval count for owners.
- Default all badge counts to `0`.
- Make the dashboard settings icon navigate to `/settings`.
- Add tests for owner with zero pending approvals and doctor role with no badge.

### P2-5. Pending/rejected access screens are static and partly inert

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
- Load the current doctor/clinic/join-request context from authenticated APIs.
- Show real clinic and request details.
- Wire sign-out and retry/join-different-clinic flows.
- Add tests for pending, active, and rejected account states.

### P2-6. Account settings actions are inert

File:
- `apps/web/components/settings/settings-screen.tsx`

Problem:
- Settings shows `Sign out` and `Delete account`, but both render as buttons without handlers.
- The PRD includes logout and delete account with confirmation.

Fix:
- Wire `Sign out` to the Supabase auth client and redirect to onboarding.
- Either implement delete account with confirmation or remove the row until backend support exists.
- Add tests for sign-out behavior and delete confirmation state.

### P2-7. Recording screen misses clinic/offline context from the PRD

File:
- `apps/web/components/recordings/recording-screen.tsx`

Problem:
- The PRD calls for clinic context on the recording screen.
- It also calls for offline messaging and reconnect/pending transcription visibility.
- Current recording screen does not show clinic context and has no `navigator.onLine`/online-offline UI.

Fix:
- Pass clinic name into the recording page client and show it as read-only context.
- Detect offline/online state and show explicit offline save/transcribe messaging.
- Keep transcription manual, but make pending local recordings visible on reconnect.

### P2-8. Search result UI does not expose all PRD-required context

Files:
- `apps/web/components/search/search-screen.tsx`
- `apps/web/components/dashboard-record-card.tsx`
- `apps/web/lib/client/dashboard-data.ts`

Problem:
- Search results reuse the dashboard card.
- PRD search results should show clinic scope context, clinic name, doctor name, label, status, and PDF link when available.
- Current result data does not include clinic name or PDF availability.

Fix:
- Add search-specific result DTO fields for clinic name, label, and PDF status/link.
- Render a search-specific result card instead of the generic dashboard card.
- Keep exact/prefix search clinic-scoped.

### P2-9. Prompt test action is not a real AI preview

File:
- `apps/web/components/settings/prompt-editor-screen.tsx`

Problem:
- `Test sample` only interpolates the prompt with a hardcoded transcript.
- The PRD asks for sample transcript testing of the prompt behavior.

Fix:
- Let the doctor edit/paste a sample transcript.
- Run the prompt through the same summary-generation path with test-only output, or clearly label it as a render preview.
- Add validation that the test does not persist a recording summary.

### P2-10. Synced local recordings can mask newer server status on Dashboard

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

### P2-11. Dashboard recent list is doctor-scoped, not clinic-scoped

Files:
- `apps/web/lib/server/recordings.ts`
- `apps/web/lib/server/supabase-recordings-repository.ts`
- `apps/web/lib/server/recordings.test.ts`

Problem:
- The dashboard service calls `listRecentRecordings(doctor.id, ...)`.
- The Supabase query filters by `doctor_id`.
- The PRD dashboard calls for recent recordings with doctor name in a clinic-scoped view.
- Doctors can search across the clinic, but the dashboard recent list only shows their own records.

Fix:
- Decide explicitly whether Dashboard should be doctor-scoped or clinic-scoped.
- If clinic-scoped, query by `clinic_id`, retain doctor names, and add cross-doctor tests.
- If doctor-scoped is intentional, update the PRD and UI copy so the product contract is not ambiguous.

### P2-12. Auth source of truth still mixes Firebase phone and Supabase email

Files:
- `Plan/BharatDoc_PRD.md`
- `Plan/implementation-log.md`
- `packages/shared/src/schemas.ts`
- `supabase/migrations/202604230001_initial_schema.sql`
- `apps/web/lib/server/supabase-auth.ts`

Problem:
- The current implementation plan and code use Supabase email/password auth.
- The PRD and implementation log still describe Firebase phone OTP, Firebase JWTs, and Firebase admin env.
- Active schemas and migrations still name the auth identifier `firebase_uid` and the contact field `phone`.
- `supabase-auth.ts` stores the Supabase email in a field named `phoneNumber`, which then flows into the `doctors.phone` column and phone-labelled UI.

Fix:
- Pick the Phase 1 auth source of truth: Supabase email/password or Firebase phone OTP.
- Update PRD, implementation log, env docs, schemas, migration names/comments, and UI labels to match.
- If Supabase email/password remains the decision, rename/display contact fields as email or neutral contact fields.
- Add contract tests around registration contact fields so email is not accidentally validated as a phone number later.

### P2-13. Browser and offline smoke coverage is still demo-heavy

Files:
- `apps/web/e2e/dashboard.spec.ts`
- `scripts/pwa-offline-smoke.mjs`
- `scripts/live-flow-smoke.mjs`
- `Plan/implementation-log.md`

Problem:
- Most Playwright flows run with `?demo=1`.
- The PWA offline smoke also warms and verifies demo routes only.
- The live flow smoke exists, but the implementation log says it is blocked in the configured environment.
- Production-only regressions in session gating, real settings data, signed PDF reloads, admin writes, and Supabase-backed search can pass the browser suite.

Fix:
- Keep demo E2E tests, but add authenticated production-mode browser tests with mocked Supabase/API responses.
- Add one local or staging smoke path that exercises real auth, real API routes, and PDF signed URL reload behavior.
- Make the implementation log link to the latest smoke output and screenshots.

### P2-14. Worker CORS is unrestricted

File:
- `apps/worker/src/app.ts`

Problem:
- The Railway worker calls `app.use(cors())` with no origin allowlist.
- Bearer auth still protects data, but any browser origin can attempt requests to the worker API.
- For a clinical-records worker, the browser attack surface should be limited to the deployed web app and local development origins.

Fix:
- Add a worker env var such as `WORKER_ALLOWED_ORIGINS`.
- Configure CORS to allow only Vercel/staging/local origins.
- Keep `/health` available for platform checks if needed.
- Add worker tests for allowed and rejected origins.
