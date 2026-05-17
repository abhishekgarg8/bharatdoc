# BharatDoc PRD Completion Audit

Last updated: 2026-05-17.

This audit maps the requested end state to concrete repo evidence. A checkbox should only be marked complete after code, tests, and browser evidence cover the item.

## Objective Criteria

- [x] Implement the BharatDoc PRD end to end.
      Evidence: PRD implementation was verified locally, merged through PR #5, deployed to Vercel production commit `80e60dff630589c96b547f39342bacbe72e5aa67`, and production real-account E2E completed through dashboard, settings, recording, audio-file transcription, summary, PDF, and search on 2026-05-17.
- [x] Support real account signup/login using the connected email path.
- [x] Capture browser screenshots for the real signup and core app flows.
- [x] Keep `.env` unchanged.
- [x] Test each completed step before moving on.
- [x] Update `implementation-plan.md` checkboxes only after the implementation and verification are complete.

## Current Verified Baseline

- [x] Workspace scripts exist for build, lint, unit tests, E2E tests, live smoke, PWA smoke, and staging smoke.
      Evidence: `package.json`, `apps/web/package.json`, `apps/worker/package.json`.
- [x] Repeatable real-account browser E2E runner exists and has a safe dry-run gate plus audio-file fallback for deterministic worker coverage.
      Evidence: `scripts/real-account-browser-e2e.mjs`, `scripts/with-current-supabase-anon-key.mjs`, `docs/real-account-browser-e2e.md`, and `pnpm smoke:real-browser`; wrapped dry run against `https://bharatdoc-web.vercel.app` saved `output/playwright/real-account-2026-05-17/01-onboarding-entry.png` and stopped before credential entry/account creation on 2026-05-17; local real-account run on 2026-05-17 completed through `18-search-results.png`; production run saved `output/playwright/production-real-account-2026-05-17/18-search-results.png`.
- [x] Unit/API/component tests pass.
      Evidence: `pnpm test` passed shared 39 tests, worker 50 tests, and web 244 tests on 2026-05-17 after the real-browser runner/runbook changes.
- [x] TypeScript typecheck passes.
      Evidence: `pnpm typecheck` passed on 2026-05-17 after the real-browser runner/runbook changes.
- [x] Lint passes after fixing unused test callback args.
      Evidence: `pnpm lint` passed on 2026-05-17 after the real-browser runner/runbook changes.
- [x] Production build passes without authenticated API routes being statically prerendered.
      Evidence: `pnpm build` passed on 2026-05-17 after marking request-scoped API route handlers dynamic and after the real-browser runner/runbook changes.
- [x] Expired/unreachable Supabase sessions recover instead of hanging on session loading.
      Evidence: `apps/web/lib/client/auth-client.ts` times out hung session lookup and maps network auth errors to readable copy; `pnpm --filter @bharatdoc/web test -- lib/client/auth-client.test.ts components/session/session-gate.test.tsx` passed with 243 web tests on 2026-05-17.
- [x] Demo browser E2E passes after fixing the password-field selector.
      Evidence: `pnpm --filter @bharatdoc/web test:e2e` passed 16/16 on 2026-05-17 after the real-browser runner/runbook changes.
- [x] Server-side Supabase reads avoid stale Next fetch cache for authenticated routes.
      Evidence: `apps/web/lib/server/supabase.ts` injects `cache: "no-store"` into the service-role Supabase client; `apps/web/lib/server/supabase.test.ts` verifies the source contract; live local `/api/me` and `/api/dashboard` returned 200 for the real owner after onboarding on 2026-05-17.
- [x] Live Supabase auth/onboarding/approval smoke passes against current local code.
      Evidence: `LIVE_FLOW_SKIP_AI=1 LIVE_FLOW_WEB_URL=http://127.0.0.1:3000 node --env-file=../../.env ../../scripts/live-flow-smoke.mjs` passed using a runtime current anon-key override on 2026-05-17; owner creation, doctor join, owner approval, `/api/me`, and preferences returned successfully.
- [x] Live AI smoke passes against current local code and worker.
      Evidence: `LIVE_FLOW_WEB_URL=http://127.0.0.1:3000 LIVE_FLOW_WORKER_URL=http://127.0.0.1:8080 node --env-file=../../.env ../../scripts/live-flow-smoke.mjs` passed using a runtime current anon-key override on 2026-05-17 with statuses `transcribed`, `summary_ready`, and `pdf_saved`.
- [x] Local Chrome demo screenshots verified dashboard and settings surfaces.
      Evidence: Computer Use screenshots of `http://127.0.0.1:3000/dashboard?demo=1` and `/settings?demo=1`.

## Phase 1 MVP Checklist

- [x] Supabase Auth email/password signup + login.
      Evidence: `apps/web/lib/client/auth-client.ts`, `apps/web/components/onboarding/onboarding-screen.tsx`.
- [x] Clinic/hospital creation for owner.
      Evidence: `apps/web/lib/server/onboarding.ts`, `apps/web/lib/server/supabase-onboarding-repository.ts`, `supabase/migrations/202604250004_atomic_onboarding_rpcs.sql`.
- [x] Clinic Code join flow is product-consistent.
      Evidence: onboarding join now requires a six-character Clinic Code lookup and submits `join_clinic` with `clinic_code`; onboarding/client/server/schema tests passed on 2026-05-17.
- [x] Approval flow and pending/rejected gates.
      Evidence: `apps/web/lib/server/pending-approval.ts`, `apps/web/lib/server/clinic-admin.ts`.
- [x] Owner admin tab for pending approvals, active doctors, and clinic profile.
      Evidence: `apps/web/components/settings/settings-screen.tsx`.
- [x] Owner admin remove/reapprove/audit history and recording counts.
      Evidence: owner admin now exposes active-doctor recording counts, remove-from-clinic, removed-doctor audit history, and re-approve actions with self-removal protection; focused admin/settings tests passed on 2026-05-17.
- [x] Recording screen with RecordRTC and IndexedDB persistence.
      Evidence: `apps/web/components/recordings/recording-screen.tsx`, `apps/web/lib/client/local-recordings.ts`.
- [x] Recording screen shows clinic context and online/offline/reconnect state.
      Evidence: `NewRecordingPageClient` passes authenticated clinic context into `RecordingScreen`, which shows Online/Offline state and keeps local audio available until reconnect; recording tests passed on 2026-05-17.
- [x] Manual transcription through Railway/OpenAI path.
      Evidence: `apps/web/lib/client/transcription-api.ts`, `apps/worker/src/transcription.ts`.
- [x] Large audio chunk splitting and stitching.
      Evidence: Railway worker now accepts uploads above the per-call transcription size, splits them into sequential transcription parts, stitches non-empty transcript parts, and saves the combined transcript; worker tests passed on 2026-05-17.
- [x] Summary generation with default/custom prompt.
      Evidence: `apps/worker/src/summary.ts`, `packages/shared/src/prompts.ts`.
- [x] Editable summary view and stale PDF invalidation on save.
      Evidence: `apps/web/components/recordings/transcript-summary-screen.tsx`, `apps/web/lib/server/supabase-recordings-repository.ts`.
- [x] PDF generation and private Supabase Storage signed URL.
      Evidence: `apps/worker/src/pdf-generation.ts`, `apps/worker/src/pdf-renderer.ts`.
- [x] Patient ID tagging before transcription/PDF.
      Evidence: `apps/web/components/recordings/recording-screen.tsx`, `apps/web/lib/server/recordings.ts`, `apps/worker/src/transcription.ts`.
- [x] Dashboard scope is product-consistent.
      Evidence: dashboard recent records now use `listRecentClinicRecordings(clinicId, limit)` and the Supabase query filters by `clinic_id`; server/dashboard tests passed on 2026-05-17.
- [x] Clinic-scoped Patient ID search, partial/prefix matching, signed PDF context.
      Evidence: `apps/web/lib/server/recordings.ts`, `apps/web/lib/server/supabase-recordings-repository.ts`, `apps/web/components/search/search-screen.tsx`.
- [x] Clinic-scoped recording detail respects read-only ownership.
      Evidence: `can_edit` is returned by `apps/web/lib/server/recordings.ts`, mapped in `apps/web/lib/client/recording-detail-data.ts`, enforced in `apps/web/components/recordings/transcript-summary-screen.tsx`, and verified by focused recording detail tests on 2026-05-17.
- [x] Settings profile, prompt editor, language, sign-out, hospital admin surface.
      Evidence: `apps/web/components/settings/*`, `apps/web/lib/server/settings.ts`.
- [x] Settings unsupported rows are not misleading.
      Evidence: unsupported Settings rows render as non-interactive unavailable/not-configured rows in `apps/web/components/settings/settings-screen.tsx`, verified by Settings tests on 2026-05-17.
- [x] PWA manifest and service-worker build.
      Evidence: `apps/web/app/manifest.ts`, `apps/web/next.config.mjs`, E2E manifest test.

## Known Product Contract Mismatches

- [x] PRD/auth source of truth is unresolved: PRD still says Firebase phone OTP, implementation uses Supabase email/password and legacy `firebase_uid`/`phone` naming.
      Evidence: `Plan/BharatDoc_PRD.md` now identifies Supabase email/password auth and documents `firebase_uid`/`phone` as legacy database column names used for Supabase Auth user ID/contact values.
- [x] iOS recording MIME negotiation does not try MP4/AAC.
      Evidence: `apps/web/lib/client/audio-recorder.ts` now tries WebM, MP4, AAC, and WAV; upload filename handling maps AAC/MP4 to `.m4a`; web and worker audio tests pass on 2026-05-17.
- [x] Auth validation errors can show raw Zod JSON for empty email/password parse failures.
      Evidence: `apps/web/lib/client/auth-client.ts` maps Zod validation issues to user-readable messages, verified by auth client tests on 2026-05-17.
- [x] Summary prompt badge always shows edited because it does not compare against saved custom prompt.
      Evidence: Settings maps `custom_prompt` into the screen and compares saved prompt text against `DEFAULT_SUMMARY_PROMPT`, verified by Settings tests on 2026-05-17.
- [x] Stale local dashboard records can mask newer server statuses for the same server recording ID.
      Evidence: `mergeDashboardRecords` now prefers server records over synced local duplicates, verified by dashboard data tests on 2026-05-17.

## Real Account E2E Gate

- [x] Identify the connected email account to use.
      Evidence: Gmail connector profile returned `abhishekgarg8@gmail.com`; proposed signup alias is `abhishekgarg8+bharatdoc-codex-20260517@gmail.com`.
- [x] Verify the connected email confirmation retrieval path is available.
      Evidence: Gmail search found prior Supabase Auth `Confirm Your Signup` emails delivered to `abhishekgarg8+...@gmail.com` aliases.
- [x] Create a real Supabase account through the browser signup UI.
      Evidence: browser signup submitted `abhishekgarg8+bharatdoc-codex-20260517@gmail.com`; Gmail received `Confirm your BharatDoc account` from Supabase Auth at 2026-05-17T18:33:19Z.
- [x] Retrieve/confirm the signup email through the connected email path or documented callback.
      Evidence: Gmail connector read the confirmation email and extracted the Supabase confirmation URL; browser callback screenshot saved as `03-email-confirmed-callback.png`.
- [x] Complete profile and owner/doctor onboarding.
      Evidence: real owner profile `Dr. Real E2E 4739` and clinic `Real E2E Clinic 34739` were created in Supabase and local `/api/me` plus `/api/dashboard` returned active owner status on 2026-05-17.
- [x] Exercise dashboard, settings, recording, transcription, summary, PDF, and search with screenshots.
      Evidence: `REAL_E2E_BASE_URL=http://127.0.0.1:3000 REAL_E2E_PHASE=resume ... pnpm with:current-supabase-anon pnpm smoke:real-browser` completed on 2026-05-17 and saved screenshots `05-dashboard-after-login.png`, `09-settings.png`, `10-recording-ready.png`, `11-recording-active.png`, `12-recording-saved.png`, `13-recording-transcribed-audio-file.png`, `14-dashboard-with-real-recording.png`, `15-recording-detail-transcript.png`, `16-recording-detail-summary.png`, `17-recording-detail-pdf.png`, and `18-search-results.png`.
- [x] Confirm no `.env` changes were made.
      Evidence: `git status --short -- .env` returned no changes on 2026-05-17.

## Production Deployment Gate

- [x] Commit, push, and merge the verified code to trigger Vercel auto-deploy.
      Evidence: branch `codex/prd-real-e2e-prod` was pushed, PR #5 included `@codex please review`, Vercel preview passed, and the PR was squash-merged to `main` as `80e60dff630589c96b547f39342bacbe72e5aa67` on 2026-05-17.
- [x] Wait for the Vercel deployment and verify `https://bharatdoc-web.vercel.app/`.
      Evidence: after a five-minute wait, Vercel reported production deployment `dpl_3ZYKzoDd8L1a5jZsKjjNtsPGjBeR` as `READY` for commit `80e60dff630589c96b547f39342bacbe72e5aa67`, and `curl -I -L https://bharatdoc-web.vercel.app/` returned `HTTP/2 200`.
- [x] Run production real-account E2E with a real Gmail alias and audio file after deployment.
      Evidence: `REAL_E2E_BASE_URL=https://bharatdoc-web.vercel.app REAL_E2E_PHASE=resume ... pnpm with:current-supabase-anon pnpm smoke:real-browser` completed on 2026-05-17 using `abhishekgarg8+bharatdoc-codex-20260517@gmail.com`; screenshots saved under `output/playwright/production-real-account-2026-05-17/` through `13-recording-transcribed-audio-file.png`, `16-recording-detail-summary.png`, `17-recording-detail-pdf.png`, and `18-search-results.png`.

## Current Live Follow-ups

- [ ] Local `.env` still has a stale anon key.
      Evidence: the Supabase project `jtezgoegatwbvdqeogiy` woke from `COMING_UP`, `/auth/v1/health` returns 200 with the current anon key from Supabase CLI, live smokes pass with a runtime override, and `pnpm with:current-supabase-anon` injects the current anon key into child processes only; `.env` remains unchanged per repo instruction, so local/deployed environments still need the matching anon key outside this run.
