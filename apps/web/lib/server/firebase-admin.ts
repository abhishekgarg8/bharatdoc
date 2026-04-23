import "server-only";
import fs from "node:fs";
import path from "node:path";
import admin from "firebase-admin";
import { parseServiceAccountJson } from "@bharatdoc/shared";
import type { TokenVerifier, VerifiedUser } from "@/lib/server/auth";
import { AppError } from "@/lib/server/errors";
import { getWebEnv } from "@/lib/server/env";

function readFallbackEnvFile(): string | undefined {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, "utf8");
    }
  }

  return undefined;
}

export function createFirebaseAdminVerifier(serviceAccountJson = getWebEnv().FIREBASE_ADMIN_SDK_JSON): TokenVerifier {
  const existing = admin.apps.find((app) => app?.name === "bharatdoc-web");
  const app =
    existing ??
    admin.initializeApp(
      {
        credential: admin.credential.cert(
          parseServiceAccountJson(serviceAccountJson, readFallbackEnvFile()) as admin.ServiceAccount
        )
      },
      "bharatdoc-web"
    );

  return {
    async verifyIdToken(token: string): Promise<VerifiedUser> {
      const decoded = await app.auth().verifyIdToken(token);

      if (!decoded.phone_number) {
        throw new AppError(401, "Firebase phone number is required.", "PHONE_REQUIRED");
      }

      return {
        uid: decoded.uid,
        phoneNumber: decoded.phone_number
      };
    }
  };
}
