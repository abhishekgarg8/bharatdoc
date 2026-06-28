# Store Review Notes Template

Use this as the basis for TestFlight and Google Play closed-testing review notes.

## Demo Access

Provide a confirmed BharatDoc owner account with an active clinic.

Do not commit credentials to this repository.

## Reviewer Flow

1. Launch BharatDoc.
2. Log in with the supplied reviewer account.
3. Open Dashboard.
4. Start a new consultation recording.
5. Allow microphone permission.
6. Stop recording, transcribe, generate summary, save PDF, and search by Patient ID.

## Medical Disclaimer

BharatDoc creates AI-assisted clinical documentation for clinicians. Generated summaries must be reviewed and verified by the clinician before clinical use.

## Backend Availability

Keep these production services online during review:

- Web app: `https://bharatdoc-web.vercel.app`
- Worker: `https://bharatdocworker-production.up.railway.app`
