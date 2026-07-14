import { describe, expect, it, vi } from "vitest";
import { gracefullyStopServer, idempotentShutdown } from "../shutdown.js";

describe("worker shutdown", () => {
  it("shares one shutdown across repeated mixed signals", async () => {
    const action = vi.fn(async () => undefined);
    const shutdown = idempotentShutdown(action);
    await Promise.all([shutdown(), shutdown()]);
    expect(action).toHaveBeenCalledOnce();
  });
  it("closes HTTP and completes when the queue is disabled", async () => {
    const closeHttp = vi.fn(async () => undefined);
    await expect(gracefullyStopServer(null, closeHttp, 50)).resolves.toBe(true);
    expect(closeHttp).toHaveBeenCalledOnce();
  });

  it("bounds shutdown when active work does not stop", async () => {
    vi.useFakeTimers();
    try {
      const result = gracefullyStopServer({ stop: vi.fn(() => new Promise<void>(() => undefined)) }, vi.fn(async () => undefined), 50);
      await vi.advanceTimersByTimeAsync(50);
      await expect(result).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports shutdown failures instead of leaving the signal handler hanging", async () => {
    await expect(gracefullyStopServer(null, vi.fn(async () => { throw new Error("close failed"); }), 50))
      .resolves.toBe(false);
  });
});
