import admin from "firebase-admin";
import type { FirebaseTokenVerifier } from "./types.js";

export function createFirebaseTokenVerifier(serviceAccountJson: string): FirebaseTokenVerifier {
  const existing = admin.apps.find((app) => app?.name === "bharatdoc-worker");
  const app =
    existing ??
    admin.initializeApp(
      {
        credential: admin.credential.cert(JSON.parse(serviceAccountJson) as admin.ServiceAccount)
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
