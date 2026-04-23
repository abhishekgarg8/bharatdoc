import cors from "cors";
import express from "express";
import multer, { MulterError } from "multer";
import { authenticateRequest } from "./auth.js";
import { errorHandler, HttpError } from "./http-errors.js";
import { MAX_TRANSCRIPTION_AUDIO_BYTES, transcribeUploadedRecording } from "./transcription.js";
import type { WorkerDependencies } from "./types.js";
import type { TranscriptionRequestInput } from "./transcription.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_TRANSCRIPTION_AUDIO_BYTES
  }
});

function uploadAudio(req: express.Request, res: express.Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single("audio")(req, res, (error) => {
      if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
        reject(new HttpError(413, "Audio file exceeds the 25MB Phase 1 limit.", "AUDIO_TOO_LARGE"));
        return;
      }

      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function createApp(deps: WorkerDependencies): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors());
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

  app.post("/api/transcribe", async (req, res, next) => {
    try {
      const auth = await authenticateRequest(req, deps);
      await uploadAudio(req, res);
      const input: TranscriptionRequestInput = {};

      if (req.file) {
        input.audio = req.file;
      }

      if (typeof req.body.recording_id === "string") {
        input.recordingId = req.body.recording_id;
      }

      const result = await transcribeUploadedRecording(auth, input, deps);

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.use(errorHandler);

  return app;
}
