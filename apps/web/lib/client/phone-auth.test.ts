import { afterEach, describe, expect, it, vi } from "vitest";
import { createFirebasePhoneAuthClient, formatIndianPhoneNumber, firebaseAuthErrorMessage } from "@/lib/client/phone-auth";

const render = vi.fn(async () => 7);
const clear = vi.fn();
const getIdToken = vi.fn(async () => "verified-id-token");
const confirm = vi.fn(async () => ({ user: { getIdToken } }));
const signInWithPhoneNumber = vi.fn();
const onAuthStateChanged = vi.fn();
const getAuth = vi.fn(() => ({ auth: true }));
const initializeApp = vi.fn(() => ({ app: true }));
const getApps = vi.fn(() => []);
const RecaptchaVerifier = vi.fn(() => ({ render, clear }));

vi.mock("firebase/app", () => ({
  getApps,
  initializeApp
}));

vi.mock("firebase/auth", () => ({
  FirebaseError: class FirebaseError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  RecaptchaVerifier,
  getAuth,
  onAuthStateChanged,
  signInWithPhoneNumber
}));

afterEach(() => {
  clear.mockClear();
  confirm.mockClear();
  getApps.mockClear();
  getAuth.mockClear();
  getIdToken.mockClear();
  initializeApp.mockClear();
  onAuthStateChanged.mockClear();
  RecaptchaVerifier.mockClear();
  render.mockClear();
  signInWithPhoneNumber.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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

  it("reuses the invisible recaptcha verifier across OTP sends", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "firebase-key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "bharatdoc-88.firebaseapp.com");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "bharatdoc-88");
    signInWithPhoneNumber.mockResolvedValue({ confirm });

    const client = createFirebasePhoneAuthClient("send-otp-button");

    await client.sendOtp("+919876543210");
    await client.sendOtp("+919876543211");

    expect(RecaptchaVerifier).toHaveBeenCalledTimes(1);
    expect(signInWithPhoneNumber).toHaveBeenNthCalledWith(1, { auth: true }, "+919876543210", { render, clear });
    expect(signInWithPhoneNumber).toHaveBeenNthCalledWith(2, { auth: true }, "+919876543211", { render, clear });
  });

  it("resets and recreates the verifier after a failed OTP send", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "firebase-key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "bharatdoc-88.firebaseapp.com");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "bharatdoc-88");
    vi.stubGlobal("window", {
      grecaptcha: {
        reset: vi.fn()
      }
    } as unknown as Window & typeof globalThis);
    signInWithPhoneNumber.mockRejectedValueOnce(new Error("Firebase: Error (auth/network-request-failed)."));
    signInWithPhoneNumber.mockResolvedValueOnce({ confirm });

    const client = createFirebasePhoneAuthClient("send-otp-button");

    await expect(client.sendOtp("+919876543210")).rejects.toThrow("auth/network-request-failed");
    await client.sendOtp("+919876543210");

    expect(render).toHaveBeenCalledTimes(1);
    expect(window.grecaptcha.reset).toHaveBeenCalledWith(7);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(RecaptchaVerifier).toHaveBeenCalledTimes(2);
  });
});
