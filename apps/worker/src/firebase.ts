import fs from "node:fs";
import path from "node:path";
import admin from "firebase-admin";
import { parseServiceAccountJson } from "@bharatdoc/shared";
import type { FirebaseTokenVerifier } from "./types.js";

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

export function createFirebaseTokenVerifier(serviceAccountJson: string): FirebaseTokenVerifier {
  const existing = admin.apps.find((app) => app?.name === "bharatdoc-worker");
  const app =
    existing ??
    admin.initializeApp(
      {
        credential: admin.credential.cert(
          parseServiceAccountJson(serviceAccountJson, readFallbackEnvFile()) as admin.ServiceAccount
        )
      },
      "bharatdoc-worker"
    );

  return {
    async verifyIdToken(token) {
      const decoded = await app.auth().verifyIdToken(token);
      const verifiedToken = {
        uid: decoded.uid
      };

      return decoded.phone_number
        ? {
            ...verifiedToken,
            phone_number: decoded.phone_number
          }
        : verifiedToken;
    }
  };
}
