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
