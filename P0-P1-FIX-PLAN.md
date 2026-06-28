# P0/P1 Fix Plan

- [x] Read `suggestions.md` and identify the P0/P1 scope.
- [x] Fix P0 account leakage by scoping browser-local recordings to the authenticated doctor context.
- [x] Add P0 regression coverage for scoped local dashboard records and interrupted recording recovery.
- [x] Fix P1 signup failures so Supabase/provider errors produce actionable recovery messages.
- [x] Add P1 regression coverage for duplicate signup, rate-limit, email delivery, disabled signup, captcha, and unknown provider failures.
- [x] Fix P1 PDF status UI so internal storage paths are never rendered to users.
- [x] Add P1 regression coverage for generated PDF status without exposing storage paths.
- [x] Run focused tests for changed areas.
- [x] Run full web unit tests.
- [x] Run typecheck and lint.
- [x] Verify the user-visible PDF state in Chrome with Computer Use.
- [x] Confirm `.env` was not modified.
