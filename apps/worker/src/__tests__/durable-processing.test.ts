import { describe, expect, it, vi } from "vitest";
import type { Clinic, Doctor, Recording } from "@bharatdoc/shared";
import { HttpError } from "../http-errors.js";
import { generateRecordingPdf } from "../pdf-generation.js";
import { summarizeRecording } from "../summary.js";
import { MAX_TRANSCRIPTION_AUDIO_BYTES, transcribeRecording } from "../transcription.js";
import type {
  PersistedTranscriptionChunk, ProcessingJob, ProcessingJobRepository, RecordingProcessingRepository
} from "../types.js";

const doctor: Doctor = {
  id: "11111111-1111-4111-8111-111111111111", firebase_uid: "auth-1",
  clinic_id: "22222222-2222-4222-8222-222222222222", role: "doctor", account_status: "active",
  name: "Dr Test", specialization: "Medicine", phone: "+919999999999", profile_photo_path: null,
  custom_prompt: null, transcription_lang: "en", created_at: "2026-07-10T00:00:00.000Z"
};
const clinic: Clinic = {
  id: doctor.clinic_id!, name: "Test Clinic", clinic_code: "TEST01", address: null,
  logo_storage_path: null, created_at: "2026-07-10T00:00:00.000Z"
};
const baseRecording: Recording = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", doctor_id: doctor.id, clinic_id: clinic.id,
  patient_id: "P-1", label: null, duration_seconds: 60, audio_storage_path: null,
  transcript: "Original transcript", summary: null, pdf_storage_path: null,
  pdf_generated_at: null, pdf_version: null, status: "transcribed",
  recorded_at: "2026-07-10T00:00:00.000Z", created_at: "2026-07-10T00:00:00.000Z"
};

type InternalJob = ProcessingJob & {
  idempotencyKey: string; recordingId: string; doctorId: string;
};

class MemoryProcessingJobs implements ProcessingJobRepository {
  jobs: InternalJob[] = [];
  chunks = new Map<string, PersistedTranscriptionChunk[]>();
  artifacts = new Map<string, { jobId: string; kind: "audio" | "pdf"; checksum: string; state: "pending" | "current" | "superseded" | "orphaned" | "deleted" }>();
  providerCalls = 0;
  quotaCode: string | null = null;
  private sequence = 0;

  async begin(input: Parameters<ProcessingJobRepository["begin"]>[0]) {
    if (this.quotaCode) throw new HttpError(429, "quota", this.quotaCode);
    const keyed = this.jobs.find((job) => job.doctorId === input.doctorId && job.operation === input.operation && job.idempotencyKey === input.idempotencyKey);
    if (keyed && (keyed.inputHash !== input.inputHash || keyed.recordingId !== input.recordingId)) {
      throw new HttpError(409, "conflict", "IDEMPOTENCY_KEY_REUSED");
    }
    const job = keyed ?? this.jobs.find((item) => item.recordingId === input.recordingId && item.operation === input.operation && item.inputHash === input.inputHash);
    if (job?.state === "completed") return { disposition: "completed" as const, job: { ...job, leaseToken: null } };
    if (job?.state === "running") return { disposition: "running" as const, job: { ...job, leaseToken: null } };
    if (job) {
      job.state = "running";
      job.attempt += 1;
      job.leaseToken = `lease-${job.attempt}`;
      return { disposition: "acquired" as const, job: { ...job } };
    }
    const created: InternalJob = {
      id: `job-${++this.sequence}`, operation: input.operation, state: "running",
      leaseToken: "lease-1", attempt: 1, result: null, inputHash: input.inputHash,
      createdAt: "2026-07-10T00:00:00.000Z",
      idempotencyKey: input.idempotencyKey, recordingId: input.recordingId, doctorId: input.doctorId
    };
    this.jobs.push(created);
    return { disposition: "acquired" as const, job: { ...created } };
  }
  async find(jobId: string) { return this.jobs.find((job) => job.id === jobId) ?? null; }
  async findByIdempotencyKey(input: Parameters<ProcessingJobRepository["findByIdempotencyKey"]>[0]) {
    return this.jobs.find((job) => job.operation === input.operation && job.doctorId === input.doctorId && job.idempotencyKey === input.idempotencyKey) ?? null;
  }
  async findByLogicalInput(input: Parameters<ProcessingJobRepository["findByLogicalInput"]>[0]) {
    return this.jobs.find((job) => job.operation === input.operation && job.recordingId === input.recordingId && (!input.inputHash || job.inputHash === input.inputHash)) ?? null;
  }
  async heartbeat() {}
  async saveTranscriptionManifest(input: Parameters<ProcessingJobRepository["saveTranscriptionManifest"]>[0]) {
    const existing = this.chunks.get(input.jobId);
    if (existing) return existing;
    const chunks: PersistedTranscriptionChunk[] = input.chunks.map((chunk) => ({
      ...chunk, state: "pending", transcript: null
    }));
    this.chunks.set(input.jobId, chunks);
    return chunks;
  }
  async markProviderSubmitted(input: Parameters<ProcessingJobRepository["markProviderSubmitted"]>[0]) {
    if (input.chunkIndex !== undefined) this.chunks.get(input.jobId)![input.chunkIndex]!.state = "provider_submitted";
  }
  async markTranscriptionChunkCompleted(input: Parameters<ProcessingJobRepository["markTranscriptionChunkCompleted"]>[0]) {
    Object.assign(this.chunks.get(input.jobId)![input.index]!, { state: "completed", transcript: input.transcript });
  }
  async recordProviderCall() { this.providerCalls += 1; }
  async recordArtifact(input: Parameters<ProcessingJobRepository["recordArtifact"]>[0]) {
    this.artifacts.set(input.storagePath, { jobId: input.jobId, kind: input.kind, checksum: input.checksum, state: input.state ?? "pending" });
  }
  async findArtifact(input: Parameters<ProcessingJobRepository["findArtifact"]>[0]) {
    const match = [...this.artifacts.entries()].find(([, artifact]) => artifact.jobId === input.jobId && artifact.kind === input.kind && artifact.checksum === input.checksum);
    return match ? { storagePath: match[0], state: match[1].state } : null;
  }
  async markArtifactReady(input: Parameters<ProcessingJobRepository["markArtifactReady"]>[0]) {
    this.artifacts.get(input.storagePath)!.state = "current";
  }
  async supersedeArtifacts(input: Parameters<ProcessingJobRepository["supersedeArtifacts"]>[0]) {
    const paths: string[] = [];
    for (const [path, artifact] of this.artifacts) {
      const job = this.jobs.find((item) => item.id === artifact.jobId);
      if (job?.recordingId === input.recordingId && artifact.kind === input.kind && artifact.state === "current" && path !== input.keepStoragePath) {
        artifact.state = "superseded";
        paths.push(path);
      }
    }
    return paths;
  }
  async markArtifactOrphaned(path: string) { this.artifacts.get(path)!.state = "orphaned"; }
  async claimCleanupArtifacts(input: { limit: number; kinds: Array<"audio" | "pdf"> }) {
    return [...this.artifacts.entries()]
      .filter(([, artifact]) => input.kinds.includes(artifact.kind) && (artifact.state === "superseded" || artifact.state === "orphaned"))
      .slice(0, input.limit).map(([storagePath, artifact]) => ({ kind: artifact.kind, storagePath, cleanupToken: `cleanup-${storagePath}` }));
  }
  async completeArtifactCleanup(input: { storagePath: string }) { this.artifacts.get(input.storagePath)!.state = "deleted"; }
  async releaseArtifactCleanup() {}
  async invalidateCompleted(input: Parameters<ProcessingJobRepository["invalidateCompleted"]>[0]) {
    const job = this.jobs.find((item) => item.id === input.jobId && item.inputHash === input.inputHash)!;
    if (job.state === "completed") job.state = "failed";
  }
  async complete(input: Parameters<ProcessingJobRepository["complete"]>[0]) {
    Object.assign(this.jobs.find((job) => job.id === input.jobId)!, { state: "completed", leaseToken: null, result: input.result });
  }
  async fail(input: Parameters<ProcessingJobRepository["fail"]>[0]) {
    Object.assign(this.jobs.find((job) => job.id === input.jobId)!, { state: "failed", leaseToken: null });
  }
}

function mutableRecordings(initial: Recording, jobs?: MemoryProcessingJobs) {
  let current = { ...initial };
  const repository: RecordingProcessingRepository = {
    findRecordingForDoctor: vi.fn(async () => ({ ...current })),
    findLatestRecordingAudioPath: vi.fn(async () => current.audio_storage_path),
    markRecordingAudioUploaded: vi.fn(async (input) => (current = { ...current, audio_storage_path: input.audioStoragePath })),
    markRecordingTranscribed: vi.fn(async (input) => {
      current = {
        ...current, audio_storage_path: input.audioStoragePath, transcript: input.transcript, status: "transcribed",
        summary: null, pdf_storage_path: null, pdf_generated_at: null, pdf_version: null
      };
      if (jobs && input.processingJobId && input.processingLeaseToken) await jobs.complete({
        jobId: input.processingJobId, leaseToken: input.processingLeaseToken,
        result: { recording_id: current.id, status: "transcribed", audio_storage_path: input.audioStoragePath }
      });
      return current;
    }),
    markRecordingSummarized: vi.fn(async (input) => {
      if (input.expectedTranscript !== undefined && current.transcript !== input.expectedTranscript) throw new HttpError(409, "changed", "PROCESSING_INPUT_CHANGED");
      current = { ...current, summary: input.summary, status: "summary_ready", pdf_storage_path: null, pdf_generated_at: null, pdf_version: null };
      if (jobs && input.processingJobId && input.processingLeaseToken) await jobs.complete({
        jobId: input.processingJobId, leaseToken: input.processingLeaseToken,
        result: { recording_id: current.id, status: "summary_ready" }
      });
      return current;
    }),
    markRecordingPdfSaved: vi.fn(async (input) => {
      if (input.expectedSummary !== undefined && current.summary !== input.expectedSummary) throw new HttpError(409, "changed", "PROCESSING_INPUT_CHANGED");
      current = { ...current, pdf_storage_path: input.pdfStoragePath, pdf_generated_at: input.pdfGeneratedAt, pdf_version: input.pdfVersion, status: "pdf_saved" };
      if (jobs && input.processingJobId && input.processingLeaseToken) await jobs.complete({
        jobId: input.processingJobId, leaseToken: input.processingLeaseToken,
        result: {
          recording_id: current.id, status: "pdf_saved", pdf_storage_path: input.pdfStoragePath,
          pdf_generated_at: input.pdfGeneratedAt, pdf_version: input.pdfVersion
        }
      });
      return current;
    })
  };
  return { repository, get: () => current, set: (value: Recording) => { current = value; } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("durable AI workflows", () => {
  it("deduplicates two workers and replays a completed summary without another provider call", async () => {
    const jobs = new MemoryProcessingJobs();
    const recordings = mutableRecordings(baseRecording, jobs);
    const pending = deferred<string>();
    const summarize = vi.fn(() => pending.promise);
    const deps = { recordings: recordings.repository, summaryClient: { summarize }, processingJobs: jobs };
    const auth = { doctor, token: { uid: doctor.firebase_uid } };
    const first = summarizeRecording(auth, { recordingId: baseRecording.id, idempotencyKey: "worker-a" }, deps);
    await vi.waitFor(() => expect(summarize).toHaveBeenCalledOnce());
    const second = summarizeRecording(auth, { recordingId: baseRecording.id, idempotencyKey: "worker-b" }, deps);
    pending.resolve("Chief Complaint: Fever");
    const [a, b] = await Promise.all([first, second]);

    expect(a).toEqual(b);
    expect(summarize).toHaveBeenCalledOnce();
    await expect(summarizeRecording(auth, { recordingId: baseRecording.id, idempotencyKey: "worker-a" }, deps)).resolves.toEqual(a);
    expect(summarize).toHaveBeenCalledOnce();
  });

  it("rejects key reuse for changed input and enforces quotas before provider work", async () => {
    const jobs = new MemoryProcessingJobs();
    const recordings = mutableRecordings(baseRecording, jobs);
    const summarize = vi.fn(async () => "First summary");
    const deps = { recordings: recordings.repository, summaryClient: { summarize }, processingJobs: jobs };
    const auth = { doctor, token: { uid: doctor.firebase_uid } };
    await summarizeRecording(auth, { recordingId: baseRecording.id, idempotencyKey: "same-key" }, deps);
    recordings.set({ ...recordings.get(), transcript: "Changed transcript", summary: null, status: "transcribed" });
    await expect(summarizeRecording(auth, { recordingId: baseRecording.id, idempotencyKey: "same-key" }, deps))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });

    const quotaJobs = new MemoryProcessingJobs();
    quotaJobs.quotaCode = "QUOTA_DOCTOR_SUMMARY";
    const quotaProvider = vi.fn(async () => "never");
    await expect(summarizeRecording(auth, { recordingId: baseRecording.id }, {
      recordings: mutableRecordings(baseRecording, quotaJobs).repository, summaryClient: { summarize: quotaProvider }, processingJobs: quotaJobs
    })).rejects.toMatchObject({ status: 429, code: "QUOTA_DOCTOR_SUMMARY" });
    expect(quotaProvider).not.toHaveBeenCalled();
  });

  it("resumes only the missing transcription chunk after a failed worker attempt", async () => {
    const jobs = new MemoryProcessingJobs();
    const audio = Buffer.alloc(MAX_TRANSCRIPTION_AUDIO_BYTES + 1, 1);
    const recordings = mutableRecordings({ ...baseRecording, status: "recorded", transcript: null, duration_seconds: 60 }, jobs);
    const transcribe = vi.fn()
      .mockResolvedValueOnce("first")
      .mockRejectedValueOnce(new Error("worker crashed"))
      .mockResolvedValueOnce("second");
    const storage = {
      recordingAudioPath: () => "clinic/doctor/audio.webm",
      uploadRecordingAudio: vi.fn(async () => "clinic/doctor/audio.webm"),
      downloadRecordingAudio: vi.fn(async () => ({ audio, mimeType: "audio/webm", filename: "audio.webm", size: audio.byteLength }))
    };
    const deps = { recordings: recordings.repository, audioStorage: storage, transcriptionClient: { transcribe }, processingJobs: jobs };
    const auth = { doctor, token: { uid: doctor.firebase_uid } };
    const input = { recordingId: baseRecording.id, idempotencyKey: "audio-key", audio: { buffer: audio, size: audio.byteLength, mimetype: "audio/webm", originalname: "audio.webm" } };
    await expect(transcribeRecording(auth, input, deps)).rejects.toThrow("worker crashed");
    await expect(transcribeRecording(auth, input, deps)).resolves.toMatchObject({ transcript: "first\n\nsecond" });
    expect(storage.uploadRecordingAudio).toHaveBeenCalledOnce();
    expect(transcribe).toHaveBeenCalledTimes(3);
  });

  it("recovers a failed manifest RPC from the already-uploaded canonical audio", async () => {
    const jobs = new MemoryProcessingJobs();
    const audio = Buffer.from("production retry audio");
    const recordings = mutableRecordings({
      ...baseRecording, status: "recorded", transcript: null, duration_seconds: 60
    }, jobs);
    vi.spyOn(jobs, "saveTranscriptionManifest").mockRejectedValueOnce(
      Object.assign(new Error('column reference "item" is ambiguous'), { code: "42702" }),
    );
    const storage = {
      recordingAudioPath: () => "clinic/doctor/recovery.webm",
      uploadRecordingAudio: vi.fn(async () => "clinic/doctor/recovery.webm"),
      downloadRecordingAudio: vi.fn(async () => ({
        audio, mimeType: "audio/webm", filename: "recovery.webm", size: audio.byteLength
      }))
    };
    const transcribe = vi.fn(async () => "Recovered transcript");
    const deps = {
      recordings: recordings.repository, audioStorage: storage,
      transcriptionClient: { transcribe }, processingJobs: jobs
    };
    const auth = { doctor, token: { uid: doctor.firebase_uid } };
    const input = {
      recordingId: baseRecording.id, idempotencyKey: "recovery-key",
      audio: { buffer: audio, size: audio.byteLength, mimetype: "audio/webm", originalname: "recovery.webm" }
    };

    await expect(transcribeRecording(auth, input, deps)).rejects.toMatchObject({ code: "42702" });
    expect(recordings.get()).toMatchObject({ status: "recorded", audio_storage_path: "clinic/doctor/recovery.webm" });
    expect(jobs.jobs[0]).toMatchObject({ state: "failed", attempt: 1 });
    await expect(transcribeRecording(auth, input, deps)).resolves.toMatchObject({ transcript: "Recovered transcript" });
    expect(jobs.jobs[0]).toMatchObject({ state: "completed", attempt: 2 });
    expect(storage.uploadRecordingAudio).toHaveBeenCalledOnce();
    expect(transcribe).toHaveBeenCalledOnce();
  });

  it("replays a PDF with a fresh signed URL but no second render or upload", async () => {
    const jobs = new MemoryProcessingJobs();
    const recordings = mutableRecordings({ ...baseRecording, summary: "Summary", status: "summary_ready" }, jobs);
    const pdf = Buffer.from("%PDF-1.4");
    const renderer = { render: vi.fn(async () => pdf) };
    let signs = 0;
    const storage = {
      recordingPdfPath: () => "clinic/doctor/result.pdf",
      uploadRecordingPdf: vi.fn(async () => "clinic/doctor/result.pdf"),
      downloadRecordingPdf: vi.fn(async () => pdf),
      createSignedUrl: vi.fn(async () => `https://signed/${++signs}`)
    };
    const deps = {
      recordings: recordings.repository, clinics: { findClinicById: vi.fn(async () => clinic) },
      pdfRenderer: renderer, pdfStorage: storage, processingJobs: jobs
    };
    const auth = { doctor, token: { uid: doctor.firebase_uid } };
    const first = await generateRecordingPdf(auth, { recordingId: baseRecording.id }, deps);
    const replay = await generateRecordingPdf(auth, { recordingId: baseRecording.id }, deps);
    expect(first.signed_url).not.toBe(replay.signed_url);
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(storage.uploadRecordingPdf).toHaveBeenCalledOnce();
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(2);
    expect(jobs.jobs[0]!.result).not.toHaveProperty("signed_url");
  });

  it("replays a concurrently completed PDF without invalidating it from a stale recording snapshot", async () => {
    const jobs = new MemoryProcessingJobs();
    const invalidateCompleted = vi.spyOn(jobs, "invalidateCompleted");
    const recordings = mutableRecordings({ ...baseRecording, summary: "Summary", status: "summary_ready" }, jobs);
    const pending = deferred<Buffer>();
    const pdf = Buffer.from("%PDF-1.4");
    const renderer = { render: vi.fn(() => pending.promise) };
    let signs = 0;
    const storage = {
      recordingPdfPath: () => "clinic/doctor/concurrent.pdf",
      uploadRecordingPdf: vi.fn(async () => "clinic/doctor/concurrent.pdf"),
      downloadRecordingPdf: vi.fn(async () => pdf),
      createSignedUrl: vi.fn(async () => `https://signed/concurrent/${++signs}`)
    };
    const deps = {
      recordings: recordings.repository, clinics: { findClinicById: vi.fn(async () => clinic) },
      pdfRenderer: renderer, pdfStorage: storage, processingJobs: jobs
    };
    const auth = { doctor, token: { uid: doctor.firebase_uid } };

    const leader = generateRecordingPdf(auth, { recordingId: baseRecording.id }, deps);
    await vi.waitFor(() => expect(renderer.render).toHaveBeenCalledOnce());
    const waiter = generateRecordingPdf(auth, { recordingId: baseRecording.id }, deps);
    await vi.waitFor(() => expect(recordings.repository.findRecordingForDoctor).toHaveBeenCalledTimes(2));
    pending.resolve(pdf);

    const [first, second] = await Promise.all([leader, waiter]);
    expect({ ...second, signed_url: first.signed_url }).toEqual(first);
    expect(second.signed_url).not.toBe(first.signed_url);
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(storage.uploadRecordingPdf).toHaveBeenCalledOnce();
    expect(jobs.providerCalls).toBe(1);
    expect(invalidateCompleted).not.toHaveBeenCalled();
    expect(jobs.jobs[0]).toMatchObject({ state: "completed", attempt: 1 });
  });

  it("does not orphan a canonical artifact when artifact registration rejects the attempt", async () => {
    const jobs = new MemoryProcessingJobs();
    const path = "clinic/doctor/owned-by-canonical-job.pdf";
    jobs.artifacts.set(path, {
      jobId: "canonical-job", kind: "pdf", checksum: "canonical-checksum", state: "current"
    });
    vi.spyOn(jobs, "recordArtifact").mockRejectedValueOnce(
      new HttpError(409, "conflict", "PROCESSING_ARTIFACT_CONFLICT")
    );
    const markArtifactOrphaned = vi.spyOn(jobs, "markArtifactOrphaned");
    const recordings = mutableRecordings({ ...baseRecording, summary: "Summary", status: "summary_ready" }, jobs);
    const deleteRecordingPdf = vi.fn(async () => undefined);
    const uploadRecordingPdf = vi.fn(async () => path);
    const deps = {
      recordings: recordings.repository, clinics: { findClinicById: vi.fn(async () => clinic) },
      pdfRenderer: { render: vi.fn(async () => Buffer.from("%PDF-1.4")) },
      pdfStorage: {
        recordingPdfPath: () => path,
        uploadRecordingPdf,
        createSignedUrl: vi.fn(async () => "https://signed/conflict"),
        deleteRecordingPdf
      },
      processingJobs: jobs
    };

    await expect(generateRecordingPdf(
      { doctor, token: { uid: doctor.firebase_uid } }, { recordingId: baseRecording.id }, deps
    )).rejects.toMatchObject({ code: "PROCESSING_ARTIFACT_CONFLICT" });
    expect(markArtifactOrphaned).not.toHaveBeenCalled();
    expect(jobs.artifacts.get(path)?.state).toBe("current");
    expect(uploadRecordingPdf).not.toHaveBeenCalled();
    expect(deleteRecordingPdf).not.toHaveBeenCalled();
  });

  it("reuses the durable job timestamp when PDF rendering resumes after failure", async () => {
    const jobs = new MemoryProcessingJobs();
    const recordings = mutableRecordings({ ...baseRecording, summary: "Summary", status: "summary_ready" }, jobs);
    const generatedAt: string[] = [];
    const renderer = {
      render: vi.fn(async (input: { generatedAt: Date }) => {
        generatedAt.push(input.generatedAt.toISOString());
        if (generatedAt.length === 1) throw new Error("worker restarted");
        return Buffer.from("%PDF-1.4");
      })
    };
    const storage = {
      recordingPdfPath: () => "clinic/doctor/stable.pdf",
      uploadRecordingPdf: vi.fn(async () => "clinic/doctor/stable.pdf"),
      createSignedUrl: vi.fn(async () => "https://signed/stable")
    };
    const deps = {
      recordings: recordings.repository, clinics: { findClinicById: vi.fn(async () => clinic) },
      pdfRenderer: renderer, pdfStorage: storage, processingJobs: jobs
    };
    const auth = { doctor, token: { uid: doctor.firebase_uid } };

    await expect(generateRecordingPdf(auth, { recordingId: baseRecording.id }, deps)).rejects.toThrow("worker restarted");
    await expect(generateRecordingPdf(auth, { recordingId: baseRecording.id }, deps)).resolves.toMatchObject({
      pdf_storage_path: "clinic/doctor/stable.pdf"
    });
    expect(generatedAt).toEqual([jobs.jobs[0]!.createdAt, jobs.jobs[0]!.createdAt]);
    expect(storage.uploadRecordingPdf).toHaveBeenCalledOnce();
  });

  it("keeps the canonical PDF when signing fails after atomic publication", async () => {
    const jobs = new MemoryProcessingJobs();
    const recordings = mutableRecordings({ ...baseRecording, summary: "Summary", status: "summary_ready" }, jobs);
    const pdf = Buffer.from("%PDF-1.4");
    const storage = {
      recordingPdfPath: () => "clinic/doctor/canonical.pdf",
      uploadRecordingPdf: vi.fn(async () => "clinic/doctor/canonical.pdf"),
      downloadRecordingPdf: vi.fn(async () => pdf),
      deleteRecordingPdf: vi.fn(async () => undefined),
      createSignedUrl: vi.fn().mockRejectedValueOnce(new Error("signing unavailable")).mockResolvedValueOnce("https://signed/retry")
    };
    const renderer = { render: vi.fn(async () => pdf) };
    const deps = {
      recordings: recordings.repository, clinics: { findClinicById: vi.fn(async () => clinic) },
      pdfRenderer: renderer, pdfStorage: storage, processingJobs: jobs
    };
    const auth = { doctor, token: { uid: doctor.firebase_uid } };

    await expect(generateRecordingPdf(auth, { recordingId: baseRecording.id }, deps)).rejects.toThrow("signing unavailable");
    expect(recordings.get().pdf_storage_path).toBe("clinic/doctor/canonical.pdf");
    expect(jobs.jobs[0]!.state).toBe("completed");
    expect(storage.deleteRecordingPdf).not.toHaveBeenCalled();
    await expect(generateRecordingPdf(auth, { recordingId: baseRecording.id }, deps)).resolves.toMatchObject({
      signed_url: "https://signed/retry"
    });
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(storage.uploadRecordingPdf).toHaveBeenCalledOnce();
  });
});
