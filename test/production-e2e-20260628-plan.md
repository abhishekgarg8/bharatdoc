# BharatDoc Production E2E Plan

Run date: 2026-06-28
Production web: https://bharatdoc-web.vercel.app/
Production worker: https://bharatdocworker-production.up.railway.app
Requested browser: Chrome plugin
Report target: `suggestions.md`

## Checklist

- [x] Inspect repo routes, flows, and prior QA artifacts before testing.
- [x] Verify production availability, unauthenticated redirects, public help, and terms/privacy pages.
- [x] Test existing account login for the provided production account, dashboard access, navigation, settings, and sign-out.
- [x] Create and confirm a disposable owner account through Gmail alias, then complete owner onboarding and clinic creation.
- [x] Exercise authenticated core routes: dashboard, recording, recording detail, search, settings, language, prompt, help, and terms/privacy.
- [x] Exercise recording/transcription/summary/PDF flow or document any production blocker precisely.
- [ ] Test doctor join, pending approval gate, owner approval/rejection/admin controls, and approved doctor access where feasible.
- [x] Review console/network behavior and capture screenshot evidence from the Chrome pass.
- [x] Review implementation code for gaps tied to the observed behavior.
- [x] Write a detailed engineering improvement report to root-level `suggestions.md`.
