import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

type FetchEvent = {
  request: FakeRequest;
  respondWith(response: Promise<FakeResponse>): void;
};

type FakeResponse = {
  ok: boolean;
  headers: { get(name: string): string | null };
  clone(): FakeResponse;
};

type FakeRequest = {
  method: string;
  mode: string;
  url: string;
  headers: { has(name: string): boolean };
};

function request(path: string, options: { authorization?: boolean; mode?: string } = {}): FakeRequest {
  return {
    method: "GET",
    mode: options.mode ?? "cors",
    url: `https://bharatdoc.example${path}`,
    headers: { has: (name) => name.toLowerCase() === "authorization" && Boolean(options.authorization) }
  };
}

function response(cacheControl: string | null = null): FakeResponse {
  const value = {
    ok: true,
    headers: { get: (name: string) => (name.toLowerCase() === "cache-control" ? cacheControl : null) },
    clone: () => value
  };
  return value;
}

function loadWorker() {
  const listeners = new Map<string, (event: never) => void>();
  const cache = { delete: vi.fn(), keys: vi.fn().mockResolvedValue([]), match: vi.fn(), put: vi.fn() };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue(["workbox-old", "bharatdoc-shell-v2", "other-app-cache"]),
    delete: vi.fn().mockResolvedValue(true)
  };
  const fetch = vi.fn().mockResolvedValue(response());
  const self = {
    location: { origin: "https://bharatdoc.example" },
    clients: { claim: vi.fn() },
    skipWaiting: vi.fn(),
    addEventListener: (name: string, listener: (event: never) => void) => listeners.set(name, listener)
  };

  vm.runInNewContext(readFileSync(path.join(process.cwd(), "public/service-worker.js"), "utf8"), {
    URL,
    caches,
    fetch,
    self
  });

  return { cache, caches, fetch, listeners, self };
}

async function dispatchFetch(listener: (event: FetchEvent) => void, value: FakeRequest) {
  let handled: Promise<FakeResponse> | undefined;
  listener({ request: value, respondWith: (result) => (handled = result) });
  await handled;
}

describe("production service worker", () => {
  it("always sends API and authorization-bearing requests directly to the network", async () => {
    const worker = loadWorker();
    const listener = worker.listeners.get("fetch") as (event: FetchEvent) => void;

    await dispatchFetch(listener, request("/api/recordings"));
    await dispatchFetch(listener, request("/_next/static/app.js", { authorization: true }));

    expect(worker.fetch).toHaveBeenCalledTimes(2);
    expect(worker.caches.open).not.toHaveBeenCalled();
  });

  it("caches only successful public app shells without private/no-store directives", async () => {
    const worker = loadWorker();
    const listener = worker.listeners.get("fetch") as (event: FetchEvent) => void;

    await dispatchFetch(listener, request("/dashboard", { mode: "navigate" }));
    worker.fetch.mockResolvedValueOnce(response("private, no-store"));
    await dispatchFetch(listener, request("/settings", { mode: "navigate" }));

    expect(worker.cache.put).toHaveBeenCalledTimes(1);
    expect(worker.cache.put.mock.calls[0]?.[0]).toBe("https://bharatdoc.example/dashboard");
  });

  it("does not cache unrecognized query strings and bounds owned cache entries", async () => {
    const worker = loadWorker();
    const listener = worker.listeners.get("fetch") as (event: FetchEvent) => void;

    await dispatchFetch(listener, request("/dashboard?patient=secret", { mode: "navigate" }));
    await dispatchFetch(listener, request("/dashboard?demo=1", { mode: "navigate" }));
    expect(worker.caches.open).not.toHaveBeenCalled();

    worker.cache.keys.mockResolvedValueOnce(Array.from({ length: 25 }, (_, index) => `shell-${index}`));
    await dispatchFetch(listener, request("/dashboard", { mode: "navigate" }));
    expect(worker.cache.delete).toHaveBeenCalledWith("shell-0");
  });

  it("removes every legacy Workbox cache during activation", async () => {
    const worker = loadWorker();
    let activation: Promise<unknown> | undefined;

    worker.listeners.get("activate")?.({ waitUntil: (value: Promise<unknown>) => (activation = value) } as never);
    await activation;

    expect(worker.caches.delete).toHaveBeenCalledWith("workbox-old");
    expect(worker.caches.delete).not.toHaveBeenCalledWith("bharatdoc-shell-v2");
    expect(worker.caches.delete).not.toHaveBeenCalledWith("other-app-cache");
    expect(worker.self.clients.claim).toHaveBeenCalled();
  });
});
