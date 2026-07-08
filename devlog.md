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
