import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Clinic, Doctor, Recording } from "@bharatdoc/shared";
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
  phone: "+919876543210",
  profile_photo_path: null,
  custom_prompt: null,
  transcription_lang: "auto",
  created_at: "2026-04-23T09:00:00.000Z",
};

const recording: Recording = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  doctor_id: activeDoctor.id,
  clinic_id: activeDoctor.clinic_id!,
  patient_id: "P-10483",
  label: "Follow-up",
  duration_seconds: 24,
  audio_storage_path: "clinic/doctor/recording.webm",
  transcript: "Patient reports fever for two days.",
  summary: "Chief Complaint: Fever\nPlan: Fluids and paracetamol.",
  pdf_storage_path: null,
  status: "summary_ready",
  recorded_at: "2026-04-23T06:20:00.000Z",
  created_at: "2026-04-23T06:20:01.000Z",
};

const clinic: Clinic = {
  id: activeDoctor.clinic_id!,
  name: "Sunrise Clinic",
  clinic_code: "MED42X",
  address: "Pune",
  logo_storage_path: null,
  created_at: "2026-04-23T05:00:00.000Z",
};

function depsFor(
  doctor: Doctor | null,
  recordingResult: Recording | null = recording,
): WorkerDependencies {
  return {
    tokenVerifier: {
      verifyIdToken: vi.fn(async (token: string) => {
        if (token === "bad-token") {
          throw new Error("bad token");
        }

        return { uid: doctor?.firebase_uid ?? "missing-auth-user" };
      }),
    },
    doctors: {
      findByAuthUid: vi.fn(async () => doctor),
    },
    clinics: {
      findClinicById: vi.fn(async () => clinic),
    },
    recordings: {
      findRecordingForDoctor: vi.fn(async () => recordingResult),
      findLatestRecordingAudioPath: vi.fn(async () => recordingResult?.audio_storage_path ?? null),
      markRecordingTranscribed: vi.fn(async (input) => ({
        ...(recordingResult ?? recording),
        audio_storage_path: input.audioStoragePath,
        transcript: input.transcript,
        status: "transcribed" as const,
      })),
      markRecordingAudioUploaded: vi.fn(async (input) => ({
        ...(recordingResult ?? recording),
        audio_storage_path: input.audioStoragePath,
      })),
      markRecordingSummarized: vi.fn(async (input) => ({
        ...(recordingResult ?? recording),
        summary: input.summary,
        status: "summary_ready" as const,
        pdf_storage_path: null,
      })),
      markRecordingPdfSaved: vi.fn(async (input) => ({
        ...(recordingResult ?? recording),
        pdf_storage_path: input.pdfStoragePath,
        status: "pdf_saved" as const,
      })),
    },
    transcriptionClient: {
      transcribe: vi.fn(async () => "Patient reports fever for two days."),
    },
    summaryClient: {
      summarize: vi.fn(
        async () => "Chief Complaint: Fever\nPlan: Fluids and paracetamol.",
      ),
    },
    audioStorage: {
      uploadRecordingAudio: vi.fn(async () => "clinic/doctor/recording.webm"),
      downloadRecordingAudio: vi.fn(async () => ({
        audio: Buffer.from("stored audio"),
        mimeType: "audio/webm",
        filename: "recording.webm",
        size: Buffer.byteLength("stored audio"),
      })),
    },
    pdfRenderer: {
      render: vi.fn(async () => Buffer.from("%PDF-1.4\n")),
    },
    pdfStorage: {
      uploadRecordingPdf: vi.fn(async () => "clinic/doctor/recording.pdf"),
      createSignedUrl: vi.fn(
        async () => "https://signed.example.com/recording.pdf",
      ),
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
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

  it("allows browser requests only from configured CORS origins", async () => {
    await request(
      createApp(depsFor(null), {
        corsOrigins: "https://bharatdoc-web.vercel.app,http://127.0.0.1:3000",
      }),
    )
      .options("/api/transcribe")
      .set("Origin", "https://bharatdoc-web.vercel.app")
      .set("Access-Control-Request-Method", "POST")
      .expect("Access-Control-Allow-Origin", "https://bharatdoc-web.vercel.app")
      .expect(204);

    await request(
      createApp(depsFor(null), {
        corsOrigins: "https://bharatdoc-web.vercel.app",
      }),
    )
      .options("/api/transcribe")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST")
      .expect((response) => {
        expect(response.headers["access-control-allow-origin"]).toBeUndefined();
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

  it("rejects auth tokens that do not map to a doctor", async () => {
    await request(createApp(depsFor(null)))
      .get("/api/me")
      .set("Authorization", "Bearer valid-token")
      .expect(401)
      .expect(({ body }) => {
        expect(body.error.code).toBe("AUTH_REQUIRED");
      });
  });

  it("rejects pending doctors before owner approval", async () => {
    await request(
      createApp(
        depsFor({ ...activeDoctor, account_status: "pending_approval" }),
      ),
    )
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

  it("rejects transcription requests without bearer tokens before audio work", async () => {
    const deps = depsFor(activeDoctor);

    await request(createApp(deps))
      .post("/api/transcribe")
      .field("recording_id", recording.id)
      .attach("audio", Buffer.from("audio"), {
        filename: "recording.webm",
        contentType: "audio/webm",
      })
      .expect(401)
      .expect(({ body }) => {
        expect(body.error.code).toBe("AUTH_REQUIRED");
      });

    expect(deps.tokenVerifier.verifyIdToken).not.toHaveBeenCalled();
    expect(deps.recordings.findRecordingForDoctor).not.toHaveBeenCalled();
    expect(deps.transcriptionClient.transcribe).not.toHaveBeenCalled();
  });

  it("rejects transcription requests without recording ids or audio", async () => {
    await request(createApp(depsFor(activeDoctor)))
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .attach("audio", Buffer.from("audio"), {
        filename: "recording.webm",
        contentType: "audio/webm",
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe("RECORDING_ID_REQUIRED");
      });

    await request(
      createApp(
        depsFor(activeDoctor, {
          ...recording,
          status: "recorded",
          transcript: null,
          summary: null,
          audio_storage_path: null,
        }),
      ),
    )
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .field("recording_id", recording.id)
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe("AUDIO_REQUIRED");
      });
  });

  it("transcribes uploaded audio for active doctors", async () => {
    const deps = depsFor(activeDoctor, {
      ...recording,
      status: "recorded",
      transcript: null,
      summary: null,
    });

    await request(createApp(deps))
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .field("recording_id", recording.id)
      .attach("audio", Buffer.from("audio"), {
        filename: "recording.webm",
        contentType: "audio/webm",
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          recording_id: recording.id,
          transcript: "Patient reports fever for two days.",
          audio_storage_path: "clinic/doctor/recording.webm",
          status: "transcribed",
        });
      });

    expect(deps.recordings.findRecordingForDoctor).toHaveBeenCalledWith(
      recording.id,
      activeDoctor.id,
    );
    expect(deps.audioStorage.uploadRecordingAudio).toHaveBeenCalledWith({
      audio: expect.any(Buffer),
      mimeType: "audio/webm",
      clinicId: activeDoctor.clinic_id,
      doctorId: activeDoctor.id,
      recordingId: recording.id,
      filename: "recording.webm",
    });
    expect(deps.transcriptionClient.transcribe).toHaveBeenCalledWith({
      audio: expect.any(Buffer),
      mimeType: "audio/webm",
      filename: "recording.webm",
      language: "auto",
    });
    expect(deps.recordings.markRecordingTranscribed).toHaveBeenCalledWith({
      recordingId: recording.id,
      doctorId: activeDoctor.id,
      transcript: "Patient reports fever for two days.",
      audioStoragePath: "clinic/doctor/recording.webm",
    });
  });

  it("transcribes from stored server audio when the browser no longer has local audio", async () => {
    const deps = depsFor(activeDoctor, {
      ...recording,
      status: "recorded",
      transcript: null,
      summary: null,
      audio_storage_path: "clinic/doctor/stored.wav",
    });

    await request(createApp(deps))
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .send({ recording_id: recording.id, source: "stored_audio" })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          recording_id: recording.id,
          transcript: "Patient reports fever for two days.",
          audio_storage_path: "clinic/doctor/stored.wav",
          status: "transcribed",
        });
      });

    expect(deps.recordings.findLatestRecordingAudioPath).toHaveBeenCalledWith(
      recording.id,
      activeDoctor.id,
    );
    expect(deps.audioStorage.downloadRecordingAudio).toHaveBeenCalledWith(
      "clinic/doctor/stored.wav",
    );
    expect(deps.audioStorage.uploadRecordingAudio).not.toHaveBeenCalled();
  });

  it("logs and persists failed transcription requests with the request id", async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const deps = {
      ...depsFor(activeDoctor, {
        ...recording,
        status: "recorded",
        transcript: null,
        summary: null,
      }),
      logger,
      transcriptionAttempts: {
        recordFailedAttempt: vi.fn(async () => undefined),
      },
    };
    vi.mocked(deps.transcriptionClient.transcribe).mockRejectedValueOnce(
      new Error("provider failed with secret detail"),
    );

    await request(createApp(deps))
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .set("x-request-id", "req-transcribe-failure")
      .field("recording_id", recording.id)
      .attach("audio", Buffer.from("audio"), {
        filename: "recording.webm",
        contentType: "audio/webm",
      })
      .expect("x-request-id", "req-transcribe-failure")
      .expect(500)
      .expect(({ body }) => {
        expect(body.error.code).toBe("INTERNAL_ERROR");
      });

    expect(deps.transcriptionAttempts.recordFailedAttempt).toHaveBeenCalledWith(
      {
        recordingId: recording.id,
        doctorId: activeDoctor.id,
        clinicId: activeDoctor.clinic_id,
        requestId: "req-transcribe-failure",
        stage: "transcribe_audio",
        errorCode: "INTERNAL_ERROR",
        errorMessage: "Internal server error.",
        errorStatus: 500,
        audioStoragePath: "clinic/doctor/recording.webm",
        audioSizeBytes: 5,
        audioMimeType: "audio/webm",
        upstreamStatus: null,
        upstreamCode: null,
        upstreamType: null,
        upstreamMessage: null,
        upstreamParam: null,
      },
    );
    expect(logger.info).toHaveBeenCalledWith(
      "transcription.request.received",
      expect.objectContaining({
        request_id: "req-transcribe-failure",
        recording_id: recording.id,
        audio_mime_type: "audio/webm",
      }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      "transcription.request.failed",
      expect.objectContaining({
        request_id: "req-transcribe-failure",
        recording_id: recording.id,
        error_code: "INTERNAL_ERROR",
        error_message: "Internal server error.",
      }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      "http.request.failed",
      expect.objectContaining({
        request_id: "req-transcribe-failure",
        path: "/api/transcribe",
        error_code: "INTERNAL_ERROR",
        error_message: "Internal server error.",
      }),
    );
  });

  it("accepts realistic mobile audio uploads under the Phase 1 limit", async () => {
    const deps = depsFor(activeDoctor, {
      ...recording,
      status: "recorded",
      transcript: null,
      summary: null,
    });

    await request(createApp(deps))
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .field("recording_id", recording.id)
      .attach("audio", Buffer.alloc(5 * 1024 * 1024, "a"), {
        filename: "one-hour-mobile-recording.webm",
        contentType: "audio/webm",
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe("transcribed");
      });

    expect(deps.audioStorage.uploadRecordingAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "one-hour-mobile-recording.webm",
        mimeType: "audio/webm",
      }),
    );
  });

  it("rejects transcription when patient id is missing before audio work", async () => {
    const deps = depsFor(activeDoctor, {
      ...recording,
      patient_id: null,
      transcript: null,
      summary: null,
      pdf_storage_path: null,
      status: "recorded",
    });

    await request(createApp(deps))
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .field("recording_id", recording.id)
      .attach("audio", Buffer.from("audio"), {
        filename: "recording.webm",
        contentType: "audio/webm",
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe("PATIENT_ID_REQUIRED");
      });

    expect(deps.audioStorage.uploadRecordingAudio).not.toHaveBeenCalled();
    expect(deps.transcriptionClient.transcribe).not.toHaveBeenCalled();
    expect(deps.recordings.markRecordingTranscribed).not.toHaveBeenCalled();
  });

  it("rejects summary requests without bearer tokens before summary work", async () => {
    const deps = depsFor(activeDoctor);

    await request(createApp(deps))
      .post("/api/summarize")
      .send({ recording_id: recording.id })
      .expect(401)
      .expect(({ body }) => {
        expect(body.error.code).toBe("AUTH_REQUIRED");
      });

    expect(deps.tokenVerifier.verifyIdToken).not.toHaveBeenCalled();
    expect(deps.recordings.findRecordingForDoctor).not.toHaveBeenCalled();
    expect(deps.summaryClient.summarize).not.toHaveBeenCalled();
  });

  it("rejects summary requests without recording ids", async () => {
    await request(createApp(depsFor(activeDoctor)))
      .post("/api/summarize")
      .set("Authorization", "Bearer valid-token")
      .send({})
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe("RECORDING_ID_REQUIRED");
      });
  });

  it("summarizes transcribed recordings for active doctors", async () => {
    const deps = depsFor(activeDoctor);

    await request(createApp(deps))
      .post("/api/summarize")
      .set("Authorization", "Bearer valid-token")
      .send({ recording_id: recording.id })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          recording_id: recording.id,
          summary: "Chief Complaint: Fever\nPlan: Fluids and paracetamol.",
          status: "summary_ready",
        });
      });

    expect(deps.recordings.findRecordingForDoctor).toHaveBeenCalledWith(
      recording.id,
      activeDoctor.id,
    );
    expect(deps.summaryClient.summarize).toHaveBeenCalled();
    expect(deps.recordings.markRecordingSummarized).toHaveBeenCalledWith({
      recordingId: recording.id,
      doctorId: activeDoctor.id,
      summary: "Chief Complaint: Fever\nPlan: Fluids and paracetamol.",
    });
  });

  it("rejects PDF requests without bearer tokens before PDF work", async () => {
    const deps = depsFor(activeDoctor);

    await request(createApp(deps))
      .post("/api/generate-pdf")
      .send({ recording_id: recording.id })
      .expect(401)
      .expect(({ body }) => {
        expect(body.error.code).toBe("AUTH_REQUIRED");
      });

    expect(deps.tokenVerifier.verifyIdToken).not.toHaveBeenCalled();
    expect(deps.recordings.findRecordingForDoctor).not.toHaveBeenCalled();
    expect(deps.pdfRenderer.render).not.toHaveBeenCalled();
  });

  it("rejects PDF requests without recording ids", async () => {
    await request(createApp(depsFor(activeDoctor)))
      .post("/api/generate-pdf")
      .set("Authorization", "Bearer valid-token")
      .send({})
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe("RECORDING_ID_REQUIRED");
      });
  });

  it("generates PDFs for summarized recordings", async () => {
    const deps = depsFor(activeDoctor);

    await request(createApp(deps))
      .post("/api/generate-pdf")
      .set("Authorization", "Bearer valid-token")
      .send({ recording_id: recording.id })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          recording_id: recording.id,
          pdf_storage_path: "clinic/doctor/recording.pdf",
          signed_url: "https://signed.example.com/recording.pdf",
          status: "pdf_saved",
        });
      });

    expect(deps.clinics.findClinicById).toHaveBeenCalledWith(
      activeDoctor.clinic_id,
    );
    expect(deps.pdfRenderer.render).toHaveBeenCalledWith({
      clinic,
      doctor: activeDoctor,
      recording,
      generatedAt: expect.any(Date),
    });
    expect(deps.pdfStorage.uploadRecordingPdf).toHaveBeenCalled();
    expect(deps.recordings.markRecordingPdfSaved).toHaveBeenCalledWith({
      recordingId: recording.id,
      doctorId: activeDoctor.id,
      pdfStoragePath: "clinic/doctor/recording.pdf",
    });
  });
});
