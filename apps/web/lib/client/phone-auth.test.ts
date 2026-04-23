import { afterEach, describe, expect, it, vi } from "vitest";
import { createFirebasePhoneAuthClient, formatIndianPhoneNumber, firebaseAuthErrorMessage } from "@/lib/client/phone-auth";

const firebaseMocks = vi.hoisted(() => {
  class FirebaseError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
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

  return {
    FirebaseError,
    RecaptchaVerifier,
    clear,
    confirm,
    getApps,
    getAuth,
    getIdToken,
    initializeApp,
    onAuthStateChanged,
    render,
    signInWithPhoneNumber
  };
});

vi.mock("firebase/app", () => ({
  FirebaseError: firebaseMocks.FirebaseError,
  getApps: firebaseMocks.getApps,
  initializeApp: firebaseMocks.initializeApp
}));

vi.mock("firebase/auth", () => ({
  FirebaseError: firebaseMocks.FirebaseError,
  RecaptchaVerifier: firebaseMocks.RecaptchaVerifier,
  getAuth: firebaseMocks.getAuth,
  onAuthStateChanged: firebaseMocks.onAuthStateChanged,
  signInWithPhoneNumber: firebaseMocks.signInWithPhoneNumber
}));

afterEach(() => {
  firebaseMocks.clear.mockClear();
  firebaseMocks.confirm.mockClear();
  firebaseMocks.getApps.mockClear();
  firebaseMocks.getAuth.mockClear();
  firebaseMocks.getIdToken.mockClear();
  firebaseMocks.initializeApp.mockClear();
  firebaseMocks.onAuthStateChanged.mockClear();
  firebaseMocks.RecaptchaVerifier.mockClear();
  firebaseMocks.render.mockClear();
  firebaseMocks.signInWithPhoneNumber.mockReset();
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
    firebaseMocks.signInWithPhoneNumber.mockResolvedValue({ confirm: firebaseMocks.confirm });

    const client = createFirebasePhoneAuthClient("send-otp-button-reuse");

    await client.sendOtp("+919876543210");
    await client.sendOtp("+919876543211");

    expect(firebaseMocks.RecaptchaVerifier).toHaveBeenCalledTimes(1);
    expect(firebaseMocks.signInWithPhoneNumber).toHaveBeenNthCalledWith(
      1,
      { auth: true },
      "+919876543210",
      { render: firebaseMocks.render, clear: firebaseMocks.clear }
    );
    expect(firebaseMocks.signInWithPhoneNumber).toHaveBeenNthCalledWith(
      2,
      { auth: true },
      "+919876543211",
      { render: firebaseMocks.render, clear: firebaseMocks.clear }
    );
  });

  it("resets and recreates the verifier after a failed OTP send", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "firebase-key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "bharatdoc-88.firebaseapp.com");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "bharatdoc-88");
    const grecaptcha = {
      reset: vi.fn()
    };
    vi.stubGlobal("window", {
      grecaptcha: {
        reset: grecaptcha.reset
      }
    } as unknown as Window & typeof globalThis);
    firebaseMocks.signInWithPhoneNumber.mockRejectedValueOnce(new Error("Firebase: Error (auth/network-request-failed)."));
    firebaseMocks.signInWithPhoneNumber.mockResolvedValueOnce({ confirm: firebaseMocks.confirm });

    const client = createFirebasePhoneAuthClient("send-otp-button-reset");

    await expect(client.sendOtp("+919876543210")).rejects.toThrow("auth/network-request-failed");
    await client.sendOtp("+919876543210");

    expect(firebaseMocks.render).toHaveBeenCalledTimes(1);
    expect(grecaptcha.reset).toHaveBeenCalledWith(7);
    expect(firebaseMocks.clear).toHaveBeenCalled();
    expect(firebaseMocks.RecaptchaVerifier).toHaveBeenCalledTimes(2);
  });
});
