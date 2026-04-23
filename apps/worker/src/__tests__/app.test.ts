import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Doctor } from "@bharatdoc/shared";
import { createApp } from "../app.js";
import type { WorkerDependencies } from "../types.js";

const activeDoctor: Doctor = {
  id: "11111111-1111-4111-8111-111111111111",
  firebase_uid: "firebase-active",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  role: "doctor",
  account_status: "active",
  name: "Dr. Aparna Iyer",
  specialization: "General Physician",
  medical_reg_no: null,
  phone: "+919876543210",
  profile_photo_path: null,
  custom_prompt: null,
  transcription_lang: "auto",
  created_at: "2026-04-23T09:00:00.000Z"
};

function depsFor(doctor: Doctor | null): WorkerDependencies {
  return {
    tokenVerifier: {
      verifyIdToken: vi.fn(async (token: string) => {
        if (token === "bad-token") {
          throw new Error("bad token");
        }

        return { uid: doctor?.firebase_uid ?? "missing-firebase" };
      })
    },
    doctors: {
      findByFirebaseUid: vi.fn(async () => doctor)
    }
  };
}

describe("worker app", () => {
  it("serves an unauthenticated health check", async () => {
    await request(createApp(depsFor(null)))
      .get("/health")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ ok: true, service: "bharatdoc-worker" });
      });
  });

  it("rejects protected routes without bearer tokens", async () => {
    await request(createApp(depsFor(activeDoctor)))
      .get("/api/me")
      .expect(401)
      .expect(({ body }) => {
        expect(body.error.code).toBe("AUTH_REQUIRED");
      });
  });

  it("rejects protected routes with malformed bearer tokens", async () => {
    await request(createApp(depsFor(activeDoctor)))
      .get("/api/me")
      .set("Authorization", "Token abc")
      .expect(401)
      .expect(({ body }) => {
        expect(body.error.code).toBe("AUTH_REQUIRED");
      });
  });

  it("rejects Firebase tokens that do not map to a doctor", async () => {
    await request(createApp(depsFor(null)))
      .get("/api/me")
      .set("Authorization", "Bearer valid-token")
      .expect(401)
      .expect(({ body }) => {
        expect(body.error.code).toBe("AUTH_REQUIRED");
      });
  });

  it("rejects pending doctors before owner approval", async () => {
    await request(createApp(depsFor({ ...activeDoctor, account_status: "pending_approval" })))
      .get("/api/me")
      .set("Authorization", "Bearer valid-token")
      .expect(403)
      .expect(({ body }) => {
        expect(body.error.code).toBe("ACCOUNT_INACTIVE");
      });
  });

  it("returns the active doctor for authenticated requests", async () => {
    await request(createApp(depsFor(activeDoctor)))
      .get("/api/me")
      .set("Authorization", "Bearer valid-token")
      .expect(200)
      .expect(({ body }) => {
        expect(body.doctor.id).toBe(activeDoctor.id);
        expect(body.doctor.firebase_uid).toBe(activeDoctor.firebase_uid);
      });
  });
});
