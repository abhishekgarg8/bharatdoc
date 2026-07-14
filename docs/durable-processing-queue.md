# Durable processing queue

Issue #68 moves provider work out of the HTTP request lifetime while keeping the old synchronous path as a rollback.

## Queue choice

The current production scale does not need a separate managed queue. Postgres already owns the processing-job rows, idempotency keys, leases, usage reservations, and artifact locks, so the smallest reliable queue is a Postgres-backed ready-job scan using `FOR UPDATE SKIP LOCKED`.

A managed queue becomes attractive when queue depth, cross-region workers, or delayed scheduling outgrow the database. Until then, keeping admission, lease ownership, retry state, and artifact writes in one transaction boundary is simpler and easier to audit.

## Runtime model

- API handlers validate/authenticate, enqueue idempotently, and return `202` with a canonical job ID when their operation flag is enabled.
- Queue workers claim only `queued` or due `retry_wait` jobs, set a five-minute lease, and record the worker owner.
- Transcription enqueue reserves a deterministic pending audio artifact before upload; only checksum-verified activation makes it claimable and updates the recording pointer.
- Workers heartbeat through existing operation code while provider work runs.
- Provider work has a four-minute deadline and PDF rendering a one-minute deadline. Shutdown stops HTTP admission and new claims, waits up to 30 seconds, then relies on lease recovery rather than acknowledging unfinished work.
- Failures are classified before state transition: queued workers use compare-and-set transitions, and the lease-scoped failure RPC mirrors the same retry policy for direct lease failures.
- Expired running leases are recovered on each queue tick and become retryable or terminal based on attempt count.
- Graceful shutdown stops new claims and waits for active work to finish before exiting.
- Heartbeat completion is awaited before any provider result is published. Providers that cannot abort on a lease heartbeat failure remain fenced by lease-token output RPCs; a forced shutdown leaves the job unacknowledged for stale-lease recovery.
- Claim admission is serialized and returns at most one job per clinic in a batch, making tenant concurrency, daily quota, and storage checks atomic while still allowing cross-clinic batches.
- `processing_queue_metrics` exposes PHI-free queue depth, oldest age, stale count, wait/run time, failures, calls, and estimated cost to service-role monitoring.

## Alerts and response

Poll `processing_queue_metrics` every minute with service-role monitoring; it contains operation/state aggregates only. Warn when `oldest_queue_age_seconds > 120` or any `stale_jobs > 0` for two samples, and page at 600 seconds or five stale jobs. Compute failure, provider-call, and spend rates from deltas between stored one-minute aggregate samples; alert when the 15-sample terminal-failure ratio exceeds 10% or call/cost deltas exceed the deployment budget baseline. A failing `/readyz` indicates database or queue-loop health, while `/livez` only indicates that the process is alive. Respond by pausing queue admission flags, leave the global worker enabled to drain accepted work, inspect safe error-code/event aggregates, and rely on fenced lease recovery before restarting workers; never put recording, doctor, clinic, storage-path, or provider payload data in alert labels.

`GET /api/processing-jobs/:jobId` exposes the scoped, PHI-safe status. User cancellation and manual retry controls are deferred to issue #69 so queue execution does not introduce a second artifact lineage model.

## Rollout

Queue routing is opt-in:

- `WORKER_QUEUE_ENABLED=true` starts the background loop.
- `WORKER_QUEUE_TRANSCRIPTION=true`, `WORKER_QUEUE_SUMMARY=true`, and `WORKER_QUEUE_PDF=true` make the matching API endpoint enqueue instead of waiting for provider completion.

Enable one operation at a time, starting with summary or PDF. Turning an operation flag off returns that endpoint to the synchronous request path while the globally enabled worker continues draining already accepted jobs. Turning the global flag off disables new queue admission as well as the worker; use that only after the queue is drained.
