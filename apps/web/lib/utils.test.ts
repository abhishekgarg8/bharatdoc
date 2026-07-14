import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges conflicting Tailwind 4 utilities", () => {
    expect(cn("bg-paper stroke-[3]", "bg-terracotta stroke-3")).toBe("bg-terracotta stroke-3");
  });
});
