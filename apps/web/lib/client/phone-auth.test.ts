import { describe, expect, it } from "vitest";
import { formatIndianPhoneNumber, firebaseAuthErrorMessage } from "@/lib/client/phone-auth";

describe("phone auth helpers", () => {
  it("normalizes Indian mobile numbers to E.164", () => {
    expect(formatIndianPhoneNumber("98765 43210")).toBe("+919876543210");
    expect(formatIndianPhoneNumber("+91 98765 43210")).toBe("+919876543210");
  });

  it("rejects invalid mobile numbers", () => {
    expect(() => formatIndianPhoneNumber("123")).toThrow("10-digit");
  });

  it("falls back to readable error messages", () => {
    expect(firebaseAuthErrorMessage(new Error("Custom failure"))).toBe("Custom failure");
    expect(firebaseAuthErrorMessage("nope")).toBe("Authentication failed. Please try again.");
  });
});
