import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("search cache policy", () => {
  it("keeps identifier-free navigation shells while all API traffic stays NetworkOnly", async () => {
    const config = await readFile(
      path.resolve(process.cwd(), "next.config.mjs"),
      "utf8",
    );
    expect(config).toContain('url.pathname.startsWith("/api/")');
    expect(config).toMatch(
      /url\.pathname\.startsWith\("\/api\/"\)[\s\S]*?handler: "NetworkOnly"/,
    );
    expect(config).toContain('"/search"');
    expect(config).toContain("ignoreSearch: true");
    expect(config).not.toContain("patient_id");
  });
});
