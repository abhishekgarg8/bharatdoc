# P1 Gap Findings To Fix

These are the P1 issues from the review, deduplicated and written as direct implementation instructions.

## 1. Protected app pages render demo data by default

Files:
- `apps/web/components/dashboard-page-client.tsx`
- `apps/web/components/search/search-page-client.tsx`
- `apps/web/components/settings/settings-page-client.tsx`
- `apps/web/components/recordings/new-recording-page-client.tsx`
- `apps/web/components/recordings/recording-detail-page-client.tsx`
- `apps/web/components/settings/prompt-editor-page-client.tsx`
- `apps/web/components/settings/transcription-language-page-client.tsx`

Problem:
- `demoOnMissingToken` defaults to `true`.
- Missing/expired auth or API failures can render plausible demo clinic data.
- In a clinical app, fake records must never appear in production protected routes.

Fix:
- Default `demoOnMissingToken` to `false` in production page clients.
- Redirect missing-token users through the auth/session gate.
- On authenticated fetch failures, show a real error or force re-auth. Do not fall back to demo records.
- Keep demo mode only behind explicit demo/test entry points such as `/onboarding?demo=1` or test-only props.

## 2. Production signup is prefilled with demo credentials

File:
- `apps/web/components/onboarding/onboarding-screen.tsx`

Problem:
- Production onboarding initializes username, password, profile, clinic code, clinic name, and address with demo values.
- A real user can create or join with known sample data and a known password by tapping through the flow.

Fix:
- Use empty defaults when `demoMode === false`.
- Keep demo defaults only inside demo mode.
- Add tests proving production onboarding starts blank and demo onboarding remains deterministic.

## 3. Public signup uses service-role account creation

File:
- `apps/web/app/api/auth/password/signup/route.ts`

Problem:
- The public unauthenticated signup route calls `supabase.auth.admin.createUser` with the service role.
- There is no rate limit, invite constraint, bot protection, or abuse guard.
- The route auto-confirms users with `email_confirm: true`.

Fix:
- Prefer browser-side `supabase.auth.signUp` with the anon key for normal signup.
- If a server signup endpoint remains, add hard abuse protection: rate limiting, bot protection, invite/clinic constraints, normalized duplicate handling, and no broad public service-role user creation.
- Do not expose raw provider/internal errors to the client.

## 4. Settings/admin writes can report success without persistence

File:
- `apps/web/components/settings/settings-screen.tsx`

Problem:
- Approve/reject and clinic-profile save skip the backend call when `idToken` is missing.
- The UI still mutates local state and shows success.
- An unauthenticated or failed-auth session can appear to approve doctors or save clinic changes.

Fix:
- Require `idToken` before any admin write.
- If token is missing, show an auth error and redirect/re-authenticate.
- Only update local state after the API call succeeds.
- Apply the same persistence rule to prompt and language preference saves.

## 5. Recording stop can lose audio when Patient ID is blank

Files:
- `apps/web/components/recordings/recording-screen.tsx`
- `apps/web/lib/client/local-recordings.ts`

Problem:
- `stopRecording()` stops the recorder before `repository.finalize()`.
- `finalize()` requires a Patient ID.
- If the doctor stops first and tags the patient later, the UI moves to failed after the recorder has already stopped.
- Short recordings may not have a 30-second chunk persisted, so audio can be lost.
- The PRD says Patient ID can be added after recording and is mandatory before transcription/PDF, not before stop.

Fix:
- Allow local recording finalization without Patient ID.
- Persist the final audio blob immediately on stop.
- Keep Patient ID validation at transcription/PDF time.
- Let the doctor add or edit Patient ID after stopping and before transcription.

## 6. Transcription retry is not idempotent

Files:
- `apps/web/components/recordings/recording-screen.tsx`
- `apps/web/lib/client/dashboard-data.ts`
- `apps/web/lib/server/recordings.ts`
- `apps/web/lib/server/supabase-recordings-repository.ts`

Problem:
- Every transcription retry calls `createRecordingMetadata()` before invoking the worker.
- The server inserts a new `recordings` row with the same primary key.
- If metadata creation succeeds but worker/OpenAI transcription fails, the next retry can fail on duplicate key before transcription starts.

Fix:
- If `serverRecordingId` exists locally, skip metadata creation and retry transcription with that ID.
- Make metadata creation idempotent server-side: return the existing row if the same recording ID already belongs to the same doctor.
- Do not overwrite another doctor's row.
- Persist `serverRecordingId` before calling the worker and keep it across failed retries.

## 7. Same-clinic doctors can edit each other's summaries

File:
- `apps/web/lib/server/recordings.ts`

Problem:
- Summary PATCH finds recordings by clinic scope and updates by `clinic_id`.
- Any active doctor in the same clinic can edit another doctor's summary.
- Worker summary/PDF paths use doctor ownership, so authorization is inconsistent.

Fix:
- For MVP, restrict summary edits to the recording owner doctor.
- Keep clinic-scoped reads/search if required, but make writes owner-scoped unless an explicit collaborative-edit policy exists.
- If clinic-wide editing is intended later, add audit fields and product-visible ownership rules.

## 8. Summary changes keep stale PDFs marked current

Files:
- `apps/worker/src/summary.ts`
- `apps/web/lib/server/recordings.ts`
- `apps/web/components/recordings/transcript-summary-screen.tsx`

Problem:
- Regenerating or editing a summary after `pdf_saved` preserves `pdf_saved`.
- The database can show a new summary while `pdf_storage_path` still points to a PDF generated from old text.
- The UI can advertise an old PDF as current.

Fix:
- On any summary change after PDF generation, invalidate the existing PDF.
- For MVP: set status back to `summary_ready` and clear `pdf_storage_path`.
- Hide the old PDF link until a new PDF is generated.
- Long term: use versioned summaries and versioned PDFs.

## 9. PDF renderer corrupts Hindi and other non-ASCII text

File:
- `apps/worker/src/pdf-renderer.ts`

Problem:
- `asciiText()` replaces all non-ASCII characters.
- Hindi/Hinglish text, clinic names, addresses, and patient summaries can be silently corrupted.

Fix:
- Replace the custom ASCII-only PDF writer with a Unicode-capable renderer.
- Use `@react-pdf/renderer` as planned in the PRD, or another renderer that supports embedded fonts.
- Embed a font that supports Devanagari and Latin text, such as Noto Sans Devanagari plus a Latin fallback.
- Add tests with Hindi/Hinglish sample text.

## 10. PDF output truncates long summaries

File:
- `apps/worker/src/pdf-renderer.ts`

Problem:
- When the first page runs out of space, the renderer writes a continuation note and stops.
- The PRD requires the full edited summary in the PDF.
- Clinical content can be dropped from the saved document.

Fix:
- Generate multi-page PDFs.
- Preserve the full summary text.
- Add tests with a long summary that spans multiple pages.
- Include the PRD-required footer: `Generated by BharatDoc | AI-assisted - verify before clinical use`.

## 11. Approval state changes are not atomic

File:
- `apps/web/lib/server/supabase-clinic-admin-repository.ts`

Problem:
- Approve/reject updates the join request and doctor row in separate statements.
- There is no transaction boundary, pending-status predicate, or affected-row check.
- Concurrent owner actions or partial failures can leave `clinic_join_requests.status` and `doctors.account_status` inconsistent.

Fix:
- Move approve/reject into a Supabase RPC/database transaction.
- Only update rows where the join request is still `status = 'pending'`.
- Update join request and doctor account status atomically.
- Return a clear conflict/not-found error if another review already processed the request.
