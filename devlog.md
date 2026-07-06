2026-07-06 - Issue #30: Added PGIMER auto-approval for normalized clinic-code joins.
Implemented shared clinic-code normalization, server-derived autoApprove, and a guarded Supabase RPC update.
PGIMER doctors remain role=doctor but start active with an approved join-request audit row; other clinics stay pending.
Updated PGIMER onboarding copy/CTA to join directly and covered the route in unit/E2E tests.
Verified with focused Vitest suites, lint, typecheck, production build, and local browser screenshots in testing/issue-30-pgimer-auto-approval.
