export type DeviceLogLevel = "debug" | "info" | "warn" | "error";

export interface DeviceLogInput {
  level: DeviceLogLevel;
  event: string;
  message?: string | null;
  recordingId?: string | null;
  patientId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface DeviceLogEntry extends DeviceLogInput {
  id: string;
  createdAt: string;
  deviceId: string;
  sessionId: string;
  appVersion: string;
  userAgent: string;
  url: string;
}

interface DeviceLogStore {
  deviceId: string;
  sessionId: string;
  logs: DeviceLogEntry[];
}

const STORE_KEY = "bharatdoc-device-logs-v1";
const MAX_LOGS = 250;
const APP_VERSION = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local";

function safeRandomId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function storage(): Storage | null {
  try {
    const localStorage = typeof window === "undefined" ? null : window.localStorage;

    if (
      !localStorage ||
      typeof localStorage.getItem !== "function" ||
      typeof localStorage.setItem !== "function" ||
      typeof localStorage.removeItem !== "function"
    ) {
      return null;
    }

    return localStorage;
  } catch {
    return null;
  }
}

function readStore(): DeviceLogStore {
  const localStorage = storage();
  const fallback: DeviceLogStore = {
    deviceId: safeRandomId("device"),
    sessionId: safeRandomId("session"),
    logs: []
  };

  if (!localStorage) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Partial<DeviceLogStore> | null;
    const store: DeviceLogStore = {
      deviceId: typeof parsed?.deviceId === "string" ? parsed.deviceId : fallback.deviceId,
      sessionId: typeof parsed?.sessionId === "string" ? parsed.sessionId : fallback.sessionId,
      logs: Array.isArray(parsed?.logs) ? (parsed.logs as DeviceLogEntry[]).slice(-MAX_LOGS) : []
    };

    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    return store;
  } catch {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(fallback));
    } catch {
      return fallback;
    }
    return fallback;
  }
}

function writeStore(store: DeviceLogStore): void {
  const localStorage = storage();

  if (!localStorage) {
    return;
  }

  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        ...store,
        logs: store.logs.slice(-MAX_LOGS)
      })
    );
  } catch {
    return;
  }
}

function currentUrl(): string {
  return typeof window === "undefined" ? "" : window.location.href;
}

function currentUserAgent(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent;
}

export function appendDeviceLog(input: DeviceLogInput): DeviceLogEntry {
  const store = readStore();
  const entry: DeviceLogEntry = {
    ...input,
    event: input.event.slice(0, 120),
    message: input.message?.slice(0, 500) ?? null,
    id: safeRandomId("log"),
    createdAt: new Date().toISOString(),
    deviceId: store.deviceId,
    sessionId: store.sessionId,
    appVersion: APP_VERSION,
    userAgent: currentUserAgent(),
    url: currentUrl()
  };

  writeStore({
    ...store,
    logs: [...store.logs, entry].slice(-MAX_LOGS)
  });

  return entry;
}

export function listDeviceLogs(): DeviceLogEntry[] {
  return readStore().logs;
}

export async function flushDeviceLogs({
  idToken,
  fetcher = fetch,
  maxBatch = 100
}: {
  idToken: string;
  fetcher?: typeof fetch;
  maxBatch?: number;
}): Promise<number> {
  const store = readStore();
  const batch = store.logs.slice(0, maxBatch);

  if (!batch.length) {
    return 0;
  }

  const response = await fetcher("/api/device-logs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      device_id: store.deviceId,
      session_id: store.sessionId,
      logs: batch
    })
  });

  if (!response.ok) {
    return 0;
  }

  const flushedIds = new Set(batch.map((log) => log.id));
  writeStore({
    ...store,
    logs: store.logs.filter((log) => !flushedIds.has(log.id))
  });

  return batch.length;
}
