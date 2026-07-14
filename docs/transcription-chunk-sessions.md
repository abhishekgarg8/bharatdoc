# Durable transcription chunk sessions

Set `TRANSCRIPTION_CHUNK_SESSIONS_ENABLED=true` on the worker to enable the server-authoritative API:

1. `POST /api/transcription-sessions` with `recording_id`, `expected_chunk_count`, and an `Idempotency-Key`.
2. `POST /api/transcription-sessions/:id/chunks` as multipart data with one independently encoded `audio` file plus `chunk_index`, `chunk_count`, and `duration_seconds`.
3. `GET /api/transcription-sessions/:id` for canonical missing, failed, and completed indices and cleanup object paths.

The worker hashes every received chunk and derives its storage path. Clients must not concatenate or byte-slice encoded WebM, Ogg, MP4/M4A, AAC, or WAV containers. Identical completed retries are reads; a `provider_submitted` response is deliberately left in progress because replay could duplicate a provider call.

`POST /api/transcribe` remains the compatibility path while web/mobile clients migrate. Disable the flag to expose only that legacy single-upload contract; server-side final transcript assembly is intentionally deferred to issue #66.
