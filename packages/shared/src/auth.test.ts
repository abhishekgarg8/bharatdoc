import { describe, expect, it } from "vitest";
import { normalizeEmail, PasswordCredentialsSchema } from "./auth.js";

describe("auth helpers", () => {
  it("normalizes email credentials for Supabase password auth", () => {
    expect(normalizeEmail(" RehanGupta82@Gmail.com ")).toBe("rehangupta82@gmail.com");
  });

  it("validates emails and passwords", () => {
    expect(PasswordCredentialsSchema.parse({ email: "doctor@example.com", password: "bharatdoc123" })).toEqual({
      email: "doctor@example.com",
      password: "bharatdoc123"
    });
    expect(() => PasswordCredentialsSchema.parse({ email: "bad name", password: "bharatdoc123" })).toThrow();
    expect(() => PasswordCredentialsSchema.parse({ email: "doctor@example.com", password: "short" })).toThrow();
  });
});
