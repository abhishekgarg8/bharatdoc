# BharatDoc Phase 1 Implementation Plan

## Summary

Build Phase 1 as a staging-deployed pnpm TypeScript monorepo from the current PRD/design package. The MVP includes high-fidelity Bharat Warmth PWA screens, Firebase phone OTP onboarding, clinic owner approval, local audio recording, manual transcription, editable AI summaries, PDF generation, clinic-scoped patient search, Settings, and owner admin.

Testing is a first-class requirement: every implementation step lands with unit/API/UI coverage where applicable, plus repeated browser verification with screenshots during development.

## Key Decisions

- Monorepo: `apps/web`, `apps/worker`, `packages/shared`.
- Finish line: local app works, Supabase migrations/buckets are applied, Vercel/Railway staging deploys pass smoke tests.
- UI: implement Bharat Warmth closely using Tailwind tokens and reusable components.
- Data access: server-mediated Supabase access only; Next.js and Railway verify Firebase JWTs and use service role credentials server-side.
- AI: `gpt-4o-mini-transcribe` for transcription and `gpt-4o-mini` for summary generation, with optional env overrides.

## Implementation Plan

### 1. Scaffold and tooling

- Create pnpm workspace with TypeScript, Tailwind, ESLint, Prettier, Vitest, Playwright, and shared aliases.
- Add env validation for web and worker; split `.env` into app-specific files and keep secrets out of browser bundles.
- Add CI-style scripts: `typecheck`, `lint`, `test`, `test:unit`, `test:e2e`, `build`, `dev:web`, `dev:worker`.
- Add unit tests for env parsing, shared config, enum constants, prompt defaults, and schema exports.

### 2. Database, storage, and access control

- Add Supabase migrations for clinics, doctors, join requests, recordings, indexes, and private buckets.
- Implement shared Zod schemas and access helpers for Firebase JWT verification, doctor lookup, role checks, account status, and clinic scope.
- Add unit tests for schema validation, status transitions, clinic code generation, patient ID normalization, and access-control decisions.
- Add API tests for forbidden inactive users, rejected users, cross-clinic access, non-owner admin actions, and self-removal prevention.

### 3. Next.js PWA web app

- Implement app shell, route guards, bottom nav, Bharat Warmth tokens, and reusable UI primitives.
- Build onboarding, dashboard, recording, transcript, summary, PDF preview, search, settings, and owner admin screens.
- Add PWA manifest and service worker caching for app shell only; audio remains IndexedDB-only.
- Add component/unit tests for each reusable UI component and route guard.
- Add Playwright screenshots for every main screen at mobile viewport after each flow milestone.

### 4. Auth and onboarding APIs

- Implement Firebase phone OTP client flow and server registration endpoints.
- Owner path creates clinic, owner doctor row, active account, and clinic code.
- Doctor path looks up clinic code, creates pending doctor row, and creates join request.
- Add unit/API tests for owner creation, doctor join, duplicate pending request, invalid clinic code, pending gate, and rejected gate.
- Browser-test full owner onboarding and doctor pending approval with screenshots.

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

- Implement Express worker with `/health`, Firebase Admin verification, Supabase service role access, and structured error responses.
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
- Large-file splitting, full crash recovery, automatic queues, phone-call interruption handling, low-volume warning, analytics, localization, and push notifications remain Phase 2+.
