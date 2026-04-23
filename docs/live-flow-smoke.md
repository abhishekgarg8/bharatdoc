# Live Flow Smoke

Use this smoke to validate real Firebase-backed auth plus the end-to-end BharatDoc worker flow.

## Local run

1. Start the local web app and worker with `.env` populated.
2. Run:

```bash
pnpm smoke:live-flow
```

By default the script targets `http://127.0.0.1:3000`.

## Staging run

Set `LIVE_FLOW_WEB_URL` to the deployed web URL, or add `STAGING_WEB_URL` to `.env`, then run the same command.

## Notes

- The script creates unique owner/doctor Firebase users and clinic records for each run.
- If `LIVE_FLOW_SKIP_AI=1`, it validates only auth/onboarding/approval.
- If `LIVE_FLOW_AUDIO_FILE` is unset, the script generates spoken WAV audio with macOS `say` and `afconvert`.
