import { describe, expect, it, vi } from "vitest";
import type { Recording } from "@bharatdoc/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createProcessingJobRepository,
  createRecordingProcessingRepository,
  createSupabaseAudioStorage,
  createTranscriptionAttemptRepository,
  createTranscriptionSessionRepository,
} from "../repositories.js";

describe("createTranscriptionSessionRepository", () => {
  it("finalizes through the scoped RPC and parses only the canonical safe DTO", async () => {
    const data = {
      recording_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      session_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "transcribed", transcript_hash: "a".repeat(64), generation: 1,
      finalized_at: "2026-07-14T00:00:00.000000+00:00"
    };
    const rpc = vi.fn(async () => ({ data, error: null }));
    const repository = createTranscriptionSessionRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.finalize({ sessionId: data.session_id, doctorId: "doctor-1",
      clinicId: "clinic-1", idempotencyKey: "finalize-1" })).resolves.toEqual(data);
    expect(rpc).toHaveBeenCalledWith("finalize_transcription_session", {
      p_session_id: data.session_id, p_doctor_id: "doctor-1", p_clinic_id: "clinic-1",
      p_idempotency_key: "finalize-1"
    });
  });

  it.each([
    ["TRANSCRIPTION_SESSION_INVALID", 400],
    ["TRANSCRIPTION_SESSION_NOT_FOUND", 404],
    ["QUOTA_DOCTOR_TRANSCRIPTION", 429],
    ["TRANSCRIPTION_FINALIZATION_IMMUTABLE", 409]
  ])("maps plain PostgREST %s errors to safe HTTP errors", async (message, status) => {
    const rpc = vi.fn(async () => ({ data: null, error: {
      message, code: "P0001", details: "patient transcript must never leak", hint: "private storage path"
    } }));
    const repository = createTranscriptionSessionRepository({ rpc } as unknown as SupabaseClient);
    await expect(repository.finalize({ sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      doctorId: "doctor-1", clinicId: "clinic-1", idempotencyKey: "finalize-2" }))
      .rejects.toMatchObject({ status, code: message });
  });

  it("maps unknown PostgREST errors to a generic internal error", async () => {
    const error = { message: "UNRECOGNIZED_DATABASE_FAILURE", code: "XX000", details: "private" };
    const repository = createTranscriptionSessionRepository({
      rpc: vi.fn(async () => ({ data: null, error }))
    } as unknown as SupabaseClient);
    await expect(repository.finalize({ sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      doctorId: "doctor-1", clinicId: "clinic-1", idempotencyKey: "finalize-2" }))
      .rejects.toMatchObject({ status: 500, code: "INTERNAL_ERROR", message: "Internal server error." });
  });

  it("preserves native Error mapping and safely ignores hostile message shapes", async () => {
    const input = { sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      doctorId: "doctor-1", clinicId: "clinic-1", idempotencyKey: "finalize-2" };
    const nativeRepository = createTranscriptionSessionRepository({ rpc: vi.fn(async () => ({
      data: null, error: new Error("TRANSCRIPTION_FINALIZATION_IMMUTABLE")
    })) } as unknown as SupabaseClient);
    await expect(nativeRepository.finalize(input)).rejects.toMatchObject({
      status: 409, code: "TRANSCRIPTION_FINALIZATION_IMMUTABLE"
    });

    const inherited = Object.create({ message: "TRANSCRIPTION_FINALIZATION_IMMUTABLE" }) as object;
    const getter = Object.defineProperty({}, "message", { get() { throw new Error("accessed getter"); } });
    const hostile = [
      { message: null }, { message: 7 }, { message: [] }, { message: {} },
      { message: "TRANSCRIPTION_FINALIZATION_IMMUTABLE".padEnd(513, "x") },
      { toString() { throw new Error("called toString"); } }, inherited, getter,
      Object.defineProperty(new Error(), "message", { get() { throw new Error("error getter"); } }),
      new Error("TRANSCRIPTION_FINALIZATION_IMMUTABLE".padEnd(513, "x")),
      new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("proxy trap"); } })
    ];
    for (const error of hostile) {
      const repository = createTranscriptionSessionRepository({
        rpc: vi.fn(async () => ({ data: null, error }))
      } as unknown as SupabaseClient);
      let caught: unknown;
      try { await repository.finalize(input); } catch (candidate) { caught = candidate; }
      expect(caught).toMatchObject({ status: 500, code: "INTERNAL_ERROR", message: "Internal server error." });
    }
  });

  it("maps safe primitive strings without stringifying arbitrary values", async () => {
    const input = { sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      doctorId: "doctor-1", clinicId: "clinic-1", idempotencyKey: "finalize-2" };
    for (const [error, expected] of [
      ["TRANSCRIPTION_SESSION_NOT_FOUND", { status: 404, code: "TRANSCRIPTION_SESSION_NOT_FOUND" }],
      ["unknown database failure", { status: 500, code: "INTERNAL_ERROR" }]
    ] as const) {
      const repository = createTranscriptionSessionRepository({
        rpc: vi.fn(async () => ({ data: null, error }))
      } as unknown as SupabaseClient);
      await expect(repository.finalize(input)).rejects.toMatchObject(expected);
    }
  });
});

const transcribedRecording: Recording = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  doctor_id: "11111111-1111-4111-8111-111111111111",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  patient_id: "P-10483",
  label: "Follow-up",
  duration_seconds: 24,
  audio_storage_path: "clinic/doctor/new.webm",
  transcript: "Updated transcript.",
  summary: null,
  pdf_storage_path: null,
  pdf_generated_at: null,
  pdf_version: null,
  status: "transcribed",
  recorded_at: "2026-04-23T06:20:00.000Z",
  created_at: "2026-04-23T06:20:01.000Z",
};

function supabaseFor(result: { data: Recording | null; error: Error | null }) {
  const query: {
    update: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  } = {
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
  };

  return {
    query,
    supabase: {
      from: vi.fn(() => query),
    } as unknown as SupabaseClient,
  };
}

function supabaseForInsert(result: { error: Error | null }) {
  const query = {
    insert: vi.fn(async () => result),
  };

  return {
    query,
    supabase: {
      from: vi.fn(() => query),
    } as unknown as SupabaseClient,
  };
}

function supabaseForStorage(result: { error: Error | null }) {
  const bucket = {
    upload: vi.fn(async () => result),
    download: vi.fn(async () => ({
      data: new Blob([Buffer.from("stored audio")], { type: "audio/wav" }),
      error: null,
    })),
  };

  return {
    bucket,
    supabase: {
      storage: {
        from: vi.fn(() => bucket),
      },
    } as unknown as SupabaseClient,
  };
}

describe("createRecordingProcessingRepository", () => {
  it("marks only recorded rows transcribed and clears stale derived artifacts", async () => {
    const { supabase, query } = supabaseFor({
      data: transcribedRecording,
      error: null,
    });
    const repository = createRecordingProcessingRepository(supabase);

    await expect(
      repository.markRecordingTranscribed({
        recordingId: transcribedRecording.id,
        doctorId: transcribedRecording.doctor_id,
        transcript: "Updated transcript.",
        audioStoragePath: "clinic/doctor/new.webm",
      }),
    ).resolves.toEqual(transcribedRecording);

    expect(supabase.from).toHaveBeenCalledWith("recordings");
    expect(query.update).toHaveBeenCalledWith({
      audio_storage_path: "clinic/doctor/new.webm",
      transcript: "Updated transcript.",
      summary: null,
      pdf_storage_path: null,
      pdf_generated_at: null,
      pdf_version: null,
      status: "transcribed",
    });
    expect(query.eq).toHaveBeenNthCalledWith(1, "id", transcribedRecording.id);
    expect(query.eq).toHaveBeenNthCalledWith(
      2,
      "doctor_id",
      transcribedRecording.doctor_id,
    );
    expect(query.eq).toHaveBeenNthCalledWith(3, "status", "recorded");
  });

  it("rejects stale transcribe writes when the row is no longer recorded", async () => {
    const { supabase } = supabaseFor({ data: null, error: null });
    const repository = createRecordingProcessingRepository(supabase);

    await expect(
      repository.markRecordingTranscribed({
        recordingId: transcribedRecording.id,
        doctorId: transcribedRecording.doctor_id,
        transcript: "Updated transcript.",
        audioStoragePath: "clinic/doctor/new.webm",
      }),
    ).rejects.toMatchObject({ code: "RECORDING_NOT_TRANSCRIBABLE" });
  });
});

describe("createProcessingJobRepository", () => {
  const durableJobRow = {
    id: "job-1",
    operation: "summary",
    state: "failed",
    job_state: "retry_wait",
    lease_token: null,
    lease_expires_at: null,
    attempt: 1,
    max_attempts: 3,
    result: null,
    input_hash: "a".repeat(64),
    scheduled_at: "2026-07-10T10:00:00.000Z",
    started_at: "2026-07-10T10:00:01.000Z",
    heartbeat_at: "2026-07-10T10:00:02.000Z",
    next_retry_at: "2026-07-10T10:05:00.000Z",
    completed_at: null,
    terminal_error_code: "PROVIDER_RETRYABLE",
    terminal_error_message: "Retry scheduled.",
    output_reference: null,
    state_version: 2,
    is_stale: false,
    created_at: "2026-07-10T09:59:00.000Z",
  };

  it("maps durable claim timestamps and scopes artifact readiness to the live lease", async () => {
    const rpc = vi.fn(async (name: string) => name === "claim_recording_processing_job"
      ? {
          data: [{
            disposition: "acquired", id: "job-1", operation: "pdf", state: "running",
            lease_token: "lease-1", attempt: 1, result: null, input_hash: "a".repeat(64),
            created_at: "2026-07-10T10:00:00.000Z"
          }],
          error: null
        }
      : { data: null, error: null });
    const repository = createProcessingJobRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.begin({
      operation: "pdf", idempotencyKey: "pdf-key", inputHash: "a".repeat(64),
      recordingId: "recording", doctorId: "doctor", clinicId: "clinic",
      transcriptionSeconds: 0, storageBytes: 1024
    })).resolves.toMatchObject({
      disposition: "acquired",
      job: { id: "job-1", createdAt: "2026-07-10T10:00:00.000Z" }
    });
    await repository.markArtifactReady({ jobId: "job-1", leaseToken: "lease-1", storagePath: "pdf/path" });

    expect(rpc).toHaveBeenLastCalledWith("mark_processing_artifact_ready", {
      p_job_id: "job-1", p_lease_token: "lease-1", p_storage_path: "pdf/path"
    });
  });

  it("performs compare-and-set lifecycle transitions through the durable RPC", async () => {
    const rpc = vi.fn(async () => ({ data: [durableJobRow], error: null }));
    const repository = createProcessingJobRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.transition({
      jobId: "job-1",
      expectedState: "running",
      nextState: "retry_wait",
      expectedVersion: 1,
      leaseToken: "lease-1",
      retryAt: "2026-07-10T10:05:00.000Z",
      errorCode: "PROVIDER_RETRYABLE",
    })).resolves.toMatchObject({
      id: "job-1",
      lifecycleState: "retry_wait",
      maxAttempts: 3,
      stateVersion: 2,
    });
    expect(rpc).toHaveBeenCalledWith("transition_recording_processing_job", {
      p_job_id: "job-1",
      p_expected_state: "running",
      p_next_state: "retry_wait",
      p_expected_version: 1,
      p_lease_token: "lease-1",
      p_lease_owner: null,
      p_retry_at: "2026-07-10T10:05:00.000Z",
      p_error_code: "PROVIDER_RETRYABLE",
      p_output_reference: null,
    });
  });

  it("creates an idempotent queued lifecycle job through the controller RPC", async () => {
    const rpc = vi.fn(async () => ({ data: [{ ...durableJobRow, job_state: "queued", state_version: 0 }], error: null }));
    const repository = createProcessingJobRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.createQueued({
      operation: "transcription", idempotencyKey: "request-1", inputHash: "a".repeat(64),
      recordingId: "recording-1", doctorId: "doctor-1", clinicId: "clinic-1"
    })).resolves.toMatchObject({ lifecycleState: "queued", stateVersion: 0 });
    expect(rpc).toHaveBeenCalledWith("create_recording_processing_job", {
      p_operation: "transcription", p_idempotency_key: "request-1", p_input_hash: "a".repeat(64),
      p_recording_id: "recording-1", p_doctor_id: "doctor-1", p_clinic_id: "clinic-1",
      p_input_version: 1, p_max_attempts: 3, p_scheduled_at: null
    });
  });

  it("runs scoped cancellation and stale recovery through controller RPCs", async () => {
    const rpc = vi.fn(async (name: string) => name === "recover_stale_processing_jobs"
      ? { data: 2, error: null }
      : { data: [{ ...durableJobRow, job_state: "cancel_requested" }], error: null });
    const repository = createProcessingJobRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.requestCancellation({ jobId: "job-1", doctorId: "doctor-1",
      clinicId: "clinic-1", expectedVersion: 1 })).resolves.toMatchObject({ lifecycleState: "cancel_requested" });
    await expect(repository.recoverStale({ before: "2026-07-10T10:10:00.000Z", limit: 25 })).resolves.toBe(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "request_processing_job_cancellation", {
      p_job_id: "job-1", p_doctor_id: "doctor-1", p_clinic_id: "clinic-1", p_expected_version: 1
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "recover_stale_processing_jobs", {
      p_before: "2026-07-10T10:10:00.000Z", p_retry_at: null, p_limit: 25
    });
  });

  it("finds stale running leases through the lifecycle lease index", async () => {
    const query = {
      select: vi.fn(),
      in: vi.fn(),
      lte: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
    };
    for (const method of ["select", "in", "lte", "order"] as const) query[method].mockReturnValue(query);
    query.limit.mockResolvedValue({
      data: [{ ...durableJobRow, state: "running", job_state: "running", lease_expires_at: "2026-07-10T10:00:00.000Z" }],
      error: null,
    });
    const repository = createProcessingJobRepository({
      from: vi.fn(() => query),
    } as unknown as SupabaseClient);

    await expect(repository.findStaleRunning({
      before: "2026-07-10T10:10:00.000Z",
      limit: 25,
    })).resolves.toEqual([expect.objectContaining({ id: "job-1", lifecycleState: "running" })]);
    expect(query.in).toHaveBeenCalledWith("job_state", ["running", "cancel_requested"]);
    expect(query.lte).toHaveBeenCalledWith("lease_expires_at", "2026-07-10T10:10:00.000Z");
    expect(query.order).toHaveBeenCalledWith("lease_expires_at", { ascending: true });
    expect(query.limit).toHaveBeenCalledWith(25);
  });

  it("returns a PHI-safe processing status DTO", async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: {
          ...durableJobRow,
          job_state: "failed_terminal",
          completed_at: "2026-07-10T10:02:00.000Z",
          terminal_error_code: "PATIENT_NAME_IN_CODE",
          terminal_error_message: "Patient John Doe failed.",
          result: { patient_id: "P-SECRET" },
          output_reference: { storage_path: "clinic/doctor/P-SECRET.pdf" },
        },
        error: null,
      })),
    };
    const repository = createProcessingJobRepository({
      from: vi.fn(() => query),
    } as unknown as SupabaseClient);

    const dto = await repository.findStatus({ jobId: "job-1", doctorId: "doctor-1", clinicId: "clinic-1" });
    expect(dto).toEqual(expect.objectContaining({
      id: "job-1",
      state: "failed_terminal",
      error: {
        code: "PROCESSING_FAILED",
        message: "Processing could not be completed.",
      },
    }));
    expect(query.select).toHaveBeenCalledWith([
      "id", "operation", "job_state", "attempt", "max_attempts", "scheduled_at",
      "started_at", "completed_at", "next_retry_at", "terminal_error_code",
      "terminal_error_message", "is_stale"
    ].join(","));
    expect(query.eq).toHaveBeenCalledWith("doctor_key", "doctor-1");
    expect(query.eq).toHaveBeenCalledWith("clinic_key", "clinic-1");
    expect(JSON.stringify(dto)).not.toMatch(/John|P-SECRET|storage|lease|result/i);
  });

  it("passes an immutable manifest to the hotfixed RPC and maps its rows", async () => {
    const rpc = vi.fn(async () => ({ data: [{
      chunk_index: 0, expected_count: 1, byte_size: 5, duration_seconds: "1.25",
      checksum: "a".repeat(64), storage_path: "audio/path", state: "pending", transcript: null
    }], error: null }));
    const repository = createProcessingJobRepository({ rpc } as unknown as SupabaseClient);
    const chunks = [{ index: 0, count: 1, bytes: 5, durationSeconds: 1.25,
      checksum: "a".repeat(64), storagePath: "audio/path" }];

    await expect(repository.saveTranscriptionManifest({
      jobId: "job-1", leaseToken: "lease-1", recordingId: "recording-1", chunks
    })).resolves.toEqual([{
      ...chunks[0],
      state: "pending",
      transcript: null,
      providerRequestKey: null,
      errorCode: null,
      errorMessage: null
    }]);
    expect(rpc).toHaveBeenCalledWith("save_transcription_chunk_manifest", {
      p_job_id: "job-1", p_lease_token: "lease-1", p_recording_id: "recording-1", p_chunks: chunks
    });
  });

  it("marks failed transcription chunks through the lease-scoped RPC", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const repository = createProcessingJobRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.markTranscriptionChunkFailed({
      jobId: "job-1",
      leaseToken: "lease-1",
      index: 1,
      errorCode: "UPSTREAM_TIMEOUT",
      errorMessage: "Provider timed out.",
    })).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledWith("fail_transcription_chunk", {
      p_job_id: "job-1",
      p_lease_token: "lease-1",
      p_chunk_index: 1,
      p_error_code: "UPSTREAM_TIMEOUT",
      p_error_message: "Provider timed out.",
    });
  });

  it("reads a doctor and clinic scoped transcription manifest", async () => {
    const jobQuery = {
      select: vi.fn(() => jobQuery),
      eq: vi.fn(() => jobQuery),
      maybeSingle: vi.fn(async () => ({
        data: {
          id: "job-1",
          operation: "transcription",
          state: "failed",
          lease_token: null,
          attempt: 2,
          result: null,
          input_hash: "a".repeat(64),
          created_at: "2026-07-10T10:00:00.000Z",
          recording_key: transcribedRecording.id,
          doctor_key: transcribedRecording.doctor_id,
          clinic_key: transcribedRecording.clinic_id,
          error_code: "INTERNAL_ERROR",
        },
        error: null,
      })),
    };
    const chunkRows = [
      {
        chunk_index: 0,
        expected_count: 3,
        byte_size: 5,
        duration_seconds: "10.5",
        checksum: "b".repeat(64),
        storage_path: "audio/chunk-0.webm",
        state: "completed",
        transcript: "first",
        provider_request_key: "job-1:transcription:0",
        error_code: null,
        error_message: null,
      },
      {
        chunk_index: 2,
        expected_count: 3,
        byte_size: 7,
        duration_seconds: "9.5",
        checksum: "c".repeat(64),
        storage_path: "audio/chunk-2.webm",
        state: "failed",
        transcript: null,
        provider_request_key: "job-1:transcription:2",
        error_code: "UPSTREAM_TIMEOUT",
        error_message: "Provider timed out.",
      },
    ];
    const chunkQuery = {
      select: vi.fn(() => chunkQuery),
      eq: vi.fn(() => chunkQuery),
      order: vi.fn(async () => ({ data: chunkRows, error: null })),
    };
    const supabase = {
      from: vi.fn((table: string) => table === "recording_processing_jobs" ? jobQuery : chunkQuery),
    } as unknown as SupabaseClient;
    const repository = createProcessingJobRepository(supabase);

    await expect(repository.getTranscriptionManifest({
      jobId: "job-1",
      doctorId: transcribedRecording.doctor_id,
      clinicId: transcribedRecording.clinic_id,
    })).resolves.toMatchObject({
      job: {
        id: "job-1",
        recordingId: transcribedRecording.id,
        doctorId: transcribedRecording.doctor_id,
        clinicId: transcribedRecording.clinic_id,
        errorCode: "INTERNAL_ERROR",
      },
      missingChunkIndices: [1],
      failedChunkIndices: [2],
      completedChunkIndices: [0],
      objectPaths: ["audio/chunk-0.webm", "audio/chunk-2.webm"],
      chunks: [
        {
          index: 0,
          durationSeconds: 10.5,
          transcript: "first",
          providerRequestKey: "job-1:transcription:0",
          errorCode: null,
        },
        {
          index: 2,
          durationSeconds: 9.5,
          state: "failed",
          errorCode: "UPSTREAM_TIMEOUT",
          errorMessage: "Provider timed out.",
        },
      ],
    });
    expect(jobQuery.eq).toHaveBeenNthCalledWith(1, "id", "job-1");
    expect(jobQuery.eq).toHaveBeenNthCalledWith(2, "operation", "transcription");
    expect(jobQuery.eq).toHaveBeenNthCalledWith(3, "doctor_key", transcribedRecording.doctor_id);
    expect(jobQuery.eq).toHaveBeenNthCalledWith(4, "clinic_key", transcribedRecording.clinic_id);
    expect(chunkQuery.eq).toHaveBeenCalledWith("job_id", "job-1");
  });
});

describe("createTranscriptionAttemptRepository", () => {
  it("persists failed transcription attempt metadata without transcript content", async () => {
    const { supabase, query } = supabaseForInsert({ error: null });
    const repository = createTranscriptionAttemptRepository(supabase);

    await expect(
      repository.recordFailedAttempt({
        recordingId: transcribedRecording.id,
        doctorId: transcribedRecording.doctor_id,
        clinicId: transcribedRecording.clinic_id,
        requestId: "req-test-123",
        stage: "transcribe_audio",
        errorCode: "INTERNAL_ERROR",
        errorMessage: "Internal server error.",
        errorStatus: 500,
        audioStoragePath: "clinic/doctor/new.webm",
      }),
    ).resolves.toBeUndefined();

    expect(supabase.from).toHaveBeenCalledWith("transcription_attempts");
    expect(query.insert).toHaveBeenCalledWith({
      recording_id: transcribedRecording.id,
      doctor_id: transcribedRecording.doctor_id,
      clinic_id: transcribedRecording.clinic_id,
      request_id: "req-test-123",
      stage: "transcribe_audio",
      error_code: "INTERNAL_ERROR",
      error_message: "Internal server error.",
      error_status: 500,
      audio_storage_path: "clinic/doctor/new.webm",
      audio_size_bytes: null,
      audio_mime_type: null,
      upstream_status: null,
      upstream_code: null,
      upstream_type: null,
      upstream_message: null,
      upstream_param: null,
    });
  });

  it("surfaces failed attempt insert errors to the caller", async () => {
    const { supabase } = supabaseForInsert({
      error: new Error("insert failed"),
    });
    const repository = createTranscriptionAttemptRepository(supabase);

    await expect(
      repository.recordFailedAttempt({
        recordingId: transcribedRecording.id,
        doctorId: transcribedRecording.doctor_id,
        clinicId: transcribedRecording.clinic_id,
        requestId: "req-test-123",
        stage: "transcribe_audio",
        errorCode: "INTERNAL_ERROR",
        errorMessage: "Internal server error.",
        errorStatus: 500,
      }),
    ).rejects.toThrow("insert failed");
  });
});

describe("createSupabaseAudioStorage", () => {
  it("stores iOS AAC/MP4 captures with m4a object names and content types", async () => {
    const { supabase, bucket } = supabaseForStorage({ error: null });
    const repository = createSupabaseAudioStorage(supabase);
    const now = vi.spyOn(Date, "now").mockReturnValue(1_776_000_000_000);

    try {
      await expect(
        repository.uploadRecordingAudio({
          audio: Buffer.from("audio"),
          mimeType: "audio/aac",
          clinicId: "clinic",
          doctorId: "doctor",
          recordingId: "recording",
          filename: "recording.aac",
        }),
      ).resolves.toBe("clinic/doctor/recording-1776000000000.m4a");
    } finally {
      now.mockRestore();
    }

    expect(supabase.storage.from).toHaveBeenCalledWith("audio");
    expect(bucket.upload).toHaveBeenCalledWith(
      "clinic/doctor/recording-1776000000000.m4a",
      Buffer.from("audio"),
      {
        contentType: "audio/aac",
        upsert: false,
      },
    );
  });

  it("downloads stored audio for server-side transcription retries", async () => {
    const { supabase, bucket } = supabaseForStorage({ error: null });
    const repository = createSupabaseAudioStorage(supabase);

    await expect(repository.downloadRecordingAudio("clinic/doctor/recording.wav")).resolves.toEqual({
      audio: Buffer.from("stored audio"),
      mimeType: "audio/wav",
      filename: "recording.wav",
      size: Buffer.byteLength("stored audio"),
    });

    expect(supabase.storage.from).toHaveBeenCalledWith("audio");
    expect(bucket.download).toHaveBeenCalledWith("clinic/doctor/recording.wav");
  });
});
