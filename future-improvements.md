# BharatDoc Future Improvements Product Audit

Audit date: 2026-05-17 PDT / 2026-05-18 UTC
Production URL: https://bharatdoc-web.vercel.app/
Evidence bundle: `test/runs/20260517184256/`
QA result reference: `test/production-e2e-20260517184256-results.md`

## Audit Checklist

- [x] Walked the production onboarding, owner signup, email confirmation, clinic creation, dashboard, recording, transcription, summary, PDF, search, settings, doctor join, owner approval/rejection, and sign-out flows using disposable test accounts.
- [x] Reviewed current production screenshots and logs from the E2E run.
- [x] Reviewed the recording, search, settings, and recording API surfaces in code to identify missing product capabilities.
- [x] Confirmed `.env` was not edited.
- [x] Captured future improvement recommendations in this root-level Markdown file.

## Executive Summary

BharatDoc's Phase 1 flow is functional end to end: a doctor can create or join a clinic, record a consultation, transcribe audio, generate/edit a summary, create a PDF, search by Patient ID, and manage basic clinic membership. The product is now credible as a controlled MVP for a small clinic pilot.

The biggest product gap is lifecycle management. A real clinic user needs to correct, delete, archive, restore, audit, and export clinical records. Today, the record detail screen supports generating a transcript, editing/saving the summary, and generating/opening a PDF, but not deleting an existing recording, transcript, summary, or PDF. The API surface similarly has create/read/update-summary/generate-PDF routes, but no `DELETE` route for recordings or derived artifacts.

## High-Priority Missing Features

| Priority | Gap | Why It Matters | Current Evidence | Recommended Build |
| --- | --- | --- | --- | --- |
| P1 | Delete/archive recordings, transcripts, summaries, and PDFs | Clinicians will create test/duplicate/wrong-patient records and need a safe way to remove or hide them. | Recording detail only exposes Generate, Save, and PDF actions (`apps/web/components/recordings/transcript-summary-screen.tsx:444`). API has `GET`/`POST` recordings and `PATCH` summary, but no `DELETE` (`apps/web/app/api/recordings/route.ts:14`, `apps/web/app/api/recordings/[id]/route.ts:18`, `apps/web/app/api/recordings/[id]/summary/route.ts:35`). | Add soft-delete/archive with restore, permanent delete for owners, storage cleanup, local IndexedDB cleanup, and audit logs. Put actions behind a record overflow menu on dashboard/search/detail. |
| P1 | Edit transcript with version history | Transcription errors are expected in noisy clinical environments. Summary quality depends on transcript accuracy. | Transcript is rendered as read-only paragraphs (`apps/web/components/recordings/transcript-summary-screen.tsx:349`); only summary has an editable textarea (`apps/web/components/recordings/transcript-summary-screen.tsx:373`). | Add transcript editor, save transcript endpoint, regenerate summary warning when transcript changes, and version history for transcript/summary. |
| P1 | PDF lifecycle and stale-PDF controls | Once a summary changes, older PDFs can become clinically misleading. | Summary generation clears local PDF state (`apps/web/components/recordings/transcript-summary-screen.tsx:168`), but there is no PDF history, delete, revoke, or stale marker visible to the user. | Track PDF versions, show generated timestamp/version, invalidate stale PDFs, allow delete/regenerate, and expose who generated each PDF. |
| P1 | Search, filter, and pagination beyond Patient ID | Clinics need to find records by date, doctor, status, label, and PDF availability. | Dashboard shows recent records only (`apps/web/components/dashboard-screen.tsx:123`); search is Patient ID only (`apps/web/components/search/search-screen.tsx:165`). | Add date range, doctor, status, label text, PDF status, pagination, saved filters, and exportable search results. |
| P1 | Account/data deletion and self-service compliance controls | Users can see a destructive account row, but cannot complete the action. | Settings shows `Delete account` with `Not available in this build` (`apps/web/components/settings/settings-screen.tsx:687`). | Build account deletion request flow, owner approval rules, data retention policy, and export-before-delete safeguards. |
| P2 | Owner/admin governance depth | Clinic owners need more than approve/reject/remove. | Current admin covers pending approvals, active doctors, removed doctors, clinic profile/code (`apps/web/components/settings/settings-screen.tsx:430`). | Add invite links, role transfer, multiple owners/admins, permission tiers, reason-required removal, audit export, and member activity history. |
| P2 | Recording reliability for real clinics | Fake Chrome audio still needed valid-WAV fallback in QA, so real-device coverage needs to be explicit. | QA evidence: `test/runs/20260517184256/screenshots/browser-owner-rerun/13-recording-transcription-failed-attempt-1.png` and successful fallback `13-recording-transcribed-audio-file.png`. | Add upload progress, resumable uploads, background retry queue, real-device mic certification matrix, and clear error recovery copy. |
| P2 | Patient timeline and deduplication | Patient ID search is useful, but clinicians think in patient timelines, not isolated files. | Search result cards link to individual recordings only (`apps/web/components/search/search-screen.tsx:33`). | Add patient timeline view, duplicate Patient ID warnings, recent visits, PDF history, and notes/allergies fields if clinically appropriate. |
| P2 | Notifications and task queue | Pending approvals, failed transcription, and completed summaries need attention surfaces. | Dashboard has pending transcription count (`apps/web/components/dashboard-screen.tsx:123`) but no notification center/task queue. | Add notification center, failed-transcription queue, owner approval alerts, email/WhatsApp-safe notification options, and retry all failed jobs. |
| P3 | Support and diagnostics UI | Device logs exist, but product users need a way to package/send support context. | Diagnostic logs are captured through `/api/device-logs`, but no user-facing support screen was visible in the tested flow. | Add “Report issue” with recording ID, device logs, worker request IDs, and screenshot attachment. |

## Suggested Near-Term Roadmap

### Sprint 1: Data Lifecycle Controls

- Add `archived_at`, `deleted_at`, `deleted_by`, and `delete_reason` fields for recordings.
- Add soft-delete and restore API routes.
- Add UI overflow menu on dashboard/search/detail: Archive, Restore, Delete permanently.
- Add separate controls to clear transcript, summary, and PDF with confirmation and audit logging.
- Ensure Supabase Storage objects are cleaned or retained according to policy.

### Sprint 2: Clinical Correction Workflow

- Add transcript editor and save endpoint.
- Add transcript/summary version history with timestamps and editor identity.
- Add “summary is stale” state when transcript changes after summary/PDF generation.
- Add PDF version cards: generated by, generated at, based on summary version.

### Sprint 3: Search and Operations

- Add filters: date range, doctor, status, label, PDF available, pending transcription.
- Add pagination and export CSV/PDF index.
- Add patient timeline route: `/patients/[patientId]`.
- Add bulk actions for owner/admin users.

### Sprint 4: Admin and Compliance

- Add owner transfer and multi-admin roles.
- Add clinic invite link with expiry and domain controls.
- Add account deletion/export request flow.
- Add audit log screen for owner actions, record edits, PDF generation, and deletions.

## Acceptance Criteria for the Top Gap

For deletion/archive to be production-ready:

- A doctor can archive their own recording from detail/dashboard/search.
- An owner can archive any clinic recording.
- Archived records are hidden by default but visible in an Archived filter.
- Restoring an archived record returns it to normal search/dashboard results.
- Permanent delete requires a second confirmation and a reason.
- Permanent delete removes or tombstones transcript, summary, PDF path, storage objects, and local-device cached audio where applicable.
- Every lifecycle action writes an immutable audit row with actor, timestamp, reason, affected artifact, and previous status.
- Non-owner doctors cannot delete another doctor's record.
- Tests cover owner/non-owner permissions, clinic isolation, storage cleanup, local cache cleanup, and UI screenshots.

## Evidence Used

- Production E2E results: `test/production-e2e-20260517184256-results.md`
- Production screenshot bundle: `test/runs/20260517184256/screenshots/`
- Recording detail UI: `apps/web/components/recordings/transcript-summary-screen.tsx`
- Recording server workflow: `apps/web/lib/server/recordings.ts`
- Recording API routes: `apps/web/app/api/recordings/`
- Dashboard/search UI: `apps/web/components/dashboard-screen.tsx`, `apps/web/components/search/search-screen.tsx`
- Settings/admin UI: `apps/web/components/settings/settings-screen.tsx`
