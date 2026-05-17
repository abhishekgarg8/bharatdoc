import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import multer from "multer";
import { authenticateRequest } from "./auth.js";
import {
  createErrorHandler,
  sanitizeErrorForTelemetry,
} from "./http-errors.js";
import { consoleStructuredLogger } from "./logger.js";
import { generateRecordingPdf } from "./pdf-generation.js";
import { summarizeRecording } from "./summary.js";
import {
  MAX_TRANSCRIPTION_UPLOAD_BYTES,
  transcribeRecording,
  type TranscribeRecordingInput,
} from "./transcription.js";
import type { WorkerDependencies } from "./types.js";

interface WorkerAppOptions {
  corsOrigins?: string;
}

function parseCorsOrigins(corsOrigins: string | undefined): string[] {
  return (corsOrigins ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
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
  const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_TRANSCRIPTION_UPLOAD_BYTES,
    },
  });

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
      allowedHeaders: ["Authorization", "Content-Type"],
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
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "bharatdoc-worker",
    });
  });

  app.get("/api/me", async (req, res, next) => {
    try {
      const auth = await authenticateRequest(req, deps);
      res.json({
        doctor: auth.doctor,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/transcribe",
    audioUpload.single("audio"),
    async (req, res, next) => {
      const requestId = res.locals.requestId as string;
      const startedAt = Date.now();
      const recordingId = recordingIdFromBody(req.body);

      logger.info("transcription.request.received", {
        request_id: requestId,
        recording_id: recordingId,
        method: req.method,
        path: req.path,
        content_length: req.header("content-length") ?? null,
        audio_size_bytes: req.file?.size ?? null,
        audio_mime_type: req.file?.mimetype ?? null,
      });

      try {
        const auth = await authenticateRequest(req, deps);
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
      }
    },
  );

  app.post("/api/summarize", async (req, res, next) => {
    try {
      const auth = await authenticateRequest(req, deps);
      const result = await summarizeRecording(
        auth,
        {
          recordingId:
            typeof req.body.recording_id === "string"
              ? req.body.recording_id
              : undefined,
        },
        deps,
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/generate-pdf", async (req, res, next) => {
    try {
      const auth = await authenticateRequest(req, deps);
      const result = await generateRecordingPdf(
        auth,
        {
          recordingId:
            typeof req.body.recording_id === "string"
              ? req.body.recording_id
              : undefined,
        },
        deps,
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.use(createErrorHandler(logger));

  return app;
}
