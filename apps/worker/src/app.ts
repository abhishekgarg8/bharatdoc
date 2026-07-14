import { randomUUID } from "node:crypto";
import { TranscriptionSessionFinalizeRequestSchema, UuidSchema } from "@bharatdoc/shared";
import cors from "cors";
import express, { type RequestHandler } from "express";
import multer from "multer";
import {
  authenticatedContext,
  createAuthenticationMiddleware,
} from "./auth.js";
import {
  createErrorHandler,
  HttpError,
  sanitizeErrorForTelemetry,
} from "./http-errors.js";
import { consoleStructuredLogger } from "./logger.js";
import { generateRecordingPdf } from "./pdf-generation.js";
import { summarizeRecording } from "./summary.js";
import { createTranscriptionSession, uploadTranscriptionChunk } from "./transcription-sessions.js";
import {
  MAX_TRANSCRIPTION_UPLOAD_BYTES,
  MAX_TRANSCRIPTION_AUDIO_BYTES,
  transcribeRecording,
  type TranscribeRecordingInput,
} from "./transcription.js";
import type { WorkerDependencies } from "./types.js";
import {
  createUploadAdmission,
  holdUploadPermitForHandler,
  type UploadAdmissionLimits,
} from "./upload-admission.js";

interface WorkerAppOptions {
  corsOrigins?: string;
  multipartParser?: RequestHandler;
  uploadAdmission?: Partial<UploadAdmissionLimits>;
  transcriptionSessionsEnabled?: boolean;
  transcriptionModel?: string;
}

const DEFAULT_CORS_ORIGINS = [
  "https://bharatdoc.vercel.app",
  "https://bharatdoc-web.vercel.app",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
];

function parseCorsOrigins(corsOrigins: string | undefined): string[] {
  const configuredOrigins = (corsOrigins ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_CORS_ORIGINS, ...configuredOrigins]));
}

function requestIdFromHeader(
  header: string | string[] | undefined,
): string | null {
  if (typeof header === "string" && header.trim()) {
    return header.trim();
  }

  if (Array.isArray(header)) {
    const value = header.find((entry) => entry.trim());
    return value?.trim() ?? null;
  }

  return null;
}

function idempotencyKeyFromHeader(header: string | string[] | undefined): string | undefined {
  const value = requestIdFromHeader(header);
  if (!value) return undefined;
  if (value.length > 120 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new HttpError(400, "Idempotency key is invalid.", "IDEMPOTENCY_KEY_INVALID");
  }
  return value;
}

function recordingIdFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("recording_id" in body)) {
    return null;
  }

  const recordingId = (body as { recording_id?: unknown }).recording_id;
  return typeof recordingId === "string" && recordingId.trim()
    ? recordingId.trim()
    : null;
}

export function createApp(
  deps: WorkerDependencies,
  options: WorkerAppOptions = {},
): express.Express {
  const app = express();
  const allowedOrigins = parseCorsOrigins(options.corsOrigins);
  const logger = deps.logger ?? consoleStructuredLogger;
  const authenticate = createAuthenticationMiddleware(deps);
  const uploadAdmission = createUploadAdmission(options.uploadAdmission);
  const jsonBody = express.json({ limit: "1mb" });
  const finalizationBody = express.raw({ type: "*/*", limit: "1kb" });
  const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_TRANSCRIPTION_UPLOAD_BYTES,
      files: 1,
      fields: 1,
      parts: 3,
      fieldNameSize: 64,
      fieldSize: 1024,
    },
  });
  const multipartParser =
    options.multipartParser ?? audioUpload.single("audio");
  const chunkMultipartParser = options.multipartParser ?? multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_TRANSCRIPTION_AUDIO_BYTES, files: 1, fields: 3, parts: 5, fieldNameSize: 64, fieldSize: 1024 }
  }).single("audio");

  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const requestId =
      requestIdFromHeader(req.headers["x-request-id"]) ??
      requestIdFromHeader(req.headers["x-railway-request-id"]) ??
      randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    next();
  });
  app.use(
    cors({
      allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID"],
      methods: ["GET", "POST", "OPTIONS"],
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ""))) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
    }),
  );
  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "bharatdoc-worker",
    });
  });

  app.get("/api/me", authenticate, (_req, res) => {
    res.json({ doctor: authenticatedContext(res).doctor });
  });

  app.post("/api/transcription-sessions", authenticate, jsonBody, async (req, res, next) => {
    try {
      if (!options.transcriptionSessionsEnabled) throw new HttpError(404, "Chunk sessions are disabled.", "TRANSCRIPTION_SESSIONS_DISABLED");
      const idempotencyKey = idempotencyKeyFromHeader(req.headers["idempotency-key"]);
      const manifest = await createTranscriptionSession(authenticatedContext(res), {
        recordingId: typeof req.body.recording_id === "string" ? req.body.recording_id : undefined,
        expectedChunkCount: Number(req.body.expected_chunk_count), ...(idempotencyKey ? { idempotencyKey } : {})
      }, deps, options.transcriptionModel ?? "gpt-4o-mini-transcribe");
      res.status(201).json({ manifest });
    } catch (error) { next(error); }
  });

  app.get("/api/transcription-sessions/:sessionId", authenticate, async (req, res, next) => {
    try {
      if (!options.transcriptionSessionsEnabled || !deps.transcriptionSessions) {
        throw new HttpError(404, "Transcription session was not found.", "TRANSCRIPTION_SESSION_NOT_FOUND");
      }
      const auth = authenticatedContext(res);
      if (!auth.doctor.clinic_id) throw new HttpError(403, "Doctor must belong to a hospital.", "CLINIC_REQUIRED");
      const manifest = await deps.transcriptionSessions.get({
        sessionId: String(req.params.sessionId), doctorId: auth.doctor.id, clinicId: auth.doctor.clinic_id
      });
      if (!manifest) throw new HttpError(404, "Transcription session was not found.", "TRANSCRIPTION_SESSION_NOT_FOUND");
      res.json({ manifest });
    } catch (error) { next(error); }
  });

  app.post("/api/transcription-sessions/:sessionId/finalize", authenticate, finalizationBody, async (req, res, next) => {
    try {
      if (!options.transcriptionSessionsEnabled || !deps.transcriptionSessions) {
        throw new HttpError(404, "Chunk sessions are disabled.", "TRANSCRIPTION_SESSIONS_DISABLED");
      }
      let body: unknown = {};
      if (Buffer.isBuffer(req.body) && req.body.length) {
        if (!req.is("application/json")) throw new HttpError(400, "Request validation failed.", "VALIDATION_ERROR");
        try { body = JSON.parse(req.body.toString("utf8")); }
        catch { throw new HttpError(400, "Request validation failed.", "VALIDATION_ERROR"); }
      }
      TranscriptionSessionFinalizeRequestSchema.parse(body);
      const auth = authenticatedContext(res);
      if (!auth.doctor.clinic_id) throw new HttpError(403, "Doctor must belong to a hospital.", "CLINIC_REQUIRED");
      const idempotencyKey = idempotencyKeyFromHeader(req.headers["idempotency-key"]);
      if (!idempotencyKey) throw new HttpError(400, "Idempotency key is required.", "IDEMPOTENCY_KEY_REQUIRED");
      const sessionId = UuidSchema.parse(String(req.params.sessionId));
      const finalization = await deps.transcriptionSessions.finalize({
        sessionId, doctorId: auth.doctor.id,
        clinicId: auth.doctor.clinic_id, idempotencyKey
      });
      res.json({ finalization });
    } catch (error) { next(error); }
  });

  app.post("/api/transcription-sessions/:sessionId/chunks", uploadAdmission.limitIp, authenticate,
    uploadAdmission.admitAuthenticated, chunkMultipartParser,
    async (req, res, next) => {
      const releaseUploadPermit = holdUploadPermitForHandler(res);
      try {
        if (!options.transcriptionSessionsEnabled) throw new HttpError(404, "Chunk sessions are disabled.", "TRANSCRIPTION_SESSIONS_DISABLED");
        const result = await uploadTranscriptionChunk(authenticatedContext(res), {
          sessionId: String(req.params.sessionId), index: Number(req.body.chunk_index),
          count: Number(req.body.chunk_count), durationSeconds: Number(req.body.duration_seconds),
          ...(req.file ? { audio: req.file } : {})
        }, deps);
        res.status(result.outcome === "in_progress" ? 202 : 200).json(result);
      } catch (error) { next(error); } finally { releaseUploadPermit(); }
    });

  app.get("/api/transcription-manifests/:jobId", authenticate, async (req, res, next) => {
    try {
      const auth = authenticatedContext(res);
      const clinicId = auth.doctor.clinic_id;
      const jobId = typeof req.params.jobId === "string" ? req.params.jobId.trim() : "";
      if (!jobId) {
        throw new HttpError(400, "Transcription manifest ID is required.", "TRANSCRIPTION_MANIFEST_ID_REQUIRED");
      }
      if (!clinicId) {
        throw new HttpError(403, "Doctor must belong to a hospital.", "CLINIC_REQUIRED");
      }
      if (!deps.processingJobs) {
        throw new HttpError(404, "Transcription manifest was not found.", "TRANSCRIPTION_MANIFEST_NOT_FOUND");
      }
      const manifest = await deps.processingJobs.getTranscriptionManifest({
        jobId,
        doctorId: auth.doctor.id,
        clinicId
      });
      if (!manifest) {
        throw new HttpError(404, "Transcription manifest was not found.", "TRANSCRIPTION_MANIFEST_NOT_FOUND");
      }
      res.json({ manifest });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/transcribe",
    uploadAdmission.limitIp,
    authenticate,
    uploadAdmission.admitAuthenticated,
    jsonBody,
    multipartParser,
    async (req, res, next) => {
      const releaseUploadPermit = holdUploadPermitForHandler(res);
      const requestId = res.locals.requestId as string;
      const startedAt = Date.now();
      const recordingId = recordingIdFromBody(req.body);

      try {
        logger.info("transcription.request.received", {
          request_id: requestId,
          recording_id: recordingId,
          method: req.method,
          path: req.path,
          content_length: req.header("content-length") ?? null,
          audio_size_bytes: req.file?.size ?? null,
          audio_mime_type: req.file?.mimetype ?? null,
        });
        const auth = authenticatedContext(res);
        const admissionRecordingId = res.locals.uploadRecordingId as string | undefined;
        if (admissionRecordingId && recordingId && admissionRecordingId !== recordingId) {
          throw new HttpError(409, "Idempotency key does not match the recording.", "IDEMPOTENCY_KEY_REUSED");
        }
        logger.info("transcription.request.authenticated", {
          request_id: requestId,
          recording_id: recordingId,
          doctor_id: auth.doctor.id,
          clinic_id: auth.doctor.clinic_id,
        });
        const input: TranscribeRecordingInput = {};

        if (typeof req.body.recording_id === "string") {
          input.recordingId = req.body.recording_id;
        }

        if (req.file) {
          input.audio = req.file;
        }

        input.requestId = requestId;
        const idempotencyKey = idempotencyKeyFromHeader(req.headers["idempotency-key"]);
        if (idempotencyKey) input.idempotencyKey = idempotencyKey;
        const result = await transcribeRecording(auth, input, deps);

        logger.info("transcription.request.succeeded", {
          request_id: requestId,
          recording_id: result.recording_id,
          doctor_id: auth.doctor.id,
          clinic_id: auth.doctor.clinic_id,
          duration_ms: Date.now() - startedAt,
        });
        res.json(result);
      } catch (error) {
        logger.error("transcription.request.failed", {
          request_id: requestId,
          recording_id: recordingId,
          duration_ms: Date.now() - startedAt,
          ...sanitizeErrorForTelemetry(error),
        });
        next(error);
      } finally {
        releaseUploadPermit();
      }
    },
  );

  app.post("/api/summarize", authenticate, jsonBody, async (req, res, next) => {
    try {
      const auth = authenticatedContext(res);
      const idempotencyKey = idempotencyKeyFromHeader(req.headers["idempotency-key"]);
      const result = await summarizeRecording(
        auth,
        {
          ...(typeof req.body.recording_id === "string" ? { recordingId: req.body.recording_id } : {}),
          ...(idempotencyKey ? { idempotencyKey } : {})
        },
        deps,
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/generate-pdf",
    authenticate,
    jsonBody,
    async (req, res, next) => {
      try {
        const auth = authenticatedContext(res);
        const idempotencyKey = idempotencyKeyFromHeader(req.headers["idempotency-key"]);
        const result = await generateRecordingPdf(
          auth,
          {
            ...(typeof req.body.recording_id === "string" ? { recordingId: req.body.recording_id } : {}),
            ...(idempotencyKey ? { idempotencyKey } : {})
          },
          deps,
        );

        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  app.use(createErrorHandler(logger));

  return app;
}
