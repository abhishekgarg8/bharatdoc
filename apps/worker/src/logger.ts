export interface StructuredLogPayload {
  [key: string]: unknown;
}

export interface StructuredLogger {
  info(event: string, payload?: StructuredLogPayload): void;
  warn(event: string, payload?: StructuredLogPayload): void;
  error(event: string, payload?: StructuredLogPayload): void;
}

function writeStructuredLog(
  level: "info" | "warn" | "error",
  event: string,
  payload: StructuredLogPayload = {}
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...payload
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
