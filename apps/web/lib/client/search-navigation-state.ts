import type { DashboardRecord } from "@/lib/client/dashboard-data";

export interface SearchNavigationScope {
  authUserId: string;
  doctorId: string;
  clinicId: string | null;
}

export interface SearchNavigationState {
  query: string;
  records: DashboardRecord[];
}

interface StoredSearchNavigationState extends SearchNavigationState {
  scope: SearchNavigationScope;
  expiresAt: number;
}

const KEY = "bharatdoc-search-navigation-v1";
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_RECORDS = 50;

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function sameScope(
  left: SearchNavigationScope,
  right: SearchNavigationScope,
): boolean {
  return (
    left.authUserId === right.authUserId &&
    left.doctorId === right.doctorId &&
    left.clinicId === right.clinicId
  );
}

function validState(
  state: StoredSearchNavigationState | null,
): state is StoredSearchNavigationState {
  return Boolean(
    state &&
    state.scope &&
    typeof state.scope.authUserId === "string" &&
    state.scope.authUserId.length > 0 &&
    typeof state.scope.doctorId === "string" &&
    state.scope.doctorId.length > 0 &&
    (typeof state.scope.clinicId === "string" ||
      state.scope.clinicId === null) &&
    typeof state.query === "string" &&
    state.query.length > 0 &&
    state.query.length <= 120 &&
    typeof state.expiresAt === "number" &&
    Number.isFinite(state.expiresAt) &&
    Array.isArray(state.records) &&
    state.records.length <= MAX_RECORDS &&
    state.records.every(
      (record) =>
        record &&
        typeof record.id === "string" &&
        record.id.length <= 120 &&
        typeof record.patientId === "string" &&
        record.patientId.length <= 120,
    ),
  );
}

export function clearSearchNavigationState(storage = store()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    return;
  }
}

export function saveSearchNavigationState(
  scope: SearchNavigationScope,
  state: SearchNavigationState,
  {
    storage = store(),
    now = Date.now(),
    ttlMs = DEFAULT_TTL_MS,
  }: { storage?: Storage | null; now?: number; ttlMs?: number } = {},
): void {
  try {
    const query = state.query.trim().slice(0, 120);
    if (!query || !scope.authUserId || !scope.doctorId || !Number.isFinite(now))
      return clearSearchNavigationState(storage);
    const records = state.records
      .slice(0, MAX_RECORDS)
      .map(({ pdfSignedUrl: _signedUrl, ...record }) => record);
    const lifetime = Number.isFinite(ttlMs)
      ? Math.min(DEFAULT_TTL_MS, Math.max(1, ttlMs))
      : DEFAULT_TTL_MS;
    storage?.setItem(
      KEY,
      JSON.stringify({
        query,
        records,
        scope,
        expiresAt: now + lifetime,
      } satisfies StoredSearchNavigationState),
    );
  } catch {
    return;
  }
}

export function scrubCurrentNavigationUrl(): void {
  if (
    typeof window === "undefined" ||
    (!window.location.search && !window.location.hash)
  )
    return;
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname,
  );
}

export function readSearchNavigationState(
  scope: SearchNavigationScope,
  {
    storage = store(),
    now = Date.now(),
  }: { storage?: Storage | null; now?: number } = {},
): SearchNavigationState | null {
  if (!storage) return null;
  try {
    const state = JSON.parse(
      storage.getItem(KEY) ?? "null",
    ) as StoredSearchNavigationState | null;
    if (
      !validState(state) ||
      state.expiresAt <= now ||
      !sameScope(state.scope, scope)
    ) {
      clearSearchNavigationState(storage);
      return null;
    }
    return { query: state.query, records: state.records };
  } catch {
    clearSearchNavigationState(storage);
    return null;
  }
}
