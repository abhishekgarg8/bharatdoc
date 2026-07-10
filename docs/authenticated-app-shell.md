# Authenticated application shell

Issue #77 introduces the first shared authenticated route boundary at `app/(authenticated)/layout.tsx`. The dashboard is the representative migration; other authenticated pages retain their existing lifecycle until later increments.

## State and routing policy

- [x] `loading` gates all page children while the session and bootstrap are unresolved.
- [x] `unauthenticated` routes to `/signup` without mounting authenticated content.
- [x] `pending` and `rejected` clear any formerly active cache and route to `/pending-approval` or `/access-rejected`.
- [x] `active_online` exposes the verified doctor/clinic scope and conservative permissions.
- [x] `active_offline_stale` exposes only an unexpired, exact-user cached recording scope.
- [x] `error` gates page content and exposes a retry action.
- [x] `active_demo` is possible only through the existing env-gated `?demo=1` helper; missing auth or request errors never enable it.

## Bootstrap, cache, and requests

`GET /api/me` is the canonical no-store bootstrap. Its response is limited to doctor identity/status/role/name plus clinic ID/name; it contains no patient, recording, prompt, phone, clinic code, or address data. Concurrent calls for one token share an in-flight request, while consumer cancellation is isolated.

The local cache contains only clinic name and `{authUserId, doctorId, clinicId}`. It is versioned, JWT-subject scoped, validated on every read, and expires after 24 hours. Corrupt, expired, cross-user, pending, and rejected state is removed. JWT decoding selects a cache namespace and is never treated as authorization.

The provider subscribes to Supabase auth changes once. Token/user changes invalidate older generations, abort lifecycle requests, and ignore late responses. Bootstrap requests time out after 8 seconds; provider-authenticated page requests time out after 10 seconds and abort on caller cancellation, sign-out, token change, or unmount. Connectivity failures may use a valid stale cache; HTTP/auth/application failures may not.

## Page integration rule

Authenticated pages consume `useAuthenticatedApp()` for token, doctor/clinic scope, permissions, refresh, sign-out, and authenticated requests. Page-specific payloads stay outside the provider. In particular, dashboard recording rows remain in `/api/dashboard` and are never persisted in the shared context or scope cache.
