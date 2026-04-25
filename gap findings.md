# Current Gap Findings

Fresh review date: April 25, 2026.

Scope: current codebase checked against `implementation-plan.md`, `Plan/BharatDoc_PRD.md`, web route/client code, server APIs, worker APIs, Supabase repositories/migrations, local recording logic, smoke scripts, and env validation.

Notes:
- Active gaps only are listed below.
- Fixed findings and fixed portions of mixed findings have been pruned.
- No active P1 findings remain from the reviewed list.
- The list is ranked by overall product and operational priority, not by file order.

## Ranked Open Findings

### 1. [P2] Onboarding writes are still not transactional

Files:
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

### 2. [P2] iOS recording MIME negotiation still does not implement the MP4/AAC path

Files:
- `apps/web/lib/client/audio-recorder.ts:118`

Problem:
- Recorder MIME negotiation only chooses `audio/webm` or `audio/wav`.
- The PRD calls out WebM/Opus for Android and MP4/AAC for iOS.
- Filename mapping for MP4/M4A has been fixed, but capture still does not attempt an iOS-compatible MP4/AAC MIME type.

Fix:
- Try supported MIME types in order, including `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4;codecs=mp4a.40.2`, `audio/mp4`, and `audio/wav`.
- Add unit coverage for Safari/iOS support matrices and WAV fallback behavior.

### 3. [P2] Large transcription files are rejected instead of split or explained before upload

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

### 4. [P2] Public clinic-code lookup has no abuse guard

Files:
- `apps/web/app/api/clinics/lookup/route.ts:8`
- `apps/web/lib/server/onboarding.ts:62`

Problem:
- Clinic lookup is public and returns clinic name/address for any valid code.
- There is no rate limit, bot check, attempt throttling, or abuse telemetry.
- This creates a clinic enumeration and join-spam surface.

Fix:
- Add IP/session rate limiting and basic abuse telemetry.
- Consider requiring an authenticated Supabase session before lookup.
- Keep response data minimal until the user is authenticated.
- Add tests for throttled repeated invalid lookups.

### 5. [P2] Generic server errors are returned to clients verbatim

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

### 6. [P2] Auth source of truth and contact-field naming are inconsistent

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

### 7. [P2] Dashboard still uses hardcoded clinic/admin context

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

### 8. [P2] Clinic-scoped detail view exposes edit/AI actions that only the owning doctor can perform

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

### 9. [P2] Existing local records can mask newer server status on Dashboard

Files:
- `apps/web/lib/client/dashboard-data.ts:163`
- `apps/web/lib/client/local-recordings.ts:373`

Problem:
- `mergeDashboardRecords` iterates local records before server records when IDs match.
- After transcription, a local record can share the server recording ID.
- If the server record later moves to `summary_ready` or `pdf_saved`, the stale local dashboard record can win.

Fix:
- Prefer server records when a local record already has `serverRecordingId`.
- Or clear/update local records after successful server sync.
- Add tests for server `pdf_saved` beating stale local `transcribed`.

### 10. [P2] Owner admin is missing removal/reapproval audit flows and recording counts

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

### 11. [P2] Clinic code is editable even though the PRD says read-only

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

### 12. [P2] Dashboard recent list scope is unresolved

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

### 13. [P2] Recording screen misses clinic and offline/reconnect context

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

### 14. [P2] Rejected access screen still has an inert join-different-clinic flow

Files:
- `apps/web/components/onboarding/access-rejected-screen.tsx:6`

Problem:
- Pending approval now shows real context and has a sign-out handler.
- The rejected screen still renders `Join a different clinic` as a button without a handler.
- A rejected doctor has no usable path to restart onboarding or sign out from this screen.

Fix:
- Wire `Join a different clinic` to the intended retry/reset onboarding flow.
- Or replace it with sign-out plus a clear re-registration path.
- Add tests for rejected account state navigation.

### 15. [P2] Delete account remains unsupported in Settings

Files:
- `apps/web/components/settings/settings-screen.tsx:529`

Problem:
- Settings sign-out now has a handler.
- `Delete account` still renders without a handler, confirmation flow, or backend support.
- The PRD includes delete account with confirmation.

Fix:
- Implement delete account with confirmation and backend support.
- Or remove the row until the flow is supported.
- Add tests for delete confirmation state and cancellation.

### 16. [P2] Prompt test action is only string interpolation

Files:
- `apps/web/components/settings/prompt-editor-screen.tsx:22`

Problem:
- `Test sample` only interpolates the prompt with a hardcoded transcript.
- The current UI can make doctors think they are testing AI output when they are only previewing the rendered prompt.

Fix:
- Let the doctor edit/paste a sample transcript.
- Run the prompt through a test-only summary-generation endpoint, or clearly label it as a render preview.
- Add validation that the test does not persist a recording summary.

### 17. [P2] Non-dashboard protected pages still do serial auth/resource requests

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

### 18. [P2] Browser and staging smoke coverage is still demo/shell-heavy

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

### 19. [P2] Search result cards still miss required context

Files:
- `apps/web/components/search/search-screen.tsx:140`
- `apps/web/components/dashboard-record-card.tsx:10`

Problem:
- Patient ID prefix matching has been fixed.
- Search results still reuse the generic dashboard card.
- Results do not expose clinic name, consultation label, PDF availability/link, or richer search-specific context.

Fix:
- Add search-specific DTO fields for clinic name, label, and PDF status/link.
- Render a search-specific result card.
- Add tests for PDF-ready and labelled-record search results.

---

## New Findings — Production QA Session (April 25, 2026)

Tested against: `https://bharatdoc-web.vercel.app/`

### 20. [P1] No "Forgot Password" link on the login screen

Files:
- `apps/web/components/onboarding/onboarding-screen.tsx` (credentials panel)

Problem:
- The login mode (tab "Log in") renders email, password, and a submit button.
- There is no "Forgot password?" link or any password reset flow.
- Users who have forgotten their password have no recovery path from the app.

Fix:
- Add a "Forgot password?" link below the password field in login mode.
- Implement a password reset flow using Supabase's `resetPasswordForEmail` API.
- Add a reset-confirmation screen or at minimum a success toast.

### 21. [P2] Raw Zod JSON shown as error when form is submitted with empty email

Files:
- `apps/web/lib/client/auth-client.ts` (`authErrorMessage`)
- `packages/shared/src/auth.ts` (`normalizeEmail` / `EmailSchema`)

Problem:
- When the user submits the login/signup form with an empty email, `normalizeEmail("")` throws a `ZodError`.
- `ZodError` is an `instanceof Error`, so `authErrorMessage` returns its `.message` property.
- `ZodError.message` is a JSON string: `[ { "validation": "email", "code": "invalid_string", ... } ]`.
- This raw JSON is rendered verbatim in the red error banner.

Fix:
- In `authErrorMessage`, detect `ZodError` (via `instanceof ZodError` or checking `.issues`) and map it to a human-readable string (e.g., "Please enter a valid email.").
- Or validate the form fields before calling `normalizeEmail` and show inline field errors.

### 22. [P2] "Use at least 8 characters" hint appears in login mode

Files:
- `apps/web/components/onboarding/onboarding-screen.tsx:245`

Problem:
- The hint `<p>Use at least 8 characters.</p>` is rendered unconditionally under the password field.
- It only makes sense during sign-up (new password creation), not login.
- Displaying it in login mode is misleading and implies a requirement that does not apply.

Fix:
- Conditionally render the hint only when `authMode === "signup"`.

### 23. [P2] `PageError` is a dead-end with no recovery action

Files:
- `apps/web/components/session/page-loading.tsx` (`PageError`)

Problem:
- `PageError` renders a title and message in a card but provides no button or link.
- It is used on dashboard, settings, recordings, search, and pending-approval pages when a session-backed API call fails.
- A user with an expired/invalid session who lands on any of these pages sees an error with no way to sign in again or navigate away.

Fix:
- Add a "Sign in again" button to `PageError` that navigates to `/onboarding`.
- Or handle 401 errors in each page client's catch block by calling `navigate("/onboarding")` instead of setting the error state.

### 24. [P2] Dashboard header settings button has no navigation

Files:
- `apps/web/components/dashboard-screen.tsx:117`

Problem:
- The settings gear `<button aria-label="Open settings">` in the dashboard header has no `onClick` handler and is not wrapped in a `<Link>`.
- Clicking it does nothing. The settings page is accessible only via the bottom nav.
- The badge on the button (showing pending approvals) is shown but leads nowhere.

Fix:
- Replace the `<button>` with `<Link href="/settings">` (keeping the badge rendering).

### 25. [P2] Settings "Pending approvals" row is not interactive

Files:
- `apps/web/components/settings/settings-screen.tsx:313`

Problem:
- The `SettingsRow` for "Pending approvals" has no `onClick` or `href`.
- It shows a badge count of pending doctors but clicking it does nothing.
- The pending doctor cards appear separately in "Owner review" below, but the row does not link or scroll to them.

Fix:
- Add `onClick` to scroll to the pending-approval section, or add `href` to a dedicated approval page.

### 26. [P2] Settings "Help & support" and "Terms and privacy" rows have no actions

Files:
- `apps/web/components/settings/settings-screen.tsx:488–489`

Problem:
- Both rows render as `<button>` elements via `SettingsRow` (since no `href` or `onClick` is provided).
- Clicking either does nothing. They appear interactive but are dead.

Fix:
- Wire "Help & support" to a support URL, help page, or email link.
- Wire "Terms and privacy" to a terms/privacy page or external URL.

### 27. [P2] "Summary prompt" badge always shows "Edited" regardless of saved prompt

Files:
- `apps/web/components/settings/settings-screen.tsx:180`

Problem:
- `const promptEdited = useMemo(() => DEFAULT_SUMMARY_PROMPT.length > 0, [])` always evaluates to `true` because the default prompt is non-empty.
- The "Edited" badge under "Summary prompt" in settings always appears, even when the doctor is using the default prompt.
- Doctors who have not customized their prompt see misleading "Custom prompt ready" / "Edited" labels.

Fix:
- Pass the doctor's `custom_prompt` value into `SettingsScreen`.
- Compare it to `DEFAULT_SUMMARY_PROMPT`: `const promptEdited = resolvedDoctor.custom_prompt !== null && resolvedDoctor.custom_prompt !== DEFAULT_SUMMARY_PROMPT`.

### 28. [P2] Phone field in doctor record stores email address, not phone number

Files:
- `apps/web/lib/server/supabase-auth.ts` (`userContact`)
- `apps/web/lib/server/onboarding.ts:128,152`

Problem:
- `createSupabaseAuthVerifier` maps `phoneNumber` to `userContact(user)`, which returns the user's email address (falling back to user ID).
- This value is passed as `phone` to `createOwner` and `createDoctorJoinRequest` and stored in the `phone` DB column.
- The settings screen renders this field with monospace font labelled as "phone", so every doctor's "phone" is their email address.
- There is no phone number input in the signup flow.

Fix:
- Add a phone number field to the signup profile step and pass it through `ProfileInputSchema`.
- Update `VerifiedUser` and `createSupabaseAuthVerifier` to correctly separate email from phone.
- Migrate existing records that have email addresses stored in the phone column.

### 29. [P2] Production deployment is behind the current codebase

Problem:
- The access-rejected page at `https://bharatdoc-web.vercel.app/access-rejected` shows "Join a different **clinic**" but the current code reads "Join a different **hospital**".
- This confirms the Vercel deployment has not picked up recent codebase changes.
- Other production/code divergences may exist.

Fix:
- Trigger a fresh Vercel deployment from the current `main` branch.
- Add a CI step that fails if production is behind main by more than N commits.

### 30. [P2] Expired/invalid session shows cryptic error instead of redirecting to sign-in

Files:
- `apps/web/components/dashboard-page-client.tsx`
- `apps/web/components/settings/settings-page-client.tsx`
- `apps/web/components/onboarding/pending-approval-page-client.tsx`

Problem:
- When a user has a stale or expired Supabase session token, the page client attempts an API call, which returns a 401/error.
- The catch block sets an error message ("Unable to load dashboard. Please sign in again.") and renders `PageError`.
- The user sees a dead-end error card with no way to re-authenticate (see finding #23).
- Expected behavior: detect the 401, sign out, and redirect to `/onboarding`.

Fix:
- In `readJsonOrThrow` (or the page client catch blocks), detect HTTP 401 responses and call `client.signOut()` then `navigate("/onboarding")` instead of setting error state.
- Add tests for expired-token behavior on each protected page.
