# BharatDoc Phase 1 Implementation Plan

## Summary

Build Phase 1 as a staging-deployed pnpm TypeScript monorepo from the current PRD/design package. The MVP includes high-fidelity Bharat Warmth PWA screens, Supabase email/password onboarding, clinic owner approval, local audio recording, manual transcription, editable AI summaries, PDF generation, clinic-scoped patient search, Settings, and owner admin.

Testing is a first-class requirement: every implementation step lands with unit/API/UI coverage where applicable, plus repeated browser verification with screenshots during development.

## Key Decisions

- Monorepo: `apps/web`, `apps/worker`, `packages/shared`.
- Finish line: local app works, Supabase migrations/buckets are applied, Vercel/Railway staging deploys pass smoke tests.
- UI: implement Bharat Warmth closely using Tailwind tokens and reusable components.
- Data access: server-mediated Supabase access only; Next.js and Railway verify Supabase Auth JWTs and use service role credentials server-side.
- AI: `gpt-4o-mini-transcribe` for transcription and `gpt-4o-mini` for summary generation, with optional env overrides.

## Implementation Plan

### 1. Scaffold and tooling

- Create pnpm workspace with TypeScript, Tailwind, ESLint, Prettier, Vitest, Playwright, and shared aliases.
- Add env validation for web and worker; split `.env` into app-specific files and keep secrets out of browser bundles.
- Add CI-style scripts: `typecheck`, `lint`, `test`, `test:unit`, `test:e2e`, `build`, `dev:web`, `dev:worker`.
- Add unit tests for env parsing, shared config, enum constants, prompt defaults, and schema exports.

### 2. Database, storage, and access control

- Add Supabase migrations for clinics, doctors, join requests, recordings, indexes, and private buckets.
- Implement shared Zod schemas and access helpers for Supabase Auth JWT verification, doctor lookup, role checks, account status, and clinic scope.
- Add unit tests for schema validation, status transitions, clinic code generation, patient ID normalization, and access-control decisions.
- Add API tests for forbidden inactive users, rejected users, cross-clinic access, non-owner admin actions, and self-removal prevention.

### 3. Next.js PWA web app

- Implement app shell, route guards, bottom nav, Bharat Warmth tokens, and reusable UI primitives.
- Build onboarding, dashboard, recording, transcript, summary, PDF preview, search, settings, and owner admin screens.
- Add PWA manifest and service worker caching for app shell only; audio remains IndexedDB-only.
- Add component/unit tests for each reusable UI component and route guard.
- Add Playwright screenshots for every main screen at mobile viewport after each flow milestone.

### 4. Auth and onboarding APIs

- [x] Replace Firebase phone OTP with Supabase email/password signup and login.
- [x] Implement Supabase Auth token verification for Vercel API routes and the Railway worker.
- [x] Owner path creates clinic, owner doctor row, active account, and clinic code.
- Doctor path looks up clinic code, creates pending doctor row, and creates join request.
- Add unit/API tests for owner creation, doctor join, duplicate pending request, invalid clinic code, pending gate, and rejected gate.
- [x] Browser-test full owner onboarding and doctor pending approval with screenshots.

### 5. Owner admin and Settings

- Implement Settings profile, transcription language, prompt editor, and owner-only admin tab.
- Owner can approve/reject pending doctors, view active doctors, and view/edit clinic profile/code.
- Prompt editor validates `{{transcript}}`, character limit, reset default, and sample test action.
- Add unit/API tests for prompt validation, owner authorization, approve/reject state changes, and badge count.
- Browser-test Settings and owner approval flows with screenshots before moving on.

### 6. Recording and local persistence

- Use RecordRTC and IndexedDB via `idb`; create local recording metadata and chunk audio every 30 seconds.
- Implement pre-record, active recording, pause, stop, playback, patient ID tagging, and manual "transcribe now/later".
- Merge local-only and server recordings on Dashboard; mark offline/local recordings clearly.
- Enforce 60-minute UI limit and require Patient ID before transcription/PDF.
- Add unit tests for IndexedDB repository logic, recording state machine, duration limit, metadata updates, and dashboard merge logic.
- Run browser media tests with mocked media in Playwright and manual local browser checks with screenshots.

### 7. Railway worker

- Implement Express worker with `/health`, Supabase Auth verification, Supabase service role access, and structured error responses.
- Add `/api/transcribe`, `/api/summarize`, and `/api/generate-pdf`.
- Transcription uploads audio to Supabase Storage, calls OpenAI, saves transcript, and sets status to `transcribed`.
- Summary fetches transcript/prompt server-side, calls OpenAI, saves summary, and sets status to `summary_ready`.
- PDF renders clinical letterhead, uploads private PDF, saves path, sets status to `pdf_saved`, and returns signed URL.
- Add unit tests with mocked OpenAI/Supabase for success, retryable failures, invalid ownership, missing patient ID, oversized audio, and PDF errors.

### 8. End-to-end flows

- Build Playwright flows for owner onboarding, doctor join pending, owner approval, dashboard, search, recording metadata, transcription, summary, PDF, and settings.
- Use mocked OpenAI for deterministic CI/browser tests; run one staging smoke test against real OpenAI after env wiring.
- Capture screenshots for all critical states: onboarding, pending, dashboard online/offline, recording, post-record, transcribing, transcript, summary, PDF, search, settings, admin.
- Use Computer Use/manual browser verification for OS/browser-level behavior that Playwright cannot fully validate, especially mic permission, PWA installability, mobile viewport feel, and screenshot review.

### 9. External review gap remediation

- [x] Slice A: production auth and demo-data safety.
- [x] Slice B: recording finalization, transcription retry idempotency, owner-scoped summary edits, and stale PDF invalidation.
- [x] Slice C: Unicode/multi-page PDF generation and atomic owner approval/rejection via Supabase RPC.
- [x] Apply the owner approval/rejection RPC migration to the linked Supabase project.
- [x] Apply the pending atomic onboarding RPC migration to the linked Supabase project.
- [x] Verify the migration with remote migration history, live auth smoke, full live AI smoke, and browser screenshot review.
- [x] P1-1: Upload transcription audio directly from the browser to Railway and gate worker CORS.
- [x] P1-2: Align Vercel/Railway env docs with required web API route secrets.
- [x] P1-3: Reconcile validation records with current live-smoke and staging-smoke status.
- [x] Close active P1 gap: reject finalized recording re-transcription and clear derived summary/PDF artifacts on valid transcription.
- [x] P1-4: Restore Settings sign-out so Supabase sessions are cleared and users return to onboarding.
- [x] P2-1: Support clinic-scoped partial Patient ID search while preserving clinic isolation.
- [x] P2-2: Replace pending approval hardcoded clinic details with authenticated live clinic, owner, and request data.
- [x] P3-1: Replace the fake recorder's mislabeled text blob with a valid WAV payload and matching upload extension.
- [x] Brand the Supabase signup confirmation email subject and HTML template as BharatDoc.
- [x] Remove Medical registration no. from shared schemas, onboarding UI, backend writes/selects, database migrations, PRD/design references, and tests.
- [x] Fix UI audit Critical issues: forgot password, password visibility, access-rejected actions, and dashboard settings navigation.
- [x] Finish partial gap #7: dashboard now uses live hospital context and pending approval counts instead of hardcoded owner badges.
- [x] Finish partial gap #11: hospital code is read-only/copyable in settings and removed from normal profile update contracts.
- [x] Finish partial gap #19: search results now render hospital, label, and PDF availability context from search-specific DTO fields.
- [x] Fix P1 gap: move onboarding owner and join-request writes behind atomic Supabase RPCs with duplicate-submit recovery.
- [x] Fix P1 gap: sanitize unknown web and worker server errors while preserving expected user-actionable errors.
- [x] Fix P1 gap: redirect expired protected-page sessions through Supabase sign-out and onboarding recovery.
- [x] Fix P1 gap: add clinic-code lookup throttling and miss telemetry for public lookup abuse guard.
- [ ] Config follow-up: replace the local `.env` anon key with the matching anon key for Supabase project `jtezgoegatwbvdqeogiy`; current validation uses a runtime override so `.env` remains untouched.

### 10. Production latency remediation

- [x] Make protected app shells static by moving explicit demo query handling from server pages into client-only hooks.
- [x] Pin Vercel API route functions to the Mumbai region with `preferredRegion = "bom1"`.
- [x] Collapse dashboard and search startup from `/api/me` plus `/api/recordings` into one `/api/dashboard` request.
- [ ] Deploy and verify the direct Railway transcription path in production. Skipped in this pass because Railway deployment is being handled separately.
- [x] Verify the latency remediation with focused tests, full web unit tests, lint, typecheck, production build, and browser screenshot smoke.
- [x] Mark request-scoped API routes as dynamic so the production build does not attempt authenticated/static API prerendering.
- [x] Add auth-session recovery for unreachable Supabase session checks so users are routed out of the loading screen instead of hanging.
- [x] Fix verification blockers from the PRD completion audit: web lint unused callback args, dashboard E2E password selector, and strict test assertions.
- [x] Fix PRD completion audit P2 gaps: readable auth validation errors, saved custom-prompt Settings badge, stale local/server dashboard merge precedence, and unsupported Settings row affordances.
- [x] Remove unavailable delete-account Settings row and clarify the doctor join code with unit, browser E2E, and screenshot verification.
- [x] Make the Settings profile edit affordance functional with authenticated profile updates, focused tests, browser E2E, and screenshot verification.
- [x] Fix clinic-scoped recording detail read-only ownership with a `can_edit` API/UI contract and verified server/client tests.
- [x] Fix iOS audio capture MIME negotiation by adding MP4/AAC candidates and `.m4a` upload naming for AAC/MP4 audio.
- [x] Fix recording screen clinic and reconnect context by showing authenticated hospital name plus Online/Offline state and keeping local audio for retry.
- [x] Fix dashboard recent-record scope by loading clinic-scoped consultations instead of only the signed-in doctor's rows.
- [x] Fix onboarding join consistency by replacing hospital-ID selection with Clinic Code lookup and `join_clinic` registration.
- [x] Finish owner admin hardening with active doctor recording counts, remove-from-clinic, removed-doctor audit history, and re-approve flow.
- [x] Add Railway worker large-audio splitting and transcript stitching above the per-call transcription size.
- [x] Align the PRD auth source of truth to Supabase email/password while documenting legacy `firebase_uid` and `phone` column names.
- [x] Add a repeatable real-account browser E2E runner with screenshots, email-confirmation resume support, fake microphone audio, and a dry-run gate before account creation.
- [x] Add a runtime Supabase anon-key wrapper so real E2E commands can use the current linked-project anon key without editing `.env`.
- [x] Commit, push, merge, wait for Vercel production deployment, and verify the live app with real-account audio E2E screenshots at `https://bharatdoc-web.vercel.app/`.

### 11. Production diagnostic logging and transcription recovery

- [x] Investigate the production failure for patient `301748995` in clinic `Testing 1+2` and confirm the worker received audio but OpenAI rejected the transcription attempts.
- [x] Add persistent server-side diagnostic storage plus richer transcription attempt metadata for request IDs, stages, uploaded audio paths, audio size/MIME, and upstream provider errors.
- [x] Add device-local diagnostic logs for recording capture, metadata sync, transcription start/success/failure, and recording-detail retries, with authenticated flush to `/api/device-logs`.
- [x] Add server-stored audio retry so recording detail transcription can recover when IndexedDB audio is unavailable on the current device.
- [x] Apply and verify the linked Supabase production migration for `diagnostic_logs` and transcription-attempt metadata without changing `.env`.
- [x] Verify the diagnostic logging and retry changes with focused worker, web, and migration-contract tests.

## Testing Discipline

- No implementation step is considered complete without matching tests in the same pass.
- Shared logic gets unit tests first or alongside implementation.
- Server endpoints get API tests with auth/scope coverage.
- UI flows get Playwright tests and screenshots at 412px mobile viewport.
- Visual regressions are checked by comparing screenshots against the designer intent before proceeding to the next feature group.
- Local verification loop after each milestone: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, targeted Playwright flow, screenshot review.
- Final verification: full local test suite, full browser smoke suite, staging deploy smoke test, and screenshot archive.

## Assumptions

- Phase 1 includes MVP plus recording/offline risk probes, not full Phase 2 hardening.
- Browser and Computer Use checks are part of the build process, not optional post-launch QA.
- Full crash recovery, automatic queues, phone-call interruption handling, low-volume warning, analytics, localization, and push notifications remain Phase 2+.
