export interface StructuredLogPayload {
  [key: string]: unknown;
}

export interface StructuredLogger {
  info(event: string, payload?: StructuredLogPayload): void;
  warn(event: string, payload?: StructuredLogPayload): void;
  error(event: string, payload?: StructuredLogPayload): void;
}

const SENSITIVE_KEY = /(?:recording|doctor|clinic|patient|auth|user).*id|(?:storage|profile|logo).*path|transcript|summary|token|authorization|cookie|signed.*url|secret|password/i;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

function isSensitiveLogKey(key: string): boolean {
  return SENSITIVE_KEY.test(key) || (/(?:^|_)id$/i.test(key) && key !== "request_id");
}

function safeLogValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(UUID, "[id]")
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "[REDACTED_CREDENTIAL]")
      .replace(/https?:\/\/[^\s"']+/gi, "[REDACTED_URL]");
  }
  if (Array.isArray(value)) return value.map(safeLogValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !isSensitiveLogKey(key)).map(([key, item]) => [key, safeLogValue(item)]));
  }
  return value;
}

function writeStructuredLog(
  level: "info" | "warn" | "error",
  event: string,
  payload: StructuredLogPayload = {}
): void {
  const safePayload = safeLogValue(payload) as StructuredLogPayload;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...safePayload
  };
  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const consoleStructuredLogger: StructuredLogger = {
  info(event, payload) {
    writeStructuredLog("info", event, payload);
  },
  warn(event, payload) {
    writeStructuredLog("warn", event, payload);
  },
  error(event, payload) {
    writeStructuredLog("error", event, payload);
  }
};
