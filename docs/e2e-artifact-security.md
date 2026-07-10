# E2E artifact security

Production and real-account evidence is sensitive even when it uses test accounts. Raw screenshots, media, PDFs, browser logs, API payloads, signed URLs, and identifiers must never be committed.

## Current-tree inventory

| Class                                    | Prior location                                                       | Risk classification                                                                                                                 | Disposition                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| API/browser logs and run context         | `test/runs/*/{logs,scripts}`                                         | Test-account and potentially real; contained contacts, auth links, signed URLs, UUIDs, patient-like IDs, transcripts, and summaries | Removed; path ignored and blocked by CI                                       |
| Screenshots, recordings, PDFs, and audio | `test/runs`, `test/screenshots`, production-named `testing` evidence | Test-account or unknown because image/media content cannot be proven synthetic without review                                       | Removed; future raw evidence is private and expires                           |
| Production plans/results                 | `test/production-*`                                                  | Test-account metadata with identifying values and raw-artifact pointers                                                             | Replaced by small non-identifying summaries in `test/safe-summaries`          |
| Synthetic QA media and visual fixtures   | `test/audio`, non-production `testing` fixtures                      | Synthetic                                                                                                                           | Retained; must remain clearly labeled and contain no account or clinical data |

Unknown or plausibly real content is treated as potentially sensitive and must be escalated to the designated security/privacy owner. Do not paste it into an issue or PR.

## Writing evidence

`scripts/artifact-redaction.mjs` deterministically maps repeated sensitive values to keyed placeholders, redacts nested JSON and text, strips URL credentials/fragments/query values, and sanitizes artifact names. Local runs use a random process-scoped correlation key; the protected CI environment must define `ARTIFACT_REDACTION_KEY` as a secret when correlation across runs is required. This prevents low-entropy contacts and identifiers from being recovered with a dictionary against a public hash key. `scripts/real-account-browser-e2e.mjs` writes only below ignored `.artifacts/private-e2e/` (or an external absolute `E2E_ARTIFACT_DIR`) and passes filenames, metadata, and text through that library before persistence. It masks form values, patient-like monospace values, known run identities, and clinical panels in screenshots. Binary screenshots remain private evidence rather than Git-safe fixtures.

Use `pnpm test:artifacts` for redaction/access contracts and `pnpm artifact:scan` before staging. CI compares added, copied, modified, and renamed files with the base commit and rejects raw paths, production media, tokens, signed URLs, contacts, UUIDs, and clinical text. Small test fixtures belong under an explicit `fixtures` directory and must use `example.com`-style synthetic values. CI failures print only a generic message; diagnostic pixels stay in the private bundle instead of the longer-lived Actions log.

## Private CI storage

Run **Private E2E artifacts** manually from `main` in the repository Actions UI. The protected `production-e2e` environment owns the URLs, credentials, and optional stable redaction key; workflow permissions are read-only, production runs are serialized, and `actions/upload-artifact` stores the private bundle for seven days. The job refuses non-`main` refs and public repositories. This repository is currently public, so an owner must make it private or approve a different private artifact backend before live evidence capture can be enabled. The bundle includes run ID, commit, target origin, phase, timestamp, and redacted evidence names.

Authorized retrieval: `gh run download RUN_ID -n private-e2e-RUN_ID`. Authorized early deletion: find the artifact ID with `gh api repos/OWNER/REPO/actions/runs/RUN_ID/artifacts`, then run `gh api -X DELETE repos/OWNER/REPO/actions/artifacts/ARTIFACT_ID`. Repository readers can download Actions artifacts; deletion requires a token/role with Actions write permission. Record manual deletion in the incident/change ticket.

## Durable-history remediation plan

Deleting the current tree does not erase Git history. No history rewrite is approved or performed by this change.

1. Security/privacy owner inventories historical blobs and classifies each as synthetic, test-account, potentially real, or unknown; unknown is escalated.
2. Revoke or rotate any still-valid credentials, sessions, signed-object access, and affected test accounts before cleanup.
3. Obtain written approval for a coordinated rewrite, including scope, maintenance window, rollback owner, and legal/retention sign-off.
4. Notify collaborators and owners of clones, forks, releases, CI caches, mirrors, and deployments; pause merges and archive required safe summaries separately.
5. Use a reviewed `git filter-repo` path/text specification, force-update protected refs, expire server caches where supported, and delete affected releases/artifacts.
6. Require fresh clones, remove stale forks/caches, rotate credentials again where exposure cannot be disproved, and verify prohibited blobs/patterns across every ref.
7. Close the incident only after the owner records scope, rotations, communications, validation commands, and any residual risk.
