import "server-only";

interface TimingEntry {
  name: string;
  durationMs: number;
}

function timingName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function createServerTiming() {
  const entries: TimingEntry[] = [];

  return {
    async measure<T>(name: string, operation: () => Promise<T>): Promise<T> {
      const startedAt = performance.now();

      try {
        return await operation();
      } finally {
        entries.push({
          name: timingName(name),
          durationMs: performance.now() - startedAt
        });
      }
    },
    header(): string {
      return entries.map((entry) => `${entry.name};dur=${entry.durationMs.toFixed(1)}`).join(", ");
    }
  };
}

export function jsonWithServerTiming(body: unknown, timing: ReturnType<typeof createServerTiming>): Response {
  const header = timing.header();
  const init = header ? { headers: { "Server-Timing": header } } : undefined;
  return Response.json(body, init);
}
