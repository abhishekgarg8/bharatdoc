# Real Account Browser E2E

This runbook validates BharatDoc through the browser with a real Supabase account and saved screenshots.

The script is safe by default: it opens onboarding, saves a screenshot, and exits before entering credentials or creating an account.

## Prerequisites

- Keep `.env` unchanged.
- Start the web app with the current Supabase anon key as a runtime override if local `.env` is stale.
- Start the worker on `http://127.0.0.1:8080` for transcription, summary, and PDF coverage.
- Use a Gmail alias for the connected account, for example `abhishekgarg8+bharatdoc-codex-YYYYMMDD@gmail.com`.

When local `.env` has a stale anon key, wrap commands with:

```bash
pnpm with:current-supabase-anon <command> [args...]
```

For example, start the local web app without editing `.env`:

```bash
pnpm with:current-supabase-anon pnpm --dir apps/web exec next dev -H 127.0.0.1 -p 3000
```

## Dry Run

```bash
REAL_E2E_BASE_URL=https://bharatdoc-web.vercel.app pnpm smoke:real-browser
```

Expected result: screenshot saved, then the script stops before credential entry/account creation.

## Signup Phase

Requires explicit action-time approval before running because it creates a persistent account.

```bash
REAL_E2E_BASE_URL=http://127.0.0.1:3000 \
REAL_E2E_CREATE_ACCOUNT=1 \
REAL_E2E_EMAIL='abhishekgarg8+bharatdoc-codex-YYYYMMDD@gmail.com' \
REAL_E2E_PASSWORD='<generated-test-password>' \
pnpm smoke:real-browser
```

Expected result: signup is submitted and the script stops when the app asks for email confirmation.

## Email Confirmation

Find the latest Supabase/BharatDoc confirmation email in Gmail, copy the confirmation URL, then resume:

```bash
REAL_E2E_BASE_URL=http://127.0.0.1:3000 \
REAL_E2E_PHASE=resume \
REAL_E2E_CONFIRM_URL='<confirmation-url-from-gmail>' \
REAL_E2E_EMAIL='abhishekgarg8+bharatdoc-codex-YYYYMMDD@gmail.com' \
REAL_E2E_PASSWORD='<generated-test-password>' \
pnpm smoke:real-browser
```

Expected result: the script confirms the email, logs in, completes owner onboarding, records audio with a fake microphone file, transcribes, generates summary, generates PDF, searches by Patient ID, and saves screenshots under `output/playwright/real-account-YYYY-MM-DD/`.

If Chromium's fake microphone emits a WAV blob that the transcription provider rejects as corrupted or unsupported, the runner captures the failed transcription state and uploads the generated WAV file directly to the worker for the same real recording. The browser then resumes from dashboard/detail screens and still verifies transcript, summary, PDF, and search with screenshots.
