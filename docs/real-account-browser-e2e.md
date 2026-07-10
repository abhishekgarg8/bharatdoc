# Real Account Browser E2E

This runbook validates BharatDoc through the browser with a real Supabase account and private, expiring screenshots. Never commit its output.

The script is safe by default: it opens onboarding, saves a screenshot, and exits before entering credentials or creating an account.

## Prerequisites

- Keep `.env` unchanged.
- Start the web app with the current Supabase anon key as a runtime override if local `.env` is stale.
- Start the worker on `http://127.0.0.1:8080` for transcription, summary, and PDF coverage.
- Use a disposable alias for the connected account, represented here as `doctor+run@example.com`.

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

Expected result: a redacted screenshot is saved below ignored `.artifacts/private-e2e/`, then the script stops before credential entry/account creation.

## Signup Phase

Requires explicit action-time approval before running because it creates a persistent account.

```bash
REAL_E2E_BASE_URL=http://127.0.0.1:3000 \
REAL_E2E_CREATE_ACCOUNT=1 \
REAL_E2E_EMAIL='doctor+run@example.com' \
REAL_E2E_PASSWORD='<generated-test-password>' \
pnpm smoke:real-browser
```

Expected result: signup is submitted and the script stops when the app asks for email confirmation.

## Email Confirmation

Find the latest Supabase/BharatDoc confirmation email in Gmail, copy the confirmation URL, then resume. The hosted Supabase Confirm signup template must use `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`, and the project redirect allowlist must include the exact app callback URL.

```bash
REAL_E2E_BASE_URL=http://127.0.0.1:3000 \
REAL_E2E_PHASE=resume \
REAL_E2E_CONFIRM_URL='<confirmation-url-from-gmail>' \
REAL_E2E_EMAIL='doctor+run@example.com' \
REAL_E2E_PASSWORD='<generated-test-password>' \
pnpm smoke:real-browser
```

Expected result: the script confirms the email, logs in, completes owner onboarding, records audio with a fake microphone file, transcribes, generates summary, generates PDF, searches by Patient ID, and saves screenshots below ignored `.artifacts/private-e2e/`. Inputs, clinical panels, contacts, URLs, filenames, and metadata are redacted before persistence; raw pixels remain private CI evidence and expire after seven days.

For access-controlled CI capture, manually run **Private E2E artifacts** and retrieve/delete the bundle as documented in `docs/e2e-artifact-security.md`.

If Chromium's fake microphone emits a WAV blob that the transcription provider rejects as corrupted or unsupported, the runner captures the failed transcription state and uploads the generated WAV file directly to the worker for the same real recording. The browser then resumes from dashboard/detail screens and still verifies transcript, summary, PDF, and search with screenshots.
