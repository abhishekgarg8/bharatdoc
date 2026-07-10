import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAuthenticatedBootstrapRequests,
  fetchAuthenticatedBootstrap,
  type AuthenticatedBootstrap,
} from "@/lib/client/authenticated-app";

const bootstrap: AuthenticatedBootstrap = {
  doctor: {
    id: "11111111-1111-4111-8111-111111111111",
    authUserId: "auth-user-1",
    clinicId: "22222222-2222-4222-8222-222222222222",
    role: "doctor",
    accountStatus: "active",
    name: "Dr. Nisha Shah",
  },
  clinic: { id: "22222222-2222-4222-8222-222222222222", name: "Care Hospital" },
};

describe("authenticated app bootstrap", () => {
  afterEach(() => clearAuthenticatedBootstrapRequests());

  it("deduplicates concurrent bootstrap calls and removes settled entries", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(bootstrap),
    ) as unknown as typeof fetch;

    const [first, second] = await Promise.all([
      fetchAuthenticatedBootstrap("token", fetcher),
      fetchAuthenticatedBootstrap("token", fetcher),
    ]);

    expect(first).toEqual(bootstrap);
    expect(second).toEqual(bootstrap);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await fetchAuthenticatedBootstrap("token", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("bounds bootstrap latency by aborting timed-out requests", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    ) as unknown as typeof fetch;

    const request = fetchAuthenticatedBootstrap("token", fetcher, {
      timeoutMs: 50,
    });
    const rejection = expect(request).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(50);

    await rejection;
    expect(
      (fetcher as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.signal,
    ).toHaveProperty("aborted", true);
    vi.useRealTimers();
  });

  it("rejects on timeout even when a non-compliant fetcher ignores abort", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      () => new Promise<Response>(() => undefined),
    ) as unknown as typeof fetch;

    const request = fetchAuthenticatedBootstrap("token", fetcher, {
      timeoutMs: 50,
    });
    const rejection = expect(request).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(50);

    await rejection;
    vi.useRealTimers();
  });

  it("forwards external cancellation and never sends the token in the URL", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.signal).toBeDefined();
        return Response.json(bootstrap);
      },
    ) as unknown as typeof fetch;

    await fetchAuthenticatedBootstrap("secret-token", fetcher, {
      signal: controller.signal,
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({
        headers: { Authorization: "Bearer secret-token" },
        cache: "no-store",
      }),
    );
    expect(fetcher).not.toHaveBeenCalledWith(
      expect.stringContaining("secret-token"),
      expect.anything(),
    );
  });

  it("does not let one cancelled consumer poison another deduped consumer", async () => {
    let resolveResponse!: (value: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetcher = vi.fn(() => response) as unknown as typeof fetch;
    const controller = new AbortController();
    const cancelled = fetchAuthenticatedBootstrap("token", fetcher, {
      signal: controller.signal,
    });
    const survivor = fetchAuthenticatedBootstrap("token", fetcher);

    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    resolveResponse(Response.json(bootstrap));

    await expect(survivor).resolves.toEqual(bootstrap);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not start a request for an already-cancelled consumer", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn() as unknown as typeof fetch;
    controller.abort();

    await expect(
      fetchAuthenticatedBootstrap("token", fetcher, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
