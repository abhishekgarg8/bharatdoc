2026-07-06 - Issue #30: Added PGIMER auto-approval for normalized clinic-code joins.
Implemented shared clinic-code normalization, server-derived autoApprove, and a guarded Supabase RPC update.
PGIMER doctors remain role=doctor but start active with an approved join-request audit row; other clinics stay pending.
Updated PGIMER onboarding copy/CTA to join directly and covered the route in unit/E2E tests.
Verified with focused Vitest suites, lint, typecheck, production build, and local browser screenshots in testing/issue-30-pgimer-auto-approval.

2026-07-07 - Issue #32: Fixed mobile responsiveness risks across public and app web surfaces.
Compacted public mobile nav, removed off-viewport CTA decoration, and made key touch targets 44px.
Made dashboard/search/settings long strings truncate safely and lifted the recording FAB above safe-area nav.
Added responsive Playwright guards for mobile overflow and tap targets.
Verified with lint, typecheck, focused Vitest, production build, Playwright checks, and screenshots in testing/issue-32-mobile-responsiveness.

2026-07-07 - Issue #33: Added a skippable three-screen onboarding explainer at /onboarding.
Moved the existing signup/login wizard to /signup and sent recovery/login flows there directly.
Kept marketing Get started CTAs on /onboarding so first-time users see the explainer first.
Covered the split routes with unit tests, Playwright checks, PWA shell routing, and production build.
Merged PR #37, waited 3 minutes, then verified production login reached /dashboard with the test account.
Saved local and production screenshots/videos in testing/issue-33-onboarding-explainer.

2026-07-08 - PGIMER onboarding copy annotation update.
Changed the PGIMER hospital entry headline and body copy to the requested exclusive-doctor positioning.
Kept the existing responsive layout/tokens and refreshed unit/E2E assertions for the new strings.
Merged PR #40 after Vercel passed, waited 3 minutes, then verified production /h/pgimer and login to /dashboard.
Saved verification screenshots in testing/pgimer-copy-annotation.

2026-07-08 - Issue #45: Hid internal PDF storage paths from doctor UI.
Added persisted PDF metadata and returned `has_pdf`, generated timestamp/version, and signed URL instead of object keys.
Kept raw storage paths only in server/worker internals for signing/deletion and covered absence in focused tests.
Merged PR #46 after Vercel passed, waited 3 minutes, then verified production login and a saved-PDF detail panel.
Saved masked production evidence in testing/issue-45-hide-pdf-paths.

2026-07-08 - Issue #44: Quarantined legacy unscoped local recordings.
Scoped dashboard/detail local recording reads to the active auth user, doctor, and clinic.
Added hidden local recovery UI for all-null legacy IndexedDB records with Patient IDs/labels masked until ownership confirmation.
Kept foreign/partial scoped local records out of normal UI and recovery, and stripped Patient IDs from queued device logs.
Merged PR #48 after Vercel passed, waited 3 minutes, then verified production with the test account.
Saved production recovery-card evidence in testing/issue-44-production-quarantine.

2026-07-08 - Issue #43: Added database-level PHI RLS backstop policies.
Scoped direct authenticated Supabase access for clinics, doctors, join requests, and recordings by doctor/clinic/owner context.
Documented trusted service-role bypasses and kept app-route cross-clinic guards covered with focused tests.
Merged PR #50 after Vercel passed, waited 3 minutes, then verified production dashboard auth with the test account.
Saved sanitized production evidence in testing/issue-43-production-rls-backstop.

2026-07-08 - Issue #42: Rendered structured clinical summaries in web and PDF.
Added shared summary parsing/sanitization so Markdown headings become stable clinical sections.
Normalized generated/saved summaries before persistence, rendered section previews in web, and styled sections/timestamps in PDFs.
Merged PR #52 after Vercel passed, waited 3 minutes, then verified production login/dashboard with the test account.
Saved sanitized production evidence in testing/issue-42-production-structured-summaries.

2026-07-09 - Issue #29: Added Supabase email-confirmation callback flow.
Signup confirmations now redirect to /auth/callback, recover code/hash/token_hash sessions, scrub URL auth material, and route through dashboard/onboarding/approval gates.
Updated Supabase redirect/template repo config and docs for token_hash confirmation links without open redirects.
Covered valid, expired, already-used, missing-profile, and template cases with focused tests plus browser evidence in testing/issue-29-auth-callback.

2026-07-10 - Issue #57: Restricted clinic diagnostic logs to authorized active operators.
Required active accounts for ingestion, active owners for reads, and server-derived clinic scope on every request.
Allowlisted client telemetry and response fields so patient IDs, messages, URLs, paths, and crafted values cannot leak.
Added route/service/repository regressions; 345 web tests, lint, typecheck, and production build passed.
Merged PR #86, waited 3 minutes, then verified production with the supplied active-owner test account.
Saved sanitized HTTP 202/200/401, no-store, and redaction evidence in testing/issue-57-production-diagnostic-log-auth.

2026-07-10 - Issue #58: Made saved local recordings reopenable by exact stable ID.
Validated auth-user, doctor, and clinic scope; added safe interrupted/failed retry states and state-specific dashboard actions.
Persisted reopened metadata, reused server IDs to prevent duplicate transcription records, and enabled offline query-route app-shell recovery.
Added StrictMode, scope-isolation, retry/idempotency, offline-cache, and full record-to-reopen E2E coverage; 356 web tests passed.
Merged PR #88, waited 3 minutes, then verified exact reopen, two reloads, persisted edits, and no duplicate production metadata POST.
Saved screenshot/video evidence in testing/issue-58-production-local-reopen and removed all synthetic server/device data.

2026-07-10 - Issue #59: Made local audio checkpoints ordered, durable, and failure-aware.
Added 20-second/native lifecycle checkpoints, strict sequence/timing/MIME validation, stop-time draining, and quota guidance.
Preferred native MediaRecorder containers and validated canonical WAV fallback assembly for interrupted recovery.
Added first/mid-write, race, lifecycle, recovery, and container regressions; 371 web tests and the production build passed.
Merged PR #90, waited 3 minutes, then decoded periodic/recovery chunks and the 125.88-second canonical WebM in production Chrome.
Saved screenshot/video evidence in testing/issue-59-production-audio-checkpoints and removed the synthetic IndexedDB record.

2026-07-10 - Issue #60: Guaranteed microphone cleanup throughout recorder lifecycle and navigation races.
Added idempotent disposal, exactly-once track release, bounded stop settlement, and serialized failure handling.
Interlocked active-capture navigation with Stop & Save / Continue while retaining safe refresh protection.
Added setup/start/pause/resume/chunk/stop/unmount/race regressions; 386 web tests and the production build passed.
Merged PR #92, waited 3 minutes, then verified production track state changed live to ended without a second prompt.
Saved screenshot/video evidence in testing/issue-60-production-recorder-cleanup and removed the synthetic IndexedDB record.

2026-07-10 - Issue #61: Rejected transcription uploads before buffering untrusted request bodies.
Added reusable header-only auth, per-IP/user rates, declared/multipart bounds, and one process-wide processing permit.
Kept permits through multipart and stored-audio pipelines with idempotent success/error/abort/close release.
Covered parser order, 401/403/413/429 contracts, isolation, concurrency, ownership, and cleanup; 71 worker tests passed.
Merged PR #94, waited 3 minutes, then verified the production BharatDoc-to-Railway path with the supplied account.
Production returned 401 before malformed multipart parsing and 429 plus Retry-After after six admitted user requests.
Saved sanitized screenshot/video/JSON evidence in testing/issue-61-production-preauth-upload without creating records.

2026-07-10 - Issue #75: Removed patient identifiers from search, detail, back-navigation, and telemetry URLs.
Replaced query-string search with a bounded POST-only API and private no-store responses.
Added account/doctor/clinic-scoped, expiring session state so search results restore without URL state.
Covered route, auth, cache, telemetry, search, and detail behavior with 78 focused tests; focused lint passed.
Merged PR #97, waited over 3 minutes, and verified the deployed production flow with the supplied account.
Production confirmed POST path-only requests, clean links, reload/back restoration, and sanitized telemetry.
Saved visually reviewed masked screenshots locally in testing/issue-75-phi-safe-navigation; raw PHI was not committed.

2026-07-10 - Issue #77: Added a typed authenticated route shell with one minimal no-store doctor/clinic bootstrap.
Centralized auth changes, routing, retries, expiry recovery, bounded requests, and a 24-hour exact-scope offline cache.
Kept patient/record payloads page-specific; 437 web tests, full TypeScript, lint, and the Next/PWA build passed.
Merged PR #100, caught a doubled bearer header in production, then fixed it test-first in PR #102.
After the second deploy wait, production returned 200 for both bootstrap and dashboard with one identical bearer value.
Verified minimal bootstrap/cache fields plus an offline dashboard reload without a server record request or error.
Saved visually reviewed masked screenshots locally in testing/issue-77-authenticated-app-shell; no PHI was committed.

2026-07-11 - Issue #62: Added durable idempotency, quotas, leases, retry recovery, and artifact accounting for AI work.
Validated immutable transcription manifests, one active operation per recording, per-doctor/clinic limits, and PHI-free metrics.
Merged PRs #99 and #101 with migrations, then found a stale PDF completion race during production verification.
Fixed authoritative completed-job replay and artifact cleanup ownership test-first in PR #104.
Passed 96 worker tests plus lint, typecheck, build, migration contracts, and earlier web/shared gates.
After the full deploy wait, production returned concurrent PDF 200/200 and replay 200 with one provider call and one current artifact.
Saved sanitized pre-fix and passing screenshots/JSON plus the passing video in testing/issue-62-production-ai-processing-controls.
Removed the synthetic record, storage objects, processing rows, attempts, and matching diagnostic logs after verification.

2026-07-11 - Issue #63: Upgraded unsupported Next.js 14 to 15.5.20 and unified React 19.2.7.
Removed vulnerable Workbox dependencies and shipped a bounded owned worker that never caches API, auth, query, or private responses.
Added dynamic API no-store policy tests, weekly/on-PR production audits, grouped Dependabot updates, and the security/performance report.
Reduced 25 production advisories (11 high) to zero; 447 web tests, 96 worker tests, lint, typecheck, two builds, PWA smoke, and 29 browser tests passed.
Merged PR #106 after the production-audit and Vercel checks passed.
After the full three-minute deploy wait, verified the exact merge commit with the supplied authenticated production account.
Production returned API 200/no-store/BYPASS, an activated worker, bounded 4/36 owned caches, and zero sensitive cache keys.
Saved sanitized screenshots/video/JSON in testing/issue-63-production-security-upgrade; no patient identifiers or credentials were committed.
