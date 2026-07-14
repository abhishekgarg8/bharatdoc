import { hostname } from "node:os";
import { createApp } from "./app.js";
import { workerEnv } from "./env.js";
import { createSupabaseTokenVerifier } from "./supabase-auth.js";
import {
  createOpenAISummaryClient,
  createOpenAITranscriptionClient,
} from "./openai.js";
import { createSimplePdfRenderer } from "./pdf-renderer.js";
import {
  createClinicRepository,
  createDoctorRepository,
  createProcessingJobRepository,
  createRecordingProcessingRepository,
  createSupabaseAudioStorage,
  createSupabasePdfStorage,
  createTranscriptionAttemptRepository,
  createTranscriptionSessionRepository,
} from "./repositories.js";
import { supabase } from "./supabase.js";
import { consoleStructuredLogger } from "./logger.js";
import { queueRollout, startProcessingQueueWorker } from "./processing-queue.js";
import { gracefullyStopServer, idempotentShutdown } from "./shutdown.js";

const deps = {
  tokenVerifier: createSupabaseTokenVerifier(supabase),
  doctors: createDoctorRepository(supabase),
  clinics: createClinicRepository(supabase),
  recordings: createRecordingProcessingRepository(supabase),
  transcriptionAttempts: createTranscriptionAttemptRepository(supabase),
  transcriptionClient: createOpenAITranscriptionClient(
    workerEnv.OPENAI_API_KEY,
    workerEnv.OPENAI_TRANSCRIPTION_MODEL,
  ),
  summaryClient: createOpenAISummaryClient(
    workerEnv.OPENAI_API_KEY,
    workerEnv.OPENAI_SUMMARY_MODEL,
  ),
  audioStorage: createSupabaseAudioStorage(supabase),
  pdfRenderer: createSimplePdfRenderer(),
  pdfStorage: createSupabasePdfStorage(supabase),
  processingJobs: createProcessingJobRepository(supabase),
  transcriptionSessions: createTranscriptionSessionRepository(supabase),
  logger: consoleStructuredLogger,
};

const queueRuntimeEnabled = workerEnv.WORKER_QUEUE_ENABLED === "true";
const rollout = queueRollout(queueRuntimeEnabled, {
  transcription: workerEnv.WORKER_QUEUE_TRANSCRIPTION === "true",
  summary: workerEnv.WORKER_QUEUE_SUMMARY === "true",
  pdf: workerEnv.WORKER_QUEUE_PDF === "true",
});

const queueWorker = queueRuntimeEnabled
  ? startProcessingQueueWorker(deps, {
      workerId: `${workerEnv.WORKER_QUEUE_WORKER_ID}:${hostname()}:${process.pid}`,
      operations: rollout.drain,
      pollMs: workerEnv.WORKER_QUEUE_POLL_MS,
      batchSize: workerEnv.WORKER_QUEUE_BATCH_SIZE,
    })
  : null;

const app = createApp(deps, {
  corsOrigins: workerEnv.WORKER_CORS_ORIGINS,
  queueOperations: rollout.admission,
  transcriptionSessionsEnabled: workerEnv.TRANSCRIPTION_CHUNK_SESSIONS_ENABLED === "true",
  transcriptionModel: workerEnv.OPENAI_TRANSCRIPTION_MODEL,
  queueRequired: queueRuntimeEnabled,
  queueReady: () => queueWorker?.isReady() ?? false,
});

const server = app.listen(workerEnv.PORT, () => {
  console.log(`BharatDoc worker listening on :${workerEnv.PORT}`);
});

const shutdown = idempotentShutdown(async () => {
  const stopped = await gracefullyStopServer(queueWorker,
    () => new Promise<void>((resolve) => server.close(() => resolve())), 30_000);
  process.exit(stopped ? 0 : 1);
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => void shutdown());
