# PHI retention and deletion policy

Policy owner: Privacy & Security Lead. Clinical/legal review owner: Hospital Compliance Lead. Engineering owner: Platform Lead. Review due: 2026-10-11 and quarterly thereafter.

| Data class | Enforced period | Deletion trigger | Control owner |
| --- | --- | --- | --- |
| Browser audio/checkpoints, patient ID, transcript | Until verified server transcription; otherwise until manual purge or sign-out | Successful transcription, device purge, sign-out | Web Platform |
| Uploaded audio/chunks and object manifests | Consultation lifetime | Record/account deletion; superseded/orphan reconciliation | Platform/SRE |
| Transcript, summary, PDF, patient/consultation metadata | Hospital-selected consultation lifetime | Authorized owner-record deletion or owning-account deletion | Hospital owner |
| Diagnostic logs and transcription failure attempts | 30 days maximum | Daily expiry or record/account deletion | SRE |
| Processing jobs, reservations, chunk transcripts/provider metadata | 90 days after terminal state | Daily expiry or record/account deletion | AI Platform |
| Auth/profile/join-request data | Account lifetime | Account deletion; unrelated reviewed requests retain no reviewer pointer | Identity Platform |
| Mobile backup copies | None | Excluded at source from cloud/device backup | Mobile Platform |
| Local production test evidence | 7 days maximum, ignored/untracked | Automatic encrypted private-store expiry or manual local purge | QA Lead |
| Non-PHI deletion receipt | 1 year | Daily receipt expiry | Privacy & Security Lead |

## Lifecycle and retry contract

Record deletion is owner-scoped, serialized against AI processing, and atomically inventories every current, superseded, chunk, attempt, and safe-prefix storage object before PHI rows are removed. Object removal uses receipt-scoped five-minute leases. Missing objects count as deleted; failures release the lease and leave a failed receipt that the same authorized DELETE can retry. Only receipt ID, state, counts, error code, and completion time leave the server.

Account deletion immediately removes owned clinical/database data, disables access by removing the profile, and queues the auth identity only until storage cleanup succeeds. A daily authenticated finalizer resumes partial work after the requester loses app access. Hospital owners must transfer ownership before deletion whenever another hospital member exists; a sole owner deletes the empty hospital and all clinic-prefixed assets. The supplied persistent production test account must never be account-deletion tested.

Hospital removal and account deletion are intentionally different. Removing a doctor from a hospital immediately rejects access but retains that doctor's account and owned consultations so the owner can re-approve them; it does not authorize another user to destroy the doctor's clinical records. The rejected doctor must use the authenticated self-deletion workflow (or the designated privacy-support process) to erase the account and owned records.

`CRON_SECRET` is mandatory in Vercel and must be a high-entropy secret. `apps/web/vercel.json` invokes `/api/internal/retention` daily; operations must alert on non-2xx execution and receipt backlog. The SRE owner must verify and record a 30-day maximum in Railway/Vercel log-retention settings by 2026-07-18; this repository cannot prove an external console setting. Application logging recursively removes clinical IDs, paths, transcript/summary, credentials, and URLs before emission.

## Test evidence policy

Screenshots, video, PDFs, logs, audio, signed URLs, credentials, patient IDs, and production identifiers are forbidden in Git. Local evidence lives under ignored `testing/issue-*` and must be removed within seven days. CI evidence must be scrubbed, encrypted before upload to a private store, and configured for seven-day expiry. Only a non-PHI verification receipt containing issue ID, commit, assertions, counts, and timestamps may be committed. Git history cleanup for already-published artifacts is a separately coordinated security operation.

The manual `Encrypted evidence mechanism self-test` workflow proves AES-256/PBKDF2 packaging with the secret-held `E2E_EVIDENCE_KEY`, verifies the HMAC and decryption, deletes plaintext, and uploads only ciphertext plus an HMAC for seven days. It uses synthetic input; it does not ingest a developer's local files. Any CI job that actually produces authorized evidence must invoke `scripts/encrypt-test-evidence.sh` before upload and use the same ciphertext-only `actions/upload-artifact@v4` settings with `retention-days: 7`. An authorized maintainer retrieves it with `gh run download RUN_ID -n encrypted-e2e-evidence-RUN_ID`, verifies the HMAC with `openssl dgst -sha256 -hmac "$E2E_EVIDENCE_KEY" -binary evidence.tar.gz.enc | base64 | cmp - evidence.tar.gz.enc.hmac`, and decrypts with `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000`; delete early with `gh run delete RUN_ID` when review ends. Manual production evidence remains local-only and the QA owner must delete it within seven days.
