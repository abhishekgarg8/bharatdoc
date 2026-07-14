# Processing job state machine

Issue #67 defines the durable lifecycle contract shared by transcription, summary, and PDF generation jobs.

## Canonical states

| From | Allowed next states | Notes |
| --- | --- | --- |
| `queued` | `running`, `cancelled` | Created or re-queued work waiting for a worker claim. |
| `running` | `succeeded`, `retry_wait`, `failed_terminal`, `cancel_requested` | Worker outcomes require the current, unexpired lease. |
| `retry_wait` | `running`, `cancelled` | A due retry is claimed directly and increments its attempt exactly once. |
| `cancel_requested` | `succeeded`, `failed_terminal`, `cancelled` | A dispatched provider call may still finish before cancellation wins. |
| `succeeded` | none | Terminal. |
| `failed_terminal` | none | Terminal. |
| `cancelled` | none | Terminal. |

## Invariants

- Operations are `transcription`, `summary`, and `pdf`.
- Active states are `queued`, `running`, `retry_wait`, and `cancel_requested`; at most one active logical job may exist for the same recording across all operations.
- Terminal states are `succeeded`, `failed_terminal`, and `cancelled`; terminal jobs never transition again.
- Retry defaults are three attempts, 30 second base delay, 15 minute max delay, and 10 minute stale lease detection.
- Successful jobs must match the recording artifact milestone: transcription requires `transcribed`, summary requires `summary_ready`, and PDF requires `pdf_saved`.
- Worker transitions must use state/version compare-and-swap, and running outcomes must also validate lease token and lease expiry.
- Events and status DTOs expose stable lifecycle metadata only. They must not expose raw provider text, PHI, lease tokens, result JSON, storage paths, recording IDs, doctor IDs, or clinic IDs.

## Error policy

Only allowlisted stable error codes are user-visible. Unknown persisted errors normalize to `PROCESSING_FAILED` with the generic message `Processing could not be completed.` Raw provider messages may be retained only in restricted server logs, not in job status responses.

`PROCESSING_ARTIFACT_SUPERSEDED` remains retryable so regenerated artifacts can repair missing outputs. Manual replacement errors such as `PROCESSING_INPUT_CHANGED` and `PROCESSING_OUTPUT_REPLACED` are terminal because old jobs must not compete with a newer user artifact.
