import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "lib/server/supabase.ts"),
  "utf8",
);

describe("supabase server client source contract", () => {
  it("disables Next fetch caching for service-role Supabase reads", () => {
    expect(source).toContain('cache: "no-store"');
    expect(source).toContain("global:");
    expect(source).toContain("fetch: supabaseNoStoreFetch");
  });
});
