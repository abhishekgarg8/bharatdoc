import { describe, expect, it } from "vitest";
import { normalizeUsername, PasswordCredentialsSchema, usernameToAuthEmail } from "./auth.js";

describe("auth helpers", () => {
  it("normalizes username credentials for Supabase password auth", () => {
    expect(normalizeUsername(" Dr_Aparna-1 ")).toBe("dr_aparna-1");
    expect(usernameToAuthEmail("Dr.Aparna")).toBe("dr.aparna@bharatdoc.local");
  });

  it("validates usernames and passwords", () => {
    expect(PasswordCredentialsSchema.parse({ username: "doctor01", password: "bharatdoc123" })).toEqual({
      username: "doctor01",
      password: "bharatdoc123"
    });
    expect(() => PasswordCredentialsSchema.parse({ username: "bad name", password: "bharatdoc123" })).toThrow();
    expect(() => PasswordCredentialsSchema.parse({ username: "doctor01", password: "short" })).toThrow();
  });
});
