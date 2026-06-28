# BharatDoc — Production Critique & Next Steps

**Author:** Staff engineering review
**Date:** 2026-06-28
**Build under test:** `v0.9.1 · MVP`
**Environments exercised:**
- Web (production): https://bharatdoc-web.vercel.app
- Worker (production): https://bharatdocworker-production.up.railway.app (`/health` → `{"ok":true,"service":"bharatdoc-worker"}`)
**Account used:** `meetchinx@gmail.com` (owner of *PGIMER, Chandigarh*, join code `EPPBR2`, 2 active doctors)

This document combines (1) a live end-to-end test pass against the real production deployment with a real account and (2) a source-level critique grounded in the code that produces each behavior. It is written so any engineer can pick up a line item, find the file, and act.

---

## 1. Executive summary

BharatDoc is in genuinely good shape for an MVP. The core promise — *record a consultation → transcribe → AI summary → clinical PDF, scoped to a hospital* — works end to end in production with a real account and real audio. Onboarding, owner admin, clinic-scoped search, settings, the prompt editor, and the auth lifecycle (login → guarded routes → sign-out → redirect) all behave correctly. Latency is good (home document ~0.44s; Mumbai region pinning is in place).

The most important gaps are **quality and safety of the clinical artifact itself**, not broken features:

1. **Raw Markdown leaks into the generated clinical PDF** (literal `**Chief Complaint:**` asterisks). This is the single most visible defect because the PDF is the thing a doctor hands to a patient. *Highest priority.*
2. **Access control is single-layered.** Row Level Security is enabled on every table but has **zero policies**; all data access runs through the Supabase service-role key plus hand-written application guards. There is no database-level backstop. For an app holding patient health information (PHI), this is the biggest structural risk.
3. **The structured summary is flattened.** The model emits seven labelled clinical sections, but the PDF renders them as one undifferentiated text blob under a single "Summary" heading — the styled section design already in the code is unused.

Everything else is polish, observability, and confidence-building (real-device mic QA, error specificity, audit/export workflows).

---

## 2. What was tested (live, this pass)

| # | Flow | Result | Notes |
|---|------|--------|-------|
| 1 | App availability + worker health | ✅ Pass | Web 200 in ~0.44s; worker `/health` ok |
| 2 | Unauthenticated → `/onboarding` redirect | ✅ Pass | Protected routes gate correctly |
| 3 | Email/password **login** | ✅ Pass | Logged in as owner, landed on `/dashboard` |
| 4 | **Dashboard** (consultation list) | ✅ Pass | 1 record, "0 pending transcriptions", clinic context shown |
| 5 | **Recording detail – Transcript tab** | ✅ Pass | Real transcribed audio rendered correctly |
| 6 | **Recording detail – Summary tab** | ⚠️ Defect | Summary shows literal `**…**` Markdown (see F1) |
| 7 | **PDF preview / generated PDF** | ⚠️ Defect | Same raw `**` markers carried into the PDF (see F1) |
| 8 | **Search** – recent records | ✅ Pass | Pre-loads recent hospital records |
| 9 | **Search** – partial Patient ID (`201`) | ✅ Pass | Correctly matched `2016378894`, clinic-scoped |
| 10 | **Settings** – account / profile | ✅ Pass | Name, specialization, email shown; edit affordance present |
| 11 | **Settings** – Hospital admin / Active doctors | ✅ Pass | Owner (no self-remove) + doctor (with "Remove from Clinic") |
| 12 | **Settings** – Summary prompt editor | ✅ Pass | Live validation, `{{transcript}}` requirement, 502/2000 char counter |
| 13 | **Recording screen** UI + start | ✅ Pass (gated) | Start triggers OS mic-permission prompt; real-mic capture not testable in automation |
| 14 | **Sign out** → session clears → `/onboarding` | ✅ Pass | Full auth lifecycle verified |

**Not exercised this pass (and why):**
- **Real microphone capture / live transcription end-to-end** — browser automation cannot grant a real mic; the *existing* recording (item 5/6) proves the real pipeline works, but device-level capture across Android/iOS still needs human QA (see F7).
- **"Remove from Clinic"** — destructive change to another doctor's access; intentionally not clicked against production data.
- **PDF binary download** — avoided downloading the production patient PDF; verified via the in-app preview instead.

---

## 3. Findings (prioritized)

Severity scale: **P1** = fix before broader rollout · **P2** = fix soon · **P3** = polish/nice-to-have.

### F1 — [P1] Raw Markdown leaks into the clinical summary and PDF
**Observed:** The summary renders as `**Chief Complaint:**`, `**History of Present Illness:**`, etc., with literal asterisks — in the on-screen textarea, the in-app PDF preview, **and** the generated PDF that a doctor would print/share.

**Root cause (two compounding issues):**
1. The default prompt asks for sections but **never instructs the model to avoid Markdown**, so `gpt-4o-mini` naturally emits `**bold**` headers.
   `packages/shared/src/prompts.ts:4-17`
2. The rendering pipeline treats the model output as **plain text** everywhere — no Markdown parse or strip:
   - PDF: `apps/worker/src/pdf-renderer.ts:97-104` (`summaryParagraphs` splits on `\n+` and emits each line as a raw `<Text>`).
   - Web summary/preview: `apps/web/components/recordings/transcript-summary-screen.tsx:373-387` (textarea) and `:418-421` (preview `<p>` blocks).

**Impact:** The primary deliverable of the product — the clinical document — looks unfinished and unprofessional. In a clinical setting that undermines trust immediately.

**Recommended fix (pick one; option C is best long-term):**
- **A (fastest):** Append to `DEFAULT_SUMMARY_PROMPT`: *"Output plain text only. Do not use Markdown, asterisks, or any formatting symbols. Use the section names as plain headings followed by a colon."* Cheap, but depends on model compliance and doesn't fix already-saved summaries.
- **B:** Strip/convert Markdown at render time (a tiny `**x**` → `x` pass, or a real Markdown→styled-text mapping) in both the PDF renderer and the web preview. Deterministic; fixes old and new data.
- **C (recommended):** Have the model return **structured sections** (JSON or clearly delimited), then render each into the **already-defined** `sectionTitle` style (`pdf-renderer.ts:65-71`, the terracotta `#B9472B` heading that is currently unused). This fixes F1 and F3 together and produces a genuinely professional document.

---

### F2 — [P1/Security] No Row-Level-Security policies — access control is single-layered
**Observed (code):** RLS is enabled on all four tables but **no policies exist**:
- `supabase/migrations/20260424080711_202604230001_initial_schema.sql:78-81` enables RLS on `clinics`, `doctors`, `clinic_join_requests`, `recordings`.
- `grep -rin "CREATE POLICY" supabase` → **0 results.**
- Both web and worker connect with the **service-role key**, which bypasses RLS entirely:
  `apps/web/lib/server/supabase.ts:18`, `apps/worker/src/supabase.ts:4`.

So every read/write is gated **only** by application code (`packages/shared/src/access.ts` — `assertActiveDoctor` / `assertOwner` / `assertClinicScope`). This is a legitimate "server-mediated access only" design and the guards themselves are clean. But:

**Impact / risk:**
- **No defense in depth.** A single route that forgets `assertClinicScope` or `assertActiveDoctor` becomes a cross-clinic PHI leak with nothing behind it to catch the mistake. With ~20 API routes this is a real, ongoing footgun.
- **Large blast radius for the service-role key** — it lives in two deploy targets (Vercel + Railway). A leak grants unrestricted access to all hospitals' data.

**Recommended fix:**
- Add **RLS policies as a backstop** (clinic-scoped `SELECT`/`mutation` policies keyed on the authenticated user's `doctor.clinic_id` and `account_status`), even while continuing to use the service role for trusted server paths. Defense in depth, not a rewrite.
- **Centralize the guard:** funnel every route through one `requireActiveDoctor(req)` / `requireClinicScope(req, resource)` helper so "did this route check scope?" is answered in one place, and add an API test asserting each route 403s on cross-clinic access (some of this exists per the plan — extend it to *every* route).
- Document key rotation and confirm the service-role key is never bundled to the browser (env split is already a stated goal — verify in the production bundle).

---

### F3 — [P2] Structured summary is flattened in the PDF
**Observed:** The model produces seven labelled sections (Chief Complaint, HPI, Key Findings, Provisional Diagnosis, Treatment, Follow-up, Additional Notes), but the PDF prints them as a flat run of paragraphs under one generic "Summary" heading. The per-section styling that exists (`pdf-renderer.ts:65-71`, `:124-129`) is never used for the real sections.

**Impact:** The clinical letter reads as a wall of text rather than a scannable note. Doctors skim by section header; this removes that affordance.

**Recommended fix:** Resolve together with **F1 option C** — parse sections and render each header with `sectionTitle` and body with `paragraph`. Result: a structured, branded clinical note.

---

### F4 — [P2] `recorded_at` printed raw (unformatted) in the PDF
**Observed (code):** `apps/worker/src/pdf-renderer.ts:122` prints `Recorded: ${input.recording.recorded_at}` directly — i.e. a raw ISO timestamp — whereas `Generated:` on the line above is correctly formatted to IST via `formattedGeneratedAt` (`:89-95`, `Asia/Kolkata`, `en-IN`).

**Impact:** Inconsistent, machine-looking date on a patient-facing document.

**Recommended fix:** Run `recorded_at` through the same `Intl.DateTimeFormat` IST formatter as `generatedAt`.

---

### F5 — [P2] Mic-failure error message is generic; specific cause is discarded
**Observed (code):** `createRecordRtcAudioRecorder` throws specific errors (e.g. "Microphone capture is not available in this browser." — `audio-recorder.ts:133-134`), but the caller swallows it:
`apps/web/components/recordings/recording-screen.tsx:245-247` uses `} catch {` (no binding) and always sets `"Unable to start microphone recording."`

**Impact:** A doctor whose mic permission is **denied** sees the same message as one with **no microphone** or an **insecure context** — they can't self-diagnose. Permission denial is the single most common real-world failure for a record-first app.

**Recommended fix:** Bind the error and branch on it: distinguish `NotAllowedError` (permission denied → "Allow microphone access in your browser settings"), `NotFoundError` (no device), and insecure-context/unsupported. Surface an actionable next step, ideally with a retry button.

---

### F6 — [P3] "Joined just now" relative time looks wrong for an existing member
**Observed (live):** In Active doctors, the owner shows "Joined 65 days ago · 1 recordings" (correct), but the second doctor shows "Joined just now · 0 recordings" despite being an established member of the test clinic.

**Likely cause:** The relative time is computed from a field that gets reset (e.g. on re-approval / re-join) rather than the original membership date, or from `updated_at` instead of `joined_at`. Worth confirming the source column in the active-doctors repository (`apps/web/lib/server/supabase-clinic-admin-repository.ts`).

**Impact:** Minor, but erodes confidence in the admin view's accuracy.

---

### F7 — [P2/Reliability] Real-device microphone & transcription confidence gap
**Context:** Capture relies on a MIME-negotiation fallback chain — `audio/webm;codecs=opus` → `webm` → `mp4` → `aac` → `wav` (`audio-recorder.ts:48-61`) — because iOS Safari and Android Chrome differ significantly. Browser automation (and prior E2E runs) cannot validate a *real* mic, so this path has never been confirmed against actual devices in CI.

**Impact:** The recording → upload → OpenAI transcription path is the product's core loop, and it's the least-tested in an automated way. Prior diagnostic work (production patient `301748995`, OpenAI rejecting the audio — see `implementation-plan.md` §11) shows this risk is real, not theoretical.

**Recommended fix:** Stand up a small **manual device QA matrix** (Android Chrome, iOS Safari ≥ 2 versions each, one low-end Android) that records ~30s, transcribes, summarizes, and generates a PDF, with the produced MIME type and OpenAI response logged. The diagnostic logging added in §11 already captures most of what's needed; formalize it into a checklist + the QA bundle below.

---

### F8 — [P3] Sign-out has no confirmation; consider local-audio safety
**Observed (live):** A single tap on "Sign out" immediately ends the session (correct, verified). There is no confirmation.

**Impact:** On a shared clinic device, an accidental tap signs out. More importantly, if any **un-transcribed local audio** lives only in IndexedDB on that device, the user should be warned before leaving. (Sign-out itself doesn't delete IndexedDB, but it's a good moment to surface "you have N un-transcribed recordings on this device.")

**Recommended fix:** Add a lightweight confirm when un-synced local recordings exist; plain sign-out otherwise.

---

## 4. Architecture & code-quality critique

**Strengths (keep doing this):**
- **Clean monorepo separation** — `apps/web` (Next.js 14 PWA), `apps/worker` (Express + OpenAI + PDF), `packages/shared` (Zod schemas, access helpers, prompt logic). Shared validation/auth types prevent client/server drift.
- **Server-mediated data access** with JWT verification on both Vercel routes and the Railway worker; no Supabase access from the browser.
- **Atomic onboarding & approval via RPCs** (`202604240001`, `202604250004`) with duplicate-submit recovery — avoids the classic half-created-clinic race.
- **Localization-aware PDF** — Devanagari font registration (`pdf-renderer.ts:15-28`) for Hindi/English clinical notes, IST formatting, "AI-assisted — verify before clinical use" disclaimer footer. Thoughtful for the target market.
- **Diagnostic logging & server-stored audio retry** (§11) — shows the team learns from production incidents and builds for recoverability.
- **Latency engineering** — Mumbai region pinning, collapsed `/api/dashboard` request, static app shells.
- **Strong unit/API test density** — most `lib/server` modules and shared logic ship with `.test.ts` siblings.

**Weaknesses / debt to watch:**
- **Access control concentrated in app code** (F2) — the biggest architectural risk; needs a DB backstop and a single choke-point guard.
- **The summary is an unstructured string end-to-end** (F1/F3) — the data model would be cleaner if the summary were stored/handled as structured sections, which also future-proofs export formats (FHIR, structured EHR import).
- **Error handling loses specificity at UI boundaries** (F5) — generic catch blocks (`catch {}`) appear in a few client handlers; they trade debuggability for brevity. Prefer binding and mapping known error types.
- **No middleware-level auth guard** — route protection is per-page/per-route. A Next.js `middleware.ts` (none present) could enforce the authenticated-shell redirect uniformly and reduce per-route boilerplate.
- **Two service-role secrets to manage** across Vercel + Railway — fine, but document rotation and least-privilege.

---

## 5. Quick wins (high value / low effort)

1. **F1-A** — Add "plain text, no Markdown" instruction to `DEFAULT_SUMMARY_PROMPT` *and* a `**`-stripping pass in `summaryParagraphs` + the web preview. Removes the most visible defect in well under a day.
2. **F4** — IST-format `recorded_at` in the PDF (one-line change).
3. **F5** — Bind the recorder error and branch on `NotAllowedError` vs `NotFoundError`.
4. **F6** — Verify the active-doctor "joined" timestamp source column.

---

## 6. Recommended sequencing

**Now (before wider rollout):**
- F1 (Markdown in PDF) — full fix via option C, folding in F3.
- F2 (RLS policies + centralized guard + per-route cross-clinic API tests).
- F7 (device mic QA matrix) — at least one full manual pass.

**Next:**
- F4, F5, F6 quick wins.
- QA bundle: a single downloadable manifest per E2E run (screenshots, logs, user/clinic/recording IDs, PDF artifact) — already recommended in the last run's results; build it.
- Production-safe **seeded E2E mode** so rejected/approved-doctor flows can run without hitting email signup rate limits.

**Later (Phase 2 hardening):**
- Owner audit-history export and doctor re-invite flow.
- Safer account-deletion / data-removal request workflow (PHI retention & deletion policy — likely a compliance requirement).
- Telemetry: signup duration, confirmation-message display, transcription success rate by device/MIME, PDF generation latency.
- Structured-summary data model enabling EHR/FHIR export.
- Crash recovery, automatic transcription retry queue, call-interruption handling (explicitly deferred in the plan — revisit once the core loop is device-proven).

---

## 7. Honest caveats about this review

- Real microphone capture and live device transcription were **not** re-exercised this pass (automation limitation); the conclusion that "the pipeline works" rests on the pre-existing real recording in the account, which did transcribe and summarize correctly.
- No destructive actions were taken against production data (no doctor removed, no production prompt overwritten, no patient PDF downloaded), so those specific *mutation* paths are inferred from code, not re-confirmed live.
- Source-level findings cite `file:line` against the current working tree; line numbers may shift as the code evolves.
