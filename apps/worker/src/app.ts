import cors from "cors";
import express from "express";
import multer from "multer";
import { authenticateRequest } from "./auth.js";
import { errorHandler } from "./http-errors.js";
import { generateRecordingPdf } from "./pdf-generation.js";
import { summarizeRecording } from "./summary.js";
import { MAX_TRANSCRIPTION_AUDIO_BYTES, transcribeRecording, type TranscribeRecordingInput } from "./transcription.js";
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

export function createApp(deps: WorkerDependencies, options: WorkerAppOptions = {}): express.Express {
  const app = express();
  const allowedOrigins = parseCorsOrigins(options.corsOrigins);
  const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_TRANSCRIPTION_AUDIO_BYTES
    }
  });

  app.disable("x-powered-by");
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
      }
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "bharatdoc-worker"
    });
  });

  app.get("/api/me", async (req, res, next) => {
    try {
      const auth = await authenticateRequest(req, deps);
      res.json({
        doctor: auth.doctor
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/transcribe", audioUpload.single("audio"), async (req, res, next) => {
    try {
      const auth = await authenticateRequest(req, deps);
      const input: TranscribeRecordingInput = {};

      if (typeof req.body.recording_id === "string") {
        input.recordingId = req.body.recording_id;
      }

      if (req.file) {
        input.audio = req.file;
      }

      const result = await transcribeRecording(auth, input, deps);

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/summarize", async (req, res, next) => {
    try {
      const auth = await authenticateRequest(req, deps);
      const result = await summarizeRecording(
        auth,
        {
          recordingId: typeof req.body.recording_id === "string" ? req.body.recording_id : undefined
        },
        deps
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
          recordingId: typeof req.body.recording_id === "string" ? req.body.recording_id : undefined
        },
        deps
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.use(errorHandler);

  return app;
}
