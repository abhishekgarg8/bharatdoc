# PHI-safe patient search navigation

Patient search uses authenticated `POST /api/patients/search`; the identifier is validated in the JSON body and never appears in the request URL. `GET` returns `405` without authentication or query parsing. Success and error responses set browser and CDN `no-store` headers, the client requests `cache: "no-store"`, and the PWA keeps every `/api/*` request `NetworkOnly`.

Search pages remain an identifier-free offline app shell. The query and result list live only in expiring `sessionStorage`, scoped to the exact Supabase auth user, doctor, and clinic. The lifetime is capped at ten minutes, result count and field lengths are bounded, and signed PDF URLs are never persisted. Search-result links are `/recordings/{recordingId}` and the detail return link is always `/search`; neither carries a patient ID or serialized return URL. Legacy search/detail query strings and fragments are discarded during client bootstrap.

Behavior:

- Back from detail restores the in-memory page or the exact-scope session state.
- Reloading `/search` restores unexpired exact-scope query/results after authenticated bootstrap.
- Reloading detail can still offer the safe `/search` return while exact-scope state is valid.
- Expired, corrupt, unavailable, or storage-denied state fails closed and returns to recent records/dashboard behavior.
- Missing authentication or any auth-user/doctor/clinic mismatch deletes stored search state, preventing account-switch disclosure.
- Central auth sign-out and recording deletion also delete stored search state.
- Session state is tab-scoped, is not copied to local storage, service-worker caches, URLs, logs, or telemetry, and disappears when the tab session ends.

Cross-clinic access remains server enforced: the authenticated doctor supplies the clinic scope, and the repository query filters recordings by that clinic before applying the patient-ID prefix.
