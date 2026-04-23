"use client";

import { FirebaseError, initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type Auth,
  type ConfirmationResult
} from "firebase/auth";

export interface PhoneAuthSession {
  verifyOtp(otp: string): Promise<string>;
}

export interface PhoneAuthClient {
  sendOtp(phoneNumber: string): Promise<PhoneAuthSession>;
  getCurrentIdToken(): Promise<string | null>;
}

type RecaptchaVerifierWithInternals = RecaptchaVerifier & {
  render(): Promise<number>;
  clear(): void;
};

let sharedRecaptchaVerifier: RecaptchaVerifierWithInternals | null = null;
let sharedRecaptchaContainerId: string | null = null;

export function formatIndianPhoneNumber(input: string): string {
  const digits = input.replace(/\D/g, "");
  const withoutCountry = digits.startsWith("91") && digits.length > 10 ? digits.slice(2) : digits;

  if (withoutCountry.length !== 10) {
    throw new Error("Enter a valid 10-digit Indian mobile number.");
  }

  return `+91${withoutCountry}`;
}

export function firebaseAuthErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    if (error.code === "auth/invalid-phone-number") {
      return "Enter a valid mobile number.";
    }

    if (error.code === "auth/invalid-verification-code") {
      return "The OTP you entered is incorrect.";
    }

    if (error.code === "auth/too-many-requests") {
      return "Too many attempts. Please try again later.";
    }
  }

  return error instanceof Error ? error.message : "Authentication failed. Please try again.";
}

function getFirebaseAuth(): Auth | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!apiKey || !authDomain || !projectId) {
    return null;
  }

  const app =
    getApps()[0] ??
    initializeApp({
      apiKey,
      authDomain,
      projectId
    });

  return getAuth(app);
}

async function resetRecaptchaVerifier(verifier: RecaptchaVerifierWithInternals): Promise<void> {
  try {
    const widgetId = await verifier.render();
    if (typeof window !== "undefined" && window.grecaptcha) {
      window.grecaptcha.reset(widgetId);
    }
  } catch {
    // If render/reset fails, fall back to clearing and recreating the verifier on the next attempt.
  } finally {
    verifier.clear();
    if (sharedRecaptchaVerifier === verifier) {
      sharedRecaptchaVerifier = null;
      sharedRecaptchaContainerId = null;
    }
  }
}

function getRecaptchaVerifier(auth: Auth, containerId: string): RecaptchaVerifierWithInternals {
  if (sharedRecaptchaVerifier && sharedRecaptchaContainerId === containerId) {
    return sharedRecaptchaVerifier;
  }

  if (sharedRecaptchaVerifier) {
    sharedRecaptchaVerifier.clear();
  }

  sharedRecaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
    size: "invisible"
  }) as RecaptchaVerifierWithInternals;
  sharedRecaptchaContainerId = containerId;
  return sharedRecaptchaVerifier;
}

export function createFirebasePhoneAuthClient(containerId = "send-otp-button"): PhoneAuthClient {
  return {
    async sendOtp(phoneNumber: string): Promise<PhoneAuthSession> {
      const auth = getFirebaseAuth();

      if (!auth) {
        throw new Error("Firebase client environment is not configured.");
      }

      const verifier = getRecaptchaVerifier(auth, containerId);
      let confirmation: ConfirmationResult;

      try {
        confirmation = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      } catch (error) {
        await resetRecaptchaVerifier(verifier);
        throw error;
      }

      return {
        async verifyOtp(otp: string): Promise<string> {
          const credential = await confirmation.confirm(otp);
          return credential.user.getIdToken();
        }
      };
    },

    async getCurrentIdToken(): Promise<string | null> {
      const auth = getFirebaseAuth();

      if (!auth) {
        return null;
      }

      return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          unsubscribe();
          void (async () => {
            resolve(user ? await user.getIdToken() : null);
          })();
        });
      });
    }
  };
}
