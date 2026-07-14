import { describe, expect, it, vi } from "vitest";
import { renderSummaryPrompt, type Doctor, type Recording } from "@bharatdoc/shared";
import { HttpError } from "../http-errors.js";
import { runWithProcessingDeadline, sha256, withProcessingHeartbeat } from "../processing.js";
import {
  enqueueTranscriptionProcessingJob,
  enqueueSummaryProcessingJob,
  queueRollout,
  runProcessingQueueOnce,
  startProcessingQueueWorker
} from "../processing-queue.js";
import type {
  PersistedTranscriptionChunk,
  ProcessingJobClaim,
  ProcessingJobStateRepository,
  QueuedProcessingJob,
  WorkerDependencies
} from "../types.js";

const doctor: Doctor = {
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
  doctor_id: doctor.id,
  clinic_id: doctor.clinic_id!,
  patient_id: "P-10483",
  label: "Follow-up",
  duration_seconds: 24,
  audio_storage_path: "clinic/doctor/recording.webm",
  transcript: "Patient reports fever for two days.",
  summary: null,
  pdf_storage_path: null,
  pdf_generated_at: null,
  pdf_version: null,
  status: "transcribed",
  recorded_at: "2026-04-23T06:20:00.000Z",
  created_at: "2026-04-23T06:20:01.000Z",
};

function queuedJob(id = "job-1"): QueuedProcessingJob {
  return {
    id,
    operation: "summary",
    state: "failed",
    lifecycleState: "queued",
    leaseToken: null,
    leaseExpiresAt: null,
    attempt: 1,
    maxAttempts: 3,
    result: null,
    inputHash: sha256(renderSummaryPrompt(doctor.custom_prompt, recording.transcript!)),
    inputVersion: 1,
    scheduledAt: "2026-07-10T10:00:00.000Z",
    startedAt: null,
    heartbeatAt: null,
    nextRetryAt: null,
    completedAt: null,
    terminalErrorCode: null,
    terminalErrorMessage: null,
    outputReference: null,
    stateVersion: 0,
    createdAt: "2026-07-10T10:00:00.000Z",
    recordingId: recording.id,
    doctorId: doctor.id,
    clinicId: doctor.clinic_id!,
    idempotencyKey: "summary-key",
  };
}

class MemoryQueue implements ProcessingJobStateRepository {
  jobs: QueuedProcessingJob[];
  transitions: Array<{ nextState: string; errorCode?: string; retryAt?: string }> = [];
  activations: Array<{ jobId: string; storagePath: string; checksum: string }> = [];
  events: string[] = [];
  recovered = 0;

  constructor(jobs: QueuedProcessingJob[] = [queuedJob()]) {
    this.jobs = jobs;
  }

  async enqueue() {
    this.events.push("enqueue");
    return this.jobs[0]!;
  }
  async activateQueuedTranscriptionArtifact(input: Parameters<ProcessingJobStateRepository["activateQueuedTranscriptionArtifact"]>[0]) {
    this.events.push("activate");
    this.activations.push(input);
  }
  async retry() { return this.jobs[0]!; }
  async claimReady(input: Parameters<ProcessingJobStateRepository["claimReady"]>[0]) {
    return this.jobs.filter((candidate) => candidate.lifecycleState === "queued" || candidate.lifecycleState === "retry_wait")
      .slice(0, input.limit).map((job, index) => Object.assign(job, {
        lifecycleState: "running" as const,
        state: "running" as const,
        leaseToken: `lease-${index + 1}`,
        leaseExpiresAt: "2026-07-10T10:05:00.000Z"
      }));
  }
  async recoverStale() {
    this.recovered += 1;
    return this.recovered;
  }
  async createQueued() { return this.jobs[0]!; }
  async requestCancellation() { return this.jobs[0]!; }
  async transition(input: Parameters<ProcessingJobStateRepository["transition"]>[0]) {
    const job = this.jobs.find((candidate) => candidate.id === input.jobId)!;
    this.transitions.push({
      nextState: input.nextState,
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
      ...(input.retryAt ? { retryAt: input.retryAt } : {})
    });
    job.lifecycleState = input.nextState;
    job.state = input.nextState === "failed_terminal" || input.nextState === "retry_wait" ? "failed" : "running";
    job.leaseToken = null;
    return job;
  }
  async complete(input: Parameters<ProcessingJobStateRepository["complete"]>[0]) {
    const job = this.jobs.find((candidate) => candidate.id === input.jobId)!;
    job.state = "completed";
    job.lifecycleState = "succeeded";
    job.result = input.result;
    job.leaseToken = null;
  }
  async findByIdempotencyKey() { return this.jobs[0] ?? null; }
  async find() { return null; }
  async findByLogicalInput() { return null; }
  async heartbeat() {}
  async saveTranscriptionManifest(): Promise<PersistedTranscriptionChunk[]> { return []; }
  async markTranscriptionChunkCompleted() {}
  async markTranscriptionChunkFailed() {}
  async getTranscriptionManifest() { return null; }
  async markProviderSubmitted() {}
  async recordProviderCall() {}
  async recordArtifact() {}
  async findArtifact() { return null; }
  async markArtifactReady() {}
  async supersedeArtifacts() { return []; }
  async markArtifactOrphaned() {}
  async claimCleanupArtifacts() { return []; }
  async completeArtifactCleanup() {}
  async releaseArtifactCleanup() {}
  async invalidateCompleted() {}
  async fail(input: Parameters<ProcessingJobStateRepository["fail"]>[0]) {
    const job = this.jobs.find((candidate) => candidate.id === input.jobId && candidate.leaseToken === input.leaseToken)!;
    const retryable = input.errorCode !== "SUMMARY_INPUT_INVALID" && job.attempt < job.maxAttempts;
    this.transitions.push({
      nextState: retryable ? "retry_wait" : "failed_terminal",
      errorCode: input.errorCode,
      ...(retryable ? { retryAt: "2026-07-10T10:00:30.000Z" } : {})
    });
    job.lifecycleState = retryable ? "retry_wait" : "failed_terminal";
    job.state = "failed";
    job.leaseToken = null;
  }
  async findStaleRunning() { return []; }
  async findStatus() { return null; }
  async begin(): Promise<ProcessingJobClaim> {
    return { disposition: "running", job: this.jobs[0]! };
  }
}

function depsFor(queue: MemoryQueue, summarize = vi.fn(async () => "Plan: hydrate.")): WorkerDependencies {
  return {
    tokenVerifier: { verifyIdToken: vi.fn() },
    doctors: {
      findByAuthUid: vi.fn(),
      findById: vi.fn(async () => doctor),
    },
    clinics: { findClinicById: vi.fn() },
    recordings: {
      findRecordingForDoctor: vi.fn(async () => recording),
      findLatestRecordingAudioPath: vi.fn(),
      markRecordingTranscribed: vi.fn(),
      markRecordingAudioUploaded: vi.fn(),
      markRecordingSummarized: vi.fn(async (input) => {
        await queue.complete({
          jobId: input.processingJobId!,
          leaseToken: input.processingLeaseToken!,
          result: { recording_id: recording.id, status: "summary_ready" },
        });
        return { ...recording, summary: input.summary, status: "summary_ready" as const };
      }),
      markRecordingPdfSaved: vi.fn(),
    },
    transcriptionClient: { transcribe: vi.fn() },
    summaryClient: { summarize },
    audioStorage: {
      uploadRecordingAudio: vi.fn(),
      downloadRecordingAudio: vi.fn(),
    },
    pdfRenderer: { render: vi.fn() },
    pdfStorage: {
      uploadRecordingPdf: vi.fn(),
      createSignedUrl: vi.fn(),
    },
    processingJobs: queue,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

describe("processing queue", () => {
  it("never admits without a worker and drains accepted operations after a flag is disabled", () => {
    expect(queueRollout(false, { summary: true })).toEqual({ admission: {
      transcription: false, summary: false, pdf: false
    }, drain: [] });
    expect(queueRollout(true, { summary: true })).toEqual({ admission: {
      transcription: false, summary: true, pdf: false
    }, drain: ["transcription", "summary", "pdf"] });
  });
  it("lets competing workers claim one queued job only once", async () => {
    const queue = new MemoryQueue();
    const summarize = vi.fn(async () => "Plan: hydrate.");
    const deps = depsFor(queue, summarize);

    await Promise.all([
      runProcessingQueueOnce(deps, { workerId: "worker-a", operations: ["summary"] }),
      runProcessingQueueOnce(deps, { workerId: "worker-b", operations: ["summary"] }),
    ]);

    expect(summarize).toHaveBeenCalledTimes(1);
    expect(queue.jobs[0]?.lifecycleState).toBe("succeeded");
  });

  it("returns the canonical queued job for duplicate enqueue attempts", async () => {
    const queue = new MemoryQueue();
    const deps = depsFor(queue);
    const auth = { doctor, token: { uid: doctor.firebase_uid } };

    await expect(enqueueSummaryProcessingJob(auth, {
      recordingId: recording.id,
      idempotencyKey: "summary-key",
    }, deps)).resolves.toMatchObject({
      job_id: "job-1",
      operation: "summary",
      state: "queued",
    });
  });

  it("replays a succeeded transcription enqueue instead of rejecting the transcribed recording", async () => {
    const audio = Buffer.from("stored audio");
    const job = { ...queuedJob(), operation: "transcription" as const, lifecycleState: "succeeded" as const,
      state: "completed" as const, inputHash: sha256(audio) };
    const queue = new MemoryQueue([job]);
    const deps = depsFor(queue);
    deps.recordings.findRecordingForDoctor = vi.fn(async () => ({ ...recording, status: "transcribed" as const }));
    deps.recordings.findLatestRecordingAudioPath = vi.fn(async () => recording.audio_storage_path);
    deps.audioStorage.downloadRecordingAudio = vi.fn(async () => ({
      audio, mimeType: "audio/webm", filename: "recording.webm", size: audio.length
    }));

    await expect(enqueueTranscriptionProcessingJob(
      { doctor, token: { uid: doctor.firebase_uid } },
      { recordingId: recording.id, idempotencyKey: job.idempotencyKey },
      deps,
    )).resolves.toMatchObject({ job_id: job.id, state: "succeeded" });
    expect(deps.audioStorage.uploadRecordingAudio).not.toHaveBeenCalled();
  });

  it("reserves the transcription job before upload and atomically activates its artifact", async () => {
    const audio = Buffer.from("new audio");
    const job = { ...queuedJob(), operation: "transcription" as const,
      inputHash: sha256(audio) };
    const queue = new MemoryQueue([job]);
    const deps = depsFor(queue);
    deps.recordings.findRecordingForDoctor = vi.fn(async () => ({ ...recording, status: "recorded" as const, transcript: null }));
    deps.recordings.findLatestRecordingAudioPath = vi.fn(async () => null);
    deps.audioStorage.recordingAudioPath = vi.fn(() => "clinic/doctor/reserved.webm");
    deps.audioStorage.uploadRecordingAudio = vi.fn(async () => {
      queue.events.push("upload");
      return "clinic/doctor/reserved.webm";
    });

    await enqueueTranscriptionProcessingJob(
      { doctor, token: { uid: doctor.firebase_uid } },
      { recordingId: recording.id, idempotencyKey: job.idempotencyKey,
        audio: { buffer: audio, size: audio.length, mimetype: "audio/webm", originalname: "recording.webm" } },
      deps,
    );

    expect(queue.events).toEqual(["enqueue", "upload", "activate"]);
    expect(queue.activations).toEqual([expect.objectContaining({
      jobId: job.id, storagePath: "clinic/doctor/reserved.webm", checksum: job.inputHash
    })]);
    expect(deps.recordings.markRecordingAudioUploaded).not.toHaveBeenCalled();
  });

  it("replays safely when activation commits before its response is lost", async () => {
    const audio = Buffer.from("new audio");
    const job = { ...queuedJob(), operation: "transcription" as const, inputHash: sha256(audio) };
    const queue = new MemoryQueue([job]);
    let activated = false;
    queue.activateQueuedTranscriptionArtifact = vi.fn(async () => {
      if (!activated) { activated = true; throw new Error("activation response lost"); }
    });
    const deps = depsFor(queue);
    deps.recordings.findRecordingForDoctor = vi.fn(async () => ({ ...recording, status: "recorded" as const,
      transcript: null, audio_storage_path: activated ? "clinic/doctor/reserved.webm" : null }));
    deps.recordings.findLatestRecordingAudioPath = vi.fn(async () => null);
    deps.audioStorage.recordingAudioPath = vi.fn(() => "clinic/doctor/reserved.webm");
    deps.audioStorage.uploadRecordingAudio = vi.fn(async () => "clinic/doctor/reserved.webm");
    deps.audioStorage.downloadRecordingAudio = vi.fn(async () => ({ audio, size: audio.length,
      filename: "recording.webm", mimeType: "audio/webm" }));
    deps.audioStorage.deleteRecordingAudio = vi.fn(async () => undefined);

    await expect(enqueueTranscriptionProcessingJob(
      { doctor, token: { uid: doctor.firebase_uid } },
      { recordingId: recording.id, idempotencyKey: job.idempotencyKey,
        audio: { buffer: audio, size: audio.length, mimetype: "audio/webm", originalname: "recording.webm" } },
      deps,
    )).rejects.toThrow("activation response lost");
    await expect(enqueueTranscriptionProcessingJob(
      { doctor, token: { uid: doctor.firebase_uid } },
      { recordingId: recording.id, idempotencyKey: job.idempotencyKey,
        audio: { buffer: audio, size: audio.length, mimetype: "audio/webm", originalname: "recording.webm" } }, deps
    )).resolves.toMatchObject({ job_id: job.id, state: "queued" });
    expect(deps.audioStorage.uploadRecordingAudio).toHaveBeenCalledTimes(1);
    expect(deps.audioStorage.deleteRecordingAudio).not.toHaveBeenCalled();
    expect(queue.activateQueuedTranscriptionArtifact).toHaveBeenCalledTimes(2);
  });

  it("rejects changed summary input before provider dispatch", async () => {
    const job = { ...queuedJob(), lifecycleState: "running" as const, state: "running" as const,
      leaseToken: "lease-1", inputHash: "0".repeat(64) };
    const queue = new MemoryQueue([job]);
    const summarize = vi.fn(async () => "must not run");
    const deps = depsFor(queue, summarize);

    await expect(runProcessingQueueOnce(deps, { workerId: "worker-a", operations: ["summary"] }))
      .resolves.toMatchObject({ claimed: false });
    await (await import("../processing-queue.js")).executeQueuedProcessingJob(deps, job);

    expect(summarize).not.toHaveBeenCalled();
    expect(queue.transitions).toEqual([expect.objectContaining({
      nextState: "failed_terminal", errorCode: "PROCESSING_INPUT_CHANGED"
    })]);
  });

  it("claims and executes the requested batch without abandoning leases", async () => {
    const jobs = [queuedJob("job-1"), queuedJob("job-2")];
    const queue = new MemoryQueue(jobs);
    const deps = depsFor(queue);

    await expect(runProcessingQueueOnce(deps, {
      workerId: "worker-a", operations: ["summary"], claimLimit: 2
    })).resolves.toMatchObject({ claimed: true, claimed_count: 2, succeeded: true });
    expect(deps.summaryClient.summarize).toHaveBeenCalledTimes(2);
    expect(jobs.every((job) => job.lifecycleState === "succeeded")).toBe(true);
  });

  it("aborts provider work at the configured deadline", async () => {
    vi.useFakeTimers();
    try {
      const provider = vi.fn((signal: AbortSignal) => new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }));
      const work = vi.fn((signal: AbortSignal) =>
        runWithProcessingDeadline(provider, 120_000, "PROVIDER_TIMEOUT", signal));
      const result = runWithProcessingDeadline(work, 50);
      const assertion = expect(result).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT", status: 504 });
      await vi.advanceTimersByTimeAsync(50);
      await assertion;
      expect(provider.mock.calls[0]?.[0].aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("schedules retry for retryable provider failures", async () => {
    const queue = new MemoryQueue();
    const deps = depsFor(queue, vi.fn(async () => {
      throw new HttpError(504, "Provider timeout.", "PROVIDER_TIMEOUT");
    }));

    await runProcessingQueueOnce(deps, { workerId: "worker-a", operations: ["summary"] });

    expect(queue.transitions).toEqual([expect.objectContaining({
      nextState: "retry_wait",
      errorCode: "PROVIDER_RETRYABLE",
      retryAt: expect.any(String),
    })]);
  });

  it("marks validation failures terminal", async () => {
    const queue = new MemoryQueue();
    const deps = depsFor(queue, vi.fn(async () => {
      throw new HttpError(400, "Bad prompt.", "SUMMARY_INPUT_INVALID");
    }));

    await runProcessingQueueOnce(deps, { workerId: "worker-a", operations: ["summary"] });

    expect(queue.transitions).toEqual([expect.objectContaining({
      nextState: "failed_terminal",
      errorCode: "SUMMARY_INPUT_INVALID",
    })]);
  });

  it("recovers stale leases before claiming more work", async () => {
    const queue = new MemoryQueue([]);
    const deps = depsFor(queue);

    await expect(runProcessingQueueOnce(deps, {
      workerId: "worker-a",
      operations: ["summary"],
    })).resolves.toMatchObject({ recovered: 1, claimed: false });
  });

  it("supervises transient queue errors and restores readiness", async () => {
    const queue = new MemoryQueue([]);
    const recover = vi.spyOn(queue, "recoverStale")
      .mockRejectedValueOnce(new Error("database unavailable")).mockResolvedValue(0);
    const deps = depsFor(queue);
    const worker = startProcessingQueueWorker(deps, {
      workerId: "worker-a", operations: ["summary"], pollMs: 1, batchSize: 1
    });
    await vi.waitFor(() => expect(recover.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(worker.isReady()).toBe(true);
    expect(deps.logger?.error).toHaveBeenCalledWith("processing_queue.loop_failed", expect.objectContaining({
      error_code: "INTERNAL_ERROR"
    }));
    await worker.stop();
    expect(worker.isReady()).toBe(false);
  });

  it("stays ready while a healthy claimed job runs longer than the idle readiness window", async () => {
    vi.useFakeTimers();
    let finish!: (summary: string) => void;
    try {
      const queue = new MemoryQueue();
      const summarize = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
      const worker = startProcessingQueueWorker(depsFor(queue, summarize), {
        workerId: "worker-a", operations: ["summary"], pollMs: 1, batchSize: 1,
        activeHealthMs: 61_000
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(summarize).toHaveBeenCalledOnce();
      expect(worker.isReady()).toBe(true);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(worker.isReady()).toBe(true);
      await vi.advanceTimersByTimeAsync(1_001);
      expect(worker.isReady()).toBe(false);
      finish("Plan: hydrate.");
      await vi.advanceTimersByTimeAsync(0);
      await worker.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("serializes heartbeats and aborts provider work on the first lease loss", async () => {
    vi.useFakeTimers();
    let rejectHeartbeat!: (error: Error) => void;
    try {
      const queue = new MemoryQueue();
      queue.heartbeat = vi.fn()
        .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectHeartbeat = reject; }))
        .mockResolvedValue(undefined);
      const work = vi.fn((signal: AbortSignal) => new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }));
      const result = withProcessingHeartbeat(queue, { jobId: "job-1", leaseToken: "lease-1" }, work);
      const settled = result.then(() => null, (error: unknown) => error);
      await vi.advanceTimersByTimeAsync(30_000);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(queue.heartbeat).toHaveBeenCalledOnce();
      rejectHeartbeat(new Error("lease lost"));
      await vi.advanceTimersByTimeAsync(0);
      await expect(settled).resolves.toMatchObject({ message: "lease lost" });
      expect(work.mock.calls[0]?.[0].aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
