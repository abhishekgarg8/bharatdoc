import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.mjs";

function routes(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    return entry.isDirectory() ? routes(child) : entry.name === "route.ts" ? [child] : [];
  });
}

describe("API cache policy", () => {
  it("keeps every App Router API endpoint dynamic", () => {
    for (const route of routes(path.join(process.cwd(), "app/api"))) {
      expect(readFileSync(route, "utf8"), route).toContain('export const dynamic = "force-dynamic"');
    }
  });

  it("sets browser and edge no-store headers for the entire API surface", async () => {
    const rules = await nextConfig.headers?.();
    const api = rules?.find(({ source }) => source === "/api/:path*");
    const headers = Object.fromEntries(api?.headers.map(({ key, value }) => [key.toLowerCase(), value]) ?? []);

    expect(headers).toMatchObject({
      "cache-control": "private, no-store, max-age=0",
      "cdn-cache-control": "no-store",
      "vercel-cdn-cache-control": "no-store"
    });
  });
});
