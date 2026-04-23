import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Doctor, Recording } from "@bharatdoc/shared";
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

const recording: Recording = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  doctor_id: activeDoctor.id,
  clinic_id: activeDoctor.clinic_id!,
  patient_id: "P-10483",
  label: "Follow-up",
  duration_seconds: 24,
  audio_storage_path: null,
  transcript: null,
  summary: null,
  pdf_storage_path: null,
  status: "recorded",
  recorded_at: "2026-04-23T06:20:00.000Z",
  created_at: "2026-04-23T06:20:01.000Z"
};

function depsFor(doctor: Doctor | null, recordingResult: Recording | null = recording): WorkerDependencies {
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
    },
    recordings: {
      findRecordingForDoctor: vi.fn(async () => recordingResult),
      markRecordingTranscribed: vi.fn(async (input) => ({
        ...(recordingResult ?? recording),
        audio_storage_path: input.audioStoragePath,
        transcript: input.transcript,
        status: "transcribed" as const
      }))
    },
    audioStorage: {
      uploadRecordingAudio: vi.fn(async () => "clinic/doctor/recording.webm")
    },
    transcriptionClient: {
      transcribe: vi.fn(async () => "Patient reports fever.")
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

  it("rejects transcription requests without bearer tokens before transcription work", async () => {
    const deps = depsFor(activeDoctor);

    await request(createApp(deps))
      .post("/api/transcribe")
      .expect(401)
      .expect(({ body }) => {
        expect(body.error.code).toBe("AUTH_REQUIRED");
      });

    expect(deps.tokenVerifier.verifyIdToken).not.toHaveBeenCalled();
    expect(deps.recordings.findRecordingForDoctor).not.toHaveBeenCalled();
    expect(deps.audioStorage.uploadRecordingAudio).not.toHaveBeenCalled();
    expect(deps.transcriptionClient.transcribe).not.toHaveBeenCalled();
  });

  it("rejects transcription requests without audio", async () => {
    await request(createApp(depsFor(activeDoctor)))
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .field("recording_id", recording.id)
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe("AUDIO_REQUIRED");
      });
  });

  it("rejects transcription requests without recording ids", async () => {
    await request(createApp(depsFor(activeDoctor)))
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .attach("audio", Buffer.from("audio"), {
        filename: "recording.webm",
        contentType: "audio/webm"
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe("RECORDING_ID_REQUIRED");
      });
  });

  it("transcribes uploaded audio for active doctors", async () => {
    const deps = depsFor(activeDoctor);

    await request(createApp(deps))
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .field("recording_id", recording.id)
      .attach("audio", Buffer.from("audio"), {
        filename: "recording.webm",
        contentType: "audio/webm"
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          recording_id: recording.id,
          transcript: "Patient reports fever."
        });
      });

    expect(deps.recordings.findRecordingForDoctor).toHaveBeenCalledWith(recording.id, activeDoctor.id);
    expect(deps.audioStorage.uploadRecordingAudio).toHaveBeenCalled();
    expect(deps.transcriptionClient.transcribe).toHaveBeenCalled();
    expect(deps.recordings.markRecordingTranscribed).toHaveBeenCalledWith({
      recordingId: recording.id,
      doctorId: activeDoctor.id,
      audioStoragePath: "clinic/doctor/recording.webm",
      transcript: "Patient reports fever."
    });
  });
});
