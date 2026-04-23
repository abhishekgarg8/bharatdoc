import { describe, expect, it } from "vitest";
import { extractBearerToken } from "../auth.js";

describe("worker auth helpers", () => {
  it("extracts bearer tokens case-insensitively", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
    expect(extractBearerToken("bearer abc123")).toBe("abc123");
  });

  it("rejects missing or malformed authorization headers", () => {
    expect(() => extractBearerToken(undefined)).toThrow("required");
    expect(() => extractBearerToken("Token abc123")).toThrow("malformed");
  });
});
