# BharatDoc Mobile Shell

This package contains the Capacitor shell for the BharatDoc Android and iOS beta apps.

The Store MVP loads the production web app at:

```text
https://bharatdoc-web.vercel.app
```

## Commands

From the repo root:

```bash
pnpm mobile:sync
pnpm mobile:open:android
pnpm mobile:open:ios
pnpm mobile:build:android
```

From this package:

```bash
pnpm sync
pnpm assets
pnpm doctor
```

## Release Notes

- Keep the Railway worker live during TestFlight and Google Play review.
- Do not commit reviewer credentials. Provide a confirmed clinic owner account in App Store Connect and Play Console review notes.
- Review notes should state: BharatDoc is AI-assisted clinical documentation; clinicians must review generated summaries before clinical use.
- First release target is TestFlight and Google Play internal/closed testing, not public store launch.

## Sensitive-data backup policy

- Android disables application backup and excludes every app-data domain from both legacy cloud backup and Android 12+ cloud/device transfer. Release QA must inspect the merged manifest because OEM transfer behavior varies.
- iOS marks Application Support and Library/WebKit data `isExcludedFromBackup` at launch and whenever the app backgrounds; this is reapplied after likely WebView writes.
- Consultation checkpoints are recoverable only on the originating device until verified server transcription. They are not a backup source and sign-out purges the signed-in user's local data.
