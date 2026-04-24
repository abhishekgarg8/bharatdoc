# BharatDoc Implementation Log

This file is the append-only execution log for BharatDoc Phase 1.

- Purpose: record what was implemented, in what order, how it was implemented, how it was tested, and what remains blocked.
- Rule: append new entries to the end of this file as future work lands. Do not rewrite prior history except to correct factual mistakes.
- Chronology note: entries below are ordered by implementation sequence, not by git commit boundaries.
- Current snapshot date: April 23, 2026.

## 0. Planning and repo understanding

### What was done

- Read the PRD and plan/design package in `Plan/`.
- Mapped the Phase 1 scope into execution slices.
- Wrote the detailed Phase 1 implementation plan in `implementation-plan.md` at repo root.

### How it was done

- Broke the PRD into product slices instead of trying to build everything at once.
- Made testing a hard requirement in the plan itself: unit tests, API tests, browser E2E, screenshots, and local smoke checks.
- Chose a monorepo structure with clear ownership:
  - `apps/web`
  - `apps/worker`
  - `packages/shared`

### Why this mattered

- It established a stable execution order.
- It kept the later implementation work incremental and testable.

## 1. Monorepo foundation and shared package

### What was done

- Set up the pnpm workspace and split the app into web, worker, and shared packages.
- Added the core developer workflow:
  - `build`
  - `lint`
  - `typecheck`
  - `test`
  - `test:unit`
  - `test:e2e`
  - `dev:web`
  - `dev:worker`
- Added shared types, schemas, prompt defaults, env helpers, and recording lifecycle utilities.

### How it was done

- Built the shared package first so both web and worker could depend on the same source of truth.
- Used TypeScript + Zod for shared contract validation rather than hand-rolled runtime checks.
- Centralized reusable business rules in `packages/shared/src`.

### Testing

- Added unit tests for:
  - env parsing
  - schema exports
  - prompt defaults
  - clinic code generation
  - access helpers
  - recording lifecycle transitions

## 2. Database, access control, and server-side foundations

### What was done

- Added the Supabase-facing application data model for:
  - clinics
  - doctors
  - clinic join requests
  - recordings
- Implemented server-mediated access patterns so the browser does not directly own privileged data access.
- Added role and clinic-scope enforcement paths for owner vs doctor workflows.

### How it was done

- Kept Firebase verification and Supabase service-role access on the server side.
- Built server helpers for doctor lookup, clinic ownership, account status checks, and clinic scoping.
- Used repository-style server modules so business logic stayed testable outside the route handlers.

### Testing

- Added unit and API-level coverage for:
  - invalid status access
  - cross-clinic access rejection
  - non-owner admin rejection
  - schema validation and shared contract behavior

## 3. Bharat Warmth PWA shell and core app UI

### What was done

- Implemented the Phase 1 mobile-first Bharat Warmth shell and screen system.
- Built the main app surfaces:
  - onboarding
  - pending approval
  - dashboard
  - recording detail
  - settings
  - navigation shell
- Added app-shell PWA support and the Bharat Warmth visual system.

### How it was done

- Built reusable UI primitives first, then assembled screens from those primitives.
- Kept the design mobile-first and constrained to the 412px class of viewport used in browser verification.
- Added route-level app pages under `apps/web/app`.

### Testing

- Added component tests for reusable UI and route/screen behavior.
- Added Playwright mobile coverage and screenshot capture for the main screens.

## 4. Summary and PDF workflow

### What was done

- Implemented the summary and PDF generation workflow for completed consultations.
- Added the transcript -> editable summary -> PDF progression in the recording detail surface.
- Added the worker-side behavior for summary generation and PDF creation.

### How it was done

- Kept the AI-heavy work in the worker rather than the web app.
- Stored recording state transitions so the UI could reflect transcript-ready, summary-ready, and PDF-ready states.
- Connected the detail page UI to the worker APIs through server-side proxies/client helpers.

### Testing

- Added worker tests for summary and PDF paths.
- Added web tests for recording detail states.
- Added Playwright coverage for summary generation and PDF-ready screens.

## 5. Search slice

### What was done

- Added `/search` with clinic-scoped Patient ID search.
- Wired dashboard search affordances and bottom-nav behavior into the new route.
- Added completed-consultation search result handling and detail navigation.

### How it was done

- Built search as a real route instead of a dashboard-only filter.
- Scoped patient lookups to the clinic context.
- Kept the search UI and dashboard navigation aligned with the Bharat Warmth mobile layout.

### Testing

- Added unit coverage for:
  - search behavior
  - bottom-nav active state
  - dashboard search link behavior
- Added Playwright flow coverage:
  - dashboard -> search -> result -> recording detail
- Captured search mobile screenshots in `output/playwright/`.

## 6. Local recording foundation

### What was done

- Added local recording lifecycle helpers and local persistence.
- Implemented an IndexedDB-backed recording repository.
- Added recording metadata support for patient ID, timestamps, duration, and local state.

### How it was done

- Kept local recording state in the browser using IndexedDB and blob storage.
- Added a memory-backed test repository to make repository logic fast to test.
- Defined the recording lifecycle in shared logic so UI code was not inventing transitions ad hoc.

### Key implementation pieces

- `packages/shared/src/recordings.ts`
- `apps/web/lib/client/local-recordings.ts`

### Testing

- Added unit tests for:
  - repository reads/writes
  - state transitions
  - duration limits
  - patient ID validation

## 7. Recording UI flow and transcription integration

### What was done

- Added `/recordings/new` and the recording-screen flow.
- Implemented:
  - pre-record state
  - active recording
  - pause/resume
  - stop
  - playback
  - patient ID tagging
  - transcribe now / later
- Added worker transcription support and web-side transcription proxying.
- Merged local and server recordings on the dashboard.

### How it was done

- Built the recording UI in `apps/web/components/recordings/recording-screen.tsx`.
- Added `/api/transcribe` in the Railway worker to:
  - upload audio
  - call OpenAI transcription
  - persist transcript/status
- Added a Next.js proxy path for transcription from the web app.
- Kept local audio local until explicit transcription.

### Testing

- Added unit and API coverage for:
  - transcription success
  - missing patient ID
  - oversized audio
  - auth/scope failure
  - storage/OpenAI failure paths
- Added Playwright record -> stop -> transcribe -> dashboard coverage.
- Captured multiple recording-state screenshots in `output/playwright/`.

## 8. Authenticated page wiring

### What was done

- Replaced remaining demo-only route usage with session-aware page clients for:
  - dashboard
  - search
  - recording detail
  - new recording
- Added shared loading/error handling for authenticated page fetches.

### How it was done

- Introduced client containers that obtain Firebase ID tokens from the phone auth client.
- Wired those tokens into `/api/me`, `/api/recordings`, `/api/patients/search`, and related routes.
- Preserved demo-mode fallbacks for local testing and deterministic browser tests.

### Key implementation pieces

- `apps/web/components/dashboard-page-client.tsx`
- `apps/web/components/search/search-page-client.tsx`
- `apps/web/components/recordings/recording-detail-page-client.tsx`
- `apps/web/components/recordings/new-recording-page-client.tsx`
- `apps/web/components/session/page-loading.tsx`

### Testing

- Added client-container tests for the authenticated page loaders and fallbacks.

## 9. Authenticated recording workflow

### What was done

- Extended the recording flow so authenticated users create metadata, transcribe, and route into the real detail page.
- Added retry behavior when transcription fails without losing local audio.

### How it was done

- Used the Firebase-backed token flow when available.
- Created the server-side recording record first, then routed audio/transcription through the worker.
- Preserved the local audio and metadata so a failed transcription could be retried instead of re-recorded.

### Testing

- Added recording-screen tests for:
  - tokenless fallback
  - authenticated submission
  - retry/error states

## 10. Onboarding/admin E2E expansion

### What was done

- Added deterministic demo onboarding flows for owner and doctor paths.
- Expanded browser coverage for:
  - owner onboarding
  - doctor join pending
  - owner approval path
  - settings/admin screens

### How it was done

- Kept demo-mode onboarding deterministic so Playwright could assert concrete states.
- Used the onboarding and pending-approval routes to mirror the real product flow without depending on unstable live services during regression tests.

### Testing

- Added Playwright onboarding/admin tests.
- Captured onboarding/settings screenshots in `output/playwright/`.

## 11. PWA and offline hardening

### What was done

- Hardened app-shell PWA behavior.
- Added explicit offline policy logic to keep audio local until intentional transcription.
- Added offline smoke verification and screenshots.

### How it was done

- Expanded `apps/web/next.config.mjs` runtime caching for app-shell routes and static assets.
- Explicitly excluded audio/transcription-style assets from being treated as normal cacheable content.
- Added browser smoke coverage for offline dashboard/settings accessibility.

### Key implementation pieces

- `apps/web/lib/client/offline-policy.ts`
- `scripts/pwa-offline-smoke.mjs`

### Testing

- Added unit tests for offline policy decisions.
- Ran the PWA offline smoke successfully and captured:
  - `output/playwright/dashboard-offline-mobile.png`
  - `output/playwright/settings-offline-mobile.png`

## 12. Staging smoke tooling

### What was done

- Added reusable staging smoke tooling and documentation.

### How it was done

- Added `scripts/staging-smoke.mjs`.
- Added `docs/staging-smoke.md`.
- Wired the root command:
  - `pnpm smoke:staging`

### Current state

- The script is ready.
- It is currently blocked by missing `STAGING_WEB_URL` and `STAGING_WORKER_URL` in the local environment.

## 13. Owner clinic admin completion

### What was done

- Added real owner clinic admin data wiring.
- Expanded Settings so owners can:
  - review pending approvals
  - inspect active doctors
  - edit clinic profile fields
  - edit clinic code

### How it was done

- Added a new clinic admin route:
  - `GET /api/clinic/admin`
  - `PATCH /api/clinic/admin`
- Implemented server-side clinic admin repository behavior for:
  - active doctor listing
  - clinic profile lookup
  - clinic profile update
  - duplicate clinic-code protection
- Expanded `settings-screen.tsx` to render active-doctor cards and a clinic profile editor.

### Key implementation pieces

- `apps/web/app/api/clinic/admin/route.ts`
- `apps/web/lib/server/clinic-admin.ts`
- `apps/web/lib/server/supabase-clinic-admin-repository.ts`
- `apps/web/lib/client/clinic-admin-api.ts`
- `apps/web/components/settings/settings-screen.tsx`
- `apps/web/components/settings/settings-page-client.tsx`

### Testing

- Added unit/API tests for:
  - clinic admin fetch/update behavior
  - owner authorization
  - duplicate code handling
- Added Playwright coverage for:
  - active doctor inspection
  - clinic profile editing

## 14. Recording capture hardening to match the PRD

### What was done

- Hardened local recording capture to better match the Phase 1 PRD.
- Added 30-second chunked local capture and recoverable local recording state.
- Added long-recording guardrails.

### How it was done

- Extended the audio recorder abstraction to emit chunks via `onChunk(...)`.
- Configured `RecordRTC` with `timeSlice: 30000`.
- Expanded local recording persistence to store:
  - `audioChunks`
  - `captureState`
- Added repository helpers for:
  - draft updates
  - chunk append
  - latest recoverable recording lookup
- Added stop/recover/retry behavior in the recording screen.
- Added the 60-minute UI limit with user-facing stop behavior.

### Key implementation pieces

- `apps/web/lib/client/audio-recorder.ts`
- `apps/web/lib/client/local-recordings.ts`
- `apps/web/components/recordings/recording-screen.tsx`

### Testing

- Added repository and recording-screen test coverage for:
  - chunk persistence
  - recovery logic
  - retry behavior
  - duration enforcement

## 15. Firebase service-account env hardening

### What was done

- Hardened Firebase Admin service-account loading to tolerate the current local `.env` format.

### Why this was needed

- The local `.env` stores `FIREBASE_ADMIN_SDK_JSON` as a multiline object instead of a single-line JSON string.
- Standard `node --env-file` parsing truncated that value, which broke live auth and worker startup.

### How it was done

- Added shared helpers to reconstruct multiline JSON values from `.env`.
- Applied the fallback parser in:
  - web Firebase admin initialization
  - worker Firebase admin initialization
  - live-flow smoke tooling

### Key implementation pieces

- `packages/shared/src/service-account.ts`
- `apps/web/lib/server/firebase-admin.ts`
- `apps/worker/src/firebase.ts`
- `scripts/live-flow-smoke.mjs`

### Testing

- Added unit tests for the service-account parsing helper.

## 16. Root smoke script cleanup

### What was done

- Fixed the root smoke commands so they execute from the correct working directory.

### How it was done

- Updated `package.json` so:
  - `pnpm smoke:live-flow`
  - `pnpm smoke:pwa`
  run from `apps/web`, where dependency resolution and relative env paths are correct.

## 17. Full verification pass completed

### What was done

- Ran the full local verification pass after the latest slices landed.

### Completed verification

- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm --filter @bharatdoc/web test:e2e`
- `pnpm smoke:pwa`

### Additional validation

- Ran a manual local UI pass on the Settings/admin surface after the final Playwright fix.
- Captured and reviewed browser screenshots in `output/playwright/`.

## 18. Current live blockers

### Live auth / real backend smoke

The real live-flow smoke does not complete yet.

Command:

```bash
pnpm smoke:live-flow
```

Current failure:

- `POST /api/auth/register` returns `500`

Direct cause confirmed separately:

- Supabase returns `PGRST205`
- message: `Could not find the table 'public.clinics' in the schema cache`
- same issue is present for `public.doctors`

### Interpretation

- This is not currently a web-route regression.
- It is an environment/database state problem in the configured Supabase project:
  - migrations are not applied, or
  - PostgREST schema cache is stale, or
  - the environment points at the wrong Supabase instance

### Staging smoke

The staging smoke script is ready, but cannot run yet because:

- `STAGING_WEB_URL` is not set
- `STAGING_WORKER_URL` is not set

## 19. Current implementation status

### Completed in code and local verification

- Monorepo setup
- shared schemas/helpers
- app shell and mobile UI system
- onboarding/demo flows
- dashboard/search/detail/settings screens
- summary and PDF workflow
- local recording and transcription workflow
- authenticated page wiring
- owner clinic admin
- PWA/offline policy and offline smoke tooling
- staging/live smoke tooling

### Remaining before calling Phase 1 fully validated end to end

1. Fix the Supabase environment so `clinics` and `doctors` exist and are visible in schema cache.
2. Rerun `pnpm smoke:live-flow`.
3. Set staging URLs and run `pnpm smoke:staging`.
4. Run the real Firebase + Supabase + OpenAI flow once the backend environment is healthy.

## 20. Append format for future entries

When new work lands, append a new section using this pattern:

```md
## N. Short entry title

### What was done

- ...

### How it was done

- ...

### Testing

- ...

### Notes / blockers

- ...
```

## 21. P1 external gap remediation

### What was done

- Updated Vercel/Railway env documentation so web API routes explicitly receive `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` server-side.
- Moved browser transcription audio upload off Vercel: `transcribeRecordingAudio` now posts directly to Railway `/api/transcribe` using `NEXT_PUBLIC_RAILWAY_WORKER_URL`.
- Removed the Vercel transcription upload proxy route and server proxy helper.
- Added worker CORS allowlisting through `WORKER_CORS_ORIGINS` for direct browser-to-Railway uploads.
- Confirmed production demo access is gated by `NEXT_PUBLIC_ENABLE_DEMO_MODE=true`; public `?demo=1` does not bypass auth in production mode.
- Updated recording tests to match the product rule that local audio can be saved without Patient ID, but transcription cannot start until Patient ID is present.
- Confirmed saved PDF reload uses `pdf_signed_url` from the detail API, not a demo data URL.
- Added a PostgREST schema visibility preflight to `scripts/live-flow-smoke.mjs` for `public.clinics`, `public.doctors`, `public.clinic_join_requests`, and `public.recordings`.

### Testing

- `pnpm --filter @bharatdoc/web test -- app/demo-mode-pages.test.tsx components/recordings/recording-screen.test.tsx lib/server/recordings.test.ts`
- `pnpm --filter @bharatdoc/worker test -- src/__tests__/transcription.test.ts src/__tests__/app.test.ts`
- `pnpm --filter @bharatdoc/shared test -- src/env.test.ts`
- Direct-upload tests cover Railway worker URL selection, `recording_id` multipart payloads, missing worker URL failure, retry behavior, and worker CORS preflight behavior.
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

### Live validation

- Ran local production web on `http://127.0.0.1:3000` and local worker on `http://127.0.0.1:8080`.
- `LIVE_FLOW_WEB_URL=http://127.0.0.1:3000 LIVE_FLOW_WORKER_URL=http://127.0.0.1:8080 pnpm smoke:live-flow`
- Result: PostgREST schema visible for all required tables; auth smoke passed; transcription status `transcribed`; summary status `summary_ready`; PDF status `pdf_saved`.

### Browser screenshots

- `output/p1-demo-gate-dashboard.png`
- `output/p1-demo-gate-recording.png`
- Both screenshots show production-mode `?demo=1` routes redirecting to onboarding instead of rendering demo clinical/admin data.

### Notes / blockers

- `pnpm smoke:staging` is still blocked because `STAGING_WEB_URL` is not set in `.env`; `STAGING_WORKER_URL` is also absent. Staging validation should be rerun after those URLs are added.
- Supabase Auth must keep `https://bharatdoc-web.vercel.app/` in the allowed redirect URLs for production magic links.
