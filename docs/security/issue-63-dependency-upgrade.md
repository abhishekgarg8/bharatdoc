# Issue 63 dependency security upgrade

Reviewed: 2026-07-11
Owner: BharatDoc platform maintainers
Next scheduled review: 2026-09-01

## Supported target and audit result

Next.js moved from unsupported 14.2.35 to exactly pinned 15.5.20. Next 15 is the current Maintenance LTS; choosing it over Active LTS 16 limits this security fix to the documented 14-to-15 migration while retaining security maintenance. The September review must plan the move to Next 16 before Next 15 leaves its two-year maintenance window. See the official [support policy](https://nextjs.org/support-policy) and [version 15 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-15).

| Production package | Before | After |
| --- | ---: | ---: |
| Next.js | 14.2.35 | 15.5.20 |
| React / React DOM | 18.3.1 | 19.2.7 |
| Supabase JS | 2.104.0 | 2.105.0 |
| `@ducanh2912/next-pwa` | 10.2.9 | removed |
| Node runtime policy | unspecified | >=20 |

`pnpm audit --prod --json` fell from 25 advisories (11 high, 11 moderate, 3 low; 597 dependencies) to zero at every severity (302 dependencies). There is therefore no residual advisory requiring a reachability exception or compensating control.

The remediated production paths were:

- direct Next.js App Router/RSC advisories: upgrade to patched 15.5.20;
- Workbox `serialize-javascript`, `fast-uri`, Babel plugin/core paths: remove `next-pwa` and own the small service worker;
- Supabase Realtime and OpenAI peer `ws`: resolve 8.21.0;
- OpenAI `@types/node-fetch > form-data`: resolve 4.0.6;
- Express/body-parser `qs`: resolve 6.15.3;
- Next.js `postcss`: override to 8.5.16; remaining Babel core resolves 7.29.6.

## Production build and cold-start comparison

Both framework builds were clean, uncontended production builds on the same host with Node 22.23.1. Build wall time and maximum RSS came from `/usr/bin/time`; file totals came from the resulting `.next` tree. Cold-start figures are one directional local `next start` sample followed by unauthenticated `/api/me` requests, not a load benchmark.

| Measure | Next 14.2.35 | Next 15.5.20 | Change |
| --- | ---: | ---: | ---: |
| Build wall time | 334.47 s | 217.19 s | -35.1% |
| Build max RSS | 978,104 KiB | 656,756 KiB | -32.9% |
| `.next` total | 142,460 KiB | 185,976 KiB | +30.5% |
| `.next/static` | 1,816 KiB | 2,088 KiB | +15.0% |
| `.next/server` | 2,888 KiB | 4,456 KiB | +54.3% |
| Static JS | 1,397,319 B / 51 files | 1,473,922 B / 72 files | +5.5% bytes |
| Server App JS | 663,084 B / 57 files | 1,448,020 B / 78 files | +118.4% bytes |
| Shared first-load JS | 89.8 kB | 102 kB | +13.6% |
| Dashboard / new recording | 200 kB / 200 kB | 208 kB / 208 kB | +4.0% |
| Recording detail | 199 kB | 207 kB | +4.0% |
| Local server ready | 2.20 s | 0.84 s | -61.8% |
| First API total / TTFB | 129.2 / 126.6 ms | 57.8 / 31.9 ms | -55.3% / -74.8% |
| Warm API total | 12.28 ms | 9.95 ms | -19.0% |

The larger raw server/output trees reflect Next 15's changed tracing and route-output layout; client-facing key-page growth remained about 4%, while build memory, build time, and the directional cold start improved.

## Runtime security guarantees

- All 20 App Router API handlers remain `force-dynamic`; Next config applies `private, no-store, max-age=0`, `CDN-Cache-Control: no-store`, and `Vercel-CDN-Cache-Control: no-store` to `/api/:path*`.
- The production-only owned worker sends every API, non-GET, cross-origin, and authorization-bearing request directly to the network. It rejects query-bearing navigation/static cache keys and responses marked private/no-store or setting cookies.
- Only explicit query-free app shells and immutable same-origin static assets are cached, under canonical query-free keys with 24/96 entry bounds. Activation removes known BharatDoc/legacy Workbox caches without deleting unrelated origin caches.
- The production PWA smoke verified a controlled worker, live API no-store headers, bounded PHI-free Cache Storage, and offline onboarding/signup shells. VM tests exercise the actual shipped worker source, including API/auth bypass, query rejection, bounds, and legacy cleanup.

## Ongoing controls

`pnpm audit:prod` is the local release command. GitHub Actions runs the high/critical production audit on every pull request, pushes to `main`, manual dispatch, and a weekly disclosure scan, with a 10-minute timeout. Dependabot runs weekly; Next/React and Supabase updates are grouped, production patch/minor updates are grouped, and majors remain separate for review. Any future accepted advisory must record reachability, compensating control, owner, and review date here before release.
