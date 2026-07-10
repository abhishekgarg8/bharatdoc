import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Clinic, Doctor, Recording } from "@bharatdoc/shared";
import type { RequestHandler } from "express";
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
  pdf_generated_at: null,
  pdf_version: null,
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
      findLatestRecordingAudioPath: vi.fn(
        async () => recordingResult?.audio_storage_path ?? null,
      ),
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
        pdf_generated_at: null,
        pdf_version: null,
      })),
      markRecordingPdfSaved: vi.fn(async (input) => ({
        ...(recordingResult ?? recording),
        pdf_storage_path: input.pdfStoragePath,
        pdf_generated_at: input.pdfGeneratedAt,
        pdf_version: input.pdfVersion,
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

  it("allows the production website origin for browser transcription uploads", async () => {
    await request(
      createApp(depsFor(null), {
        corsOrigins: "https://bharatdoc-web.vercel.app",
      }),
    )
      .options("/api/transcribe")
      .set("Origin", "https://bharatdoc.vercel.app")
      .set("Access-Control-Request-Method", "POST")
      .expect("Access-Control-Allow-Origin", "https://bharatdoc.vercel.app")
      .expect(204);
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

  it("authenticates active doctors before parsing multipart bodies", async () => {
    const multipartParser: RequestHandler = vi.fn((_req, _res, next) => next());
    const unauthenticated = depsFor(activeDoctor);

    await request(createApp(unauthenticated, { multipartParser }))
      .post("/api/transcribe")
      .set("Content-Type", "multipart/form-data")
      .send("an intentionally invalid multipart body")
      .expect(401)
      .expect(({ body }) => {
        expect(body.error.code).toBe("AUTH_REQUIRED");
      });

    expect(unauthenticated.tokenVerifier.verifyIdToken).not.toHaveBeenCalled();

    const invalidToken = depsFor(activeDoctor);

    await request(createApp(invalidToken, { multipartParser }))
      .post("/api/transcribe")
      .set("Authorization", "Bearer bad-token")
      .set("Content-Type", "multipart/form-data")
      .send("an intentionally invalid multipart body")
      .expect(401)
      .expect(({ body }) => {
        expect(body.error.code).toBe("AUTH_REQUIRED");
      });

    expect(invalidToken.doctors.findByAuthUid).not.toHaveBeenCalled();

    await request(createApp(depsFor(activeDoctor), { multipartParser }))
      .post("/api/transcribe")
      .set("Authorization", "Token malformed")
      .set("Content-Type", "multipart/form-data")
      .send("an intentionally invalid multipart body")
      .expect(401);

    const pending = depsFor({
      ...activeDoctor,
      account_status: "pending_approval",
    });

    await request(createApp(pending, { multipartParser }))
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .set("Content-Type", "multipart/form-data")
      .send("an intentionally invalid multipart body")
      .expect(403)
      .expect(({ body }) => {
        expect(body.error.code).toBe("ACCOUNT_INACTIVE");
      });

    expect(pending.recordings.findRecordingForDoctor).not.toHaveBeenCalled();

    await request(
      createApp(depsFor({ ...activeDoctor, account_status: "rejected" }), {
        multipartParser,
      }),
    )
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .set("Content-Type", "multipart/form-data")
      .send("an intentionally invalid multipart body")
      .expect(403)
      .expect(({ body }) => {
        expect(body.error.code).toBe("ACCOUNT_INACTIVE");
      });

    expect(multipartParser).not.toHaveBeenCalled();
  });

  it("rate-limits transcription uploads per authenticated doctor", async () => {
    const secondDoctor = {
      ...activeDoctor,
      id: "33333333-3333-4333-8333-333333333333",
      firebase_uid: "firebase-second",
    };
    const deps = depsFor(activeDoctor, {
      ...recording,
      status: "recorded",
      transcript: null,
      summary: null,
    });
    deps.tokenVerifier.verifyIdToken = vi.fn(async (token) => ({ uid: token }));
    deps.doctors.findByAuthUid = vi.fn(async (uid) =>
      uid === secondDoctor.firebase_uid ? secondDoctor : activeDoctor,
    );
    const app = createApp(deps, {
      uploadAdmission: {
        maxConcurrent: 2,
        maxPerIp: 10,
        maxPerUser: 1,
        windowMs: 60_000,
      },
    });

    await request(app)
      .post("/api/transcribe")
      .set("Authorization", `Bearer ${activeDoctor.firebase_uid}`)
      .send({ recording_id: recording.id })
      .expect(200);

    await request(app)
      .post("/api/transcribe")
      .set("Authorization", `Bearer ${activeDoctor.firebase_uid}`)
      .send({ recording_id: recording.id })
      .expect("Retry-After", "60")
      .expect(429)
      .expect(({ body }) => {
        expect(body.error.code).toBe("UPLOAD_USER_RATE_LIMITED");
      });

    await request(app)
      .post("/api/transcribe")
      .set("Authorization", `Bearer ${secondDoctor.firebase_uid}`)
      .send({ recording_id: recording.id })
      .expect(200);
  });

  it("rate-limits transcription uploads per client IP", async () => {
    const app = createApp(
      depsFor(activeDoctor, {
        ...recording,
        status: "recorded",
        transcript: null,
        summary: null,
      }),
      {
        uploadAdmission: {
          maxConcurrent: 2,
          maxPerIp: 1,
          maxPerUser: 10,
          windowMs: 60_000,
        },
      },
    );

    await request(app)
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .set("X-Real-IP", "192.0.2.1")
      .send({ recording_id: recording.id })
      .expect(200);

    await request(app)
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .set("X-Real-IP", "192.0.2.1")
      .send({ recording_id: recording.id })
      .expect("Retry-After", "60")
      .expect(429)
      .expect(({ body }) => {
        expect(body.error.code).toBe("UPLOAD_IP_RATE_LIMITED");
      });

    await request(app)
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .set("X-Real-IP", "198.51.100.2")
      .send({ recording_id: recording.id })
      .expect(200);
  });

  it("returns 413 for Multer limits and releases the upload permit", async () => {
    const multipartParser: RequestHandler = (_req, _res, next) => {
      next(
        Object.assign(new Error("File too large"), {
          name: "MulterError",
          code: "LIMIT_FILE_SIZE",
        }),
      );
    };
    const app = createApp(depsFor(activeDoctor), {
      multipartParser,
      uploadAdmission: {
        maxConcurrent: 1,
        maxPerIp: 10,
        maxPerUser: 10,
        windowMs: 60_000,
      },
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(app)
        .post("/api/transcribe")
        .set("Authorization", "Bearer valid-token")
        .field("recording_id", recording.id)
        .expect(413)
        .expect(({ body }) => {
          expect(body.error.code).toBe("AUDIO_TOO_LARGE");
        });
    }
  });

  it("bounds real multipart fields and releases admission after rejection", async () => {
    const app = createApp(depsFor(activeDoctor, {
      ...recording,
      status: "recorded",
      transcript: null,
      summary: null,
    }), {
      uploadAdmission: {
        maxConcurrent: 1,
        maxPerIp: 10,
        maxPerUser: 10,
      },
    });

    await request(app)
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .field("recording_id", recording.id)
      .field("unexpected", "bounded")
      .expect(413)
      .expect(({ body }) => {
        expect(body.error.code).toBe("AUDIO_TOO_LARGE");
      });

    await request(app)
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .send({ recording_id: recording.id })
      .expect(200);
  });

  it("caps concurrent in-memory transcription uploads and releases admission", async () => {
    let releaseTranscription!: () => void;
    let transcriptionStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      transcriptionStarted = resolve;
    });
    const blocked = new Promise<string>((resolve) => {
      releaseTranscription = () =>
        resolve("Patient reports fever for two days.");
    });
    const deps = depsFor(activeDoctor, {
      ...recording,
      status: "recorded",
      transcript: null,
      summary: null,
    });
    vi.mocked(deps.transcriptionClient.transcribe).mockImplementationOnce(
      async () => {
        transcriptionStarted();
        return blocked;
      },
    );
    const app = createApp(deps, {
      uploadAdmission: {
        maxConcurrent: 1,
        maxPerIp: 10,
        maxPerUser: 10,
        windowMs: 60_000,
      },
    });
    const first = request(app)
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .field("recording_id", recording.id)
      .attach("audio", Buffer.from("first audio"), {
        filename: "first.webm",
        contentType: "audio/webm",
      })
      .then((response) => response);

    await started;
    await request(app)
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .send({ recording_id: recording.id })
      .expect(429)
      .expect(({ body }) => {
        expect(body.error.code).toBe("UPLOAD_CONCURRENCY_LIMITED");
      });

    releaseTranscription();
    expect((await first).status).toBe(200);

    await request(app)
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .send({ recording_id: recording.id })
      .expect(200);
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

    const app = createApp(deps);

    await request(app)
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
    const app = createApp(deps);

    await request(app)
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

    await request(app)
      .post("/api/transcribe")
      .set("Authorization", "Bearer valid-token")
      .send({ recording_id: recording.id })
      .expect(200);
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
      pdf_generated_at: null,
      pdf_version: null,
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

  it("authenticates before parsing protected JSON bodies", async () => {
    await request(createApp(depsFor(activeDoctor)))
      .post("/api/summarize")
      .set("Content-Type", "application/json")
      .send("{")
      .expect(401)
      .expect(({ body }) => {
        expect(body.error.code).toBe("AUTH_REQUIRED");
      });
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
          summary:
            "Chief Complaint\nFever\n\nTreatment / Prescription\nFluids and paracetamol.",
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
      summary:
        "Chief Complaint\nFever\n\nTreatment / Prescription\nFluids and paracetamol.",
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
          pdf_generated_at: expect.any(String),
          pdf_version: "v1",
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
      pdfGeneratedAt: expect.any(String),
      pdfVersion: "v1",
    });
  });
});
