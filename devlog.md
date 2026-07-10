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
