import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("search cache policy", () => {
  it("keeps identifier-free navigation shells while all API traffic stays network-only", async () => {
    const worker = await readFile(path.resolve(process.cwd(), "public/service-worker.js"), "utf8");

    expect(worker).toContain('url.pathname.startsWith("/api/")');
    expect(worker).toMatch(/url\.pathname\.startsWith\("\/api\/"\)[\s\S]*?event\.respondWith\(fetch\(request\)\)/);
    expect(worker).toContain('"/search"');
    expect(worker).toContain('networkFirst(request, `${url.origin}${url.pathname}`)');
    expect(worker).not.toContain("patient_id");
  });
});
