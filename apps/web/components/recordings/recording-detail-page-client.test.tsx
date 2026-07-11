import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordingDetailPageClient } from "@/components/recordings/recording-detail-page-client";
import type { AuthClient } from "@/lib/client/auth-client";
import type { Doctor } from "@bharatdoc/shared";
import { createMemoryLocalRecordingRepository } from "@/lib/client/local-recordings";
import { clearSearchNavigationState, readSearchNavigationState, saveSearchNavigationState } from "@/lib/client/search-navigation-state";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  window.history.pushState({}, "", "/");
  Object.defineProperty(document, "referrer", { configurable: true, value: "" });
  clearSearchNavigationState();
});

const activeDoctor: Doctor = {
  id: "11111111-1111-4111-8111-111111111111",
  firebase_uid: "firebase-doctor",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  role: "doctor",
  account_status: "active",
  name: "Dr. Nisha Shah",
  specialization: "General Physician",
  phone: "+919876543210",
  profile_photo_path: null,
  custom_prompt: null,
  transcription_lang: "auto",
  created_at: "2026-04-23T09:00:00.000Z"
};

const apiRecording = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  patient_id: "P-20001",
  label: null,
  duration_seconds: 180,
  doctor_name: "Dr. Nisha Shah",
  can_edit: true,
  status: "transcribed",
  recorded_at: "2026-04-23T06:12:00.000Z",
  transcript: "Patient reports fever.",
  summary: null,
  has_pdf: false,
  pdf_generated_at: null,
  pdf_version: null,
  pdf_signed_url: null
};

describe("RecordingDetailPageClient", () => {
  it("loads authenticated recording detail", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => {
      return Response.json({ doctor: activeDoctor, recording: apiRecording });
    }) as unknown as typeof fetch;

    render(
      <RecordingDetailPageClient
        recordingId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        authClient={authClient}
        fetcher={fetcher}
      />
    );

    await expect(screen.findByRole("heading", { name: "P-20001" })).resolves.toBeInTheDocument();
    expect(screen.getByText("Patient reports fever.")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/recordings/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
      headers: { Authorization: "Bearer id-token" }
    });
  });

  it("returns search-origin users through browser history from recording detail", async () => {
    window.history.pushState({}, "", "/search");
    window.history.pushState({}, "", `/recordings/${apiRecording.id}`);
    Object.defineProperty(document, "referrer", {
      configurable: true,
      value: `${window.location.origin}/search`
    });
    const historyBack = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async () => Response.json({ doctor: activeDoctor, recording: apiRecording })) as unknown as typeof fetch;
    saveSearchNavigationState(
      { authUserId: activeDoctor.firebase_uid, doctorId: activeDoctor.id, clinicId: activeDoctor.clinic_id },
      { query: apiRecording.patient_id, records: [{ id: apiRecording.id, patientId: apiRecording.patient_id, time: "Today", duration: "3:00", doctorName: activeDoctor.name, status: "transcribed" }] }
    );

    render(
      <RecordingDetailPageClient
        recordingId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        authClient={authClient}
        fetcher={fetcher}
      />
    );

    await expect(screen.findByRole("heading", { name: "P-20001" })).resolves.toBeInTheDocument();
    expect(screen.getByLabelText("Back to search results")).toHaveAttribute("href", "/search");
    fireEvent.click(screen.getByLabelText("Back to search results"));

    expect(historyBack).toHaveBeenCalledTimes(1);
  });

  it("restores a safe search return link after detail reload without URL parameters", async () => {
    window.history.replaceState({}, "", `/recordings/${apiRecording.id}?returnTo=${encodeURIComponent(`/search?patient_id=${apiRecording.patient_id}`)}#legacy`);
    saveSearchNavigationState(
      { authUserId: activeDoctor.firebase_uid, doctorId: activeDoctor.id, clinicId: activeDoctor.clinic_id },
      { query: apiRecording.patient_id, records: [{ id: apiRecording.id, patientId: apiRecording.patient_id, time: "Today", duration: "3:00", doctorName: activeDoctor.name, status: "transcribed" }] }
    );
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(), getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async () => Response.json({ doctor: activeDoctor, recording: apiRecording })) as unknown as typeof fetch;

    render(<RecordingDetailPageClient recordingId={apiRecording.id} authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findByLabelText("Back to search results")).resolves.toHaveAttribute("href", "/search");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  });

  it("keeps dashboard back navigation when stale search state is for another recording", async () => {
    const scope = { authUserId: activeDoctor.firebase_uid, doctorId: activeDoctor.id, clinicId: activeDoctor.clinic_id };
    saveSearchNavigationState(scope, {
      query: "P-OTHER",
      records: [{ id: "other-recording", patientId: "P-OTHER", time: "Today", duration: "1:00", doctorName: activeDoctor.name, status: "recorded" }]
    });
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(), getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async () => Response.json({ doctor: activeDoctor, recording: apiRecording })) as unknown as typeof fetch;

    render(<RecordingDetailPageClient recordingId={apiRecording.id} authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findByLabelText("Back to dashboard")).resolves.toHaveAttribute("href", "/dashboard");
    expect(screen.queryByLabelText("Back to search results")).not.toBeInTheDocument();
  });

  it("renders demo recording detail only when explicit demo fallback is enabled", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => null)
    };

    render(<RecordingDetailPageClient recordingId="p-10481" authClient={authClient} demoOnMissingToken />);

    await expect(screen.findByRole("heading", { name: "P-10481" })).resolves.toBeInTheDocument();
    expect(screen.getByText(/I have had fever for two days/)).toBeInTheDocument();
  });

  it("shows an error instead of demo detail when authenticated loading fails", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async () => Response.json({ error: { message: "failed" } }, { status: 500 })) as unknown as typeof fetch;

    render(<RecordingDetailPageClient recordingId="p-10481" authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findByText("Unable to load recording.")).resolves.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go back/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^back$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("heading", { name: "P-10481" })).not.toBeInTheDocument();
  });

  it("signs out and redirects to onboarding when recording detail auth is expired", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(async () => undefined),
      getCurrentIdToken: vi.fn(async () => "expired-token")
    };
    const navigate = vi.fn();
    const fetcher = vi.fn(async () =>
      Response.json({ error: { code: "AUTH_REQUIRED", message: "Supabase token verification failed." } }, { status: 401 })
    ) as unknown as typeof fetch;

    render(
      <RecordingDetailPageClient
        recordingId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        authClient={authClient}
        fetcher={fetcher}
        onNavigate={navigate}
      />
    );

    await waitFor(() => expect(authClient.signOut).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenCalledWith("/signup");
    expect(screen.queryByText("Unable to load recording.")).not.toBeInTheDocument();
  });

  it("retries transcription from local audio when a server recording has no transcript", async () => {
    vi.stubEnv("NEXT_PUBLIC_RAILWAY_WORKER_URL", "https://worker.example.com");
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const repository = createMemoryLocalRecordingRepository([
      {
        id: "local-recording",
        authUserId: activeDoctor.firebase_uid,
        doctorId: activeDoctor.id,
        clinicId: activeDoctor.clinic_id,
        patientId: "P-20001",
        label: null,
        durationSeconds: 180,
        recordedAt: "2026-04-23T06:12:00.000Z",
        updatedAt: "2026-04-23T06:13:00.000Z",
        audioBlob: new Blob(["audio"], { type: "audio/webm" }),
        audioChunks: [],
        audioMimeType: "audio/webm",
        captureState: "stopped",
        syncState: "synced",
        serverRecordingId: apiRecording.id,
        transcript: null,
        error: null
      }
    ]);
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => {
      const url = _input.toString();

      if (url === `/api/recordings/${apiRecording.id}`) {
        return Response.json({
          doctor: activeDoctor,
          recording: {
            ...apiRecording,
            status: "recorded",
            transcript: null
          }
        });
      }

      if (url === "https://worker.example.com/api/transcribe") {
        return Response.json({
          recording_id: apiRecording.id,
          transcript: "Generated transcript from local audio.",
          audio_storage_path: "hospital/doctor/recording.webm",
          status: "transcribed"
        });
      }

      return Response.json({ error: { message: "Unexpected request" } }, { status: 500 });
    }) as unknown as typeof fetch;

    render(
      <RecordingDetailPageClient
        recordingId={apiRecording.id}
        authClient={authClient}
        fetcher={fetcher}
        localRepository={repository}
      />
    );

    await screen.findByText("Transcript is not available yet.");
    const generateButton = screen.getByRole("button", { name: /generate/i });
    expect(generateButton).toBeEnabled();
    fireEvent.click(generateButton);

    await expect(screen.findByText("Generated transcript from local audio.")).resolves.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("https://worker.example.com/api/transcribe", expect.objectContaining({
      method: "POST",
      headers: {
        Authorization: "Bearer id-token",
        "Idempotency-Key": `${apiRecording.id}:transcription:v1`
      },
      body: expect.any(FormData)
    }));
    await expect(repository.get("local-recording")).resolves.toBeNull();
  });

  it("does not retry transcription from foreign scoped local audio", async () => {
    vi.stubEnv("NEXT_PUBLIC_RAILWAY_WORKER_URL", "https://worker.example.com");
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const repository = createMemoryLocalRecordingRepository([
      {
        id: "foreign-local-recording",
        authUserId: "other-auth-user",
        doctorId: "33333333-3333-4333-8333-333333333333",
        clinicId: activeDoctor.clinic_id,
        patientId: "P-FOREIGN",
        label: null,
        durationSeconds: 180,
        recordedAt: "2026-04-23T06:12:00.000Z",
        updatedAt: "2026-04-23T06:13:00.000Z",
        audioBlob: new Blob(["foreign-audio"], { type: "audio/webm" }),
        audioChunks: [],
        audioMimeType: "audio/webm",
        captureState: "stopped",
        syncState: "synced",
        serverRecordingId: apiRecording.id,
        transcript: null,
        error: null
      }
    ]);
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const url = _input.toString();

      if (url === `/api/recordings/${apiRecording.id}`) {
        return Response.json({
          doctor: activeDoctor,
          recording: {
            ...apiRecording,
            status: "recorded",
            transcript: null
          }
        });
      }

      if (url === "https://worker.example.com/api/transcribe") {
        expect(init?.headers).toEqual({
          Authorization: "Bearer id-token",
          "Content-Type": "application/json",
          "Idempotency-Key": `${apiRecording.id}:transcription:v1`
        });
        expect(init?.body).toBe(
          JSON.stringify({
            recording_id: apiRecording.id,
            source: "stored_audio"
          })
        );

        return Response.json({
          recording_id: apiRecording.id,
          transcript: "Generated transcript from stored audio.",
          audio_storage_path: "hospital/doctor/recording.wav",
          status: "transcribed"
        });
      }

      return Response.json({ accepted: 1 }, { status: 202 });
    }) as unknown as typeof fetch;

    render(
      <RecordingDetailPageClient
        recordingId={apiRecording.id}
        authClient={authClient}
        fetcher={fetcher}
        localRepository={repository}
      />
    );

    await screen.findByText("Transcript is not available yet.");
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await expect(screen.findByText("Generated transcript from stored audio.")).resolves.toBeInTheDocument();
    await expect(repository.get("foreign-local-recording")).resolves.toMatchObject({
      captureState: "stopped",
      syncState: "synced",
      transcript: null
    });
  });

  it("falls back to server-stored audio when local IndexedDB audio is unavailable", async () => {
    vi.stubEnv("NEXT_PUBLIC_RAILWAY_WORKER_URL", "https://worker.example.com");
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const repository = createMemoryLocalRecordingRepository([]);
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const url = _input.toString();

      if (url === `/api/recordings/${apiRecording.id}`) {
        return Response.json({
          doctor: activeDoctor,
          recording: {
            ...apiRecording,
            status: "recorded",
            transcript: null
          }
        });
      }

      if (url === "https://worker.example.com/api/transcribe") {
        expect(init?.headers).toEqual({
          Authorization: "Bearer id-token",
          "Content-Type": "application/json",
          "Idempotency-Key": `${apiRecording.id}:transcription:v1`
        });
        expect(init?.body).toBe(
          JSON.stringify({
            recording_id: apiRecording.id,
            source: "stored_audio"
          })
        );

        return Response.json({
          recording_id: apiRecording.id,
          transcript: "Generated transcript from stored audio.",
          audio_storage_path: "hospital/doctor/recording.wav",
          status: "transcribed"
        });
      }

      return Response.json({ accepted: 1 }, { status: 202 });
    }) as unknown as typeof fetch;

    render(
      <RecordingDetailPageClient
        recordingId={apiRecording.id}
        authClient={authClient}
        fetcher={fetcher}
        localRepository={repository}
      />
    );

    await screen.findByText("Transcript is not available yet.");
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await expect(screen.findByText("Generated transcript from stored audio.")).resolves.toBeInTheDocument();
  });

  it("redirects rejected users away from recording details", async () => {
    const scope = { authUserId: activeDoctor.firebase_uid, doctorId: activeDoctor.id, clinicId: activeDoctor.clinic_id };
    saveSearchNavigationState(scope, { query: apiRecording.patient_id, records: [] });
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const navigate = vi.fn();
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => {
      return Response.json({ doctor: { ...activeDoctor, account_status: "rejected" }, recording: apiRecording });
    }) as unknown as typeof fetch;

    render(
      <RecordingDetailPageClient
        recordingId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        authClient={authClient}
        fetcher={fetcher}
        onNavigate={navigate}
      />
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/access-rejected"));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(readSearchNavigationState(scope)).toBeNull();
  });

  it("passes read-only same-clinic recordings through to the detail screen", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async () =>
      Response.json({
        doctor: activeDoctor,
        recording: {
          ...apiRecording,
          can_edit: false,
          summary: "Existing summary",
          status: "summary_ready"
        }
      })
    ) as unknown as typeof fetch;

    render(
      <RecordingDetailPageClient
        recordingId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        authClient={authClient}
        fetcher={fetcher}
      />
    );

    await expect(screen.findByText("Read-only")).resolves.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Summary" })).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("deletes authenticated recordings and returns to the dashboard", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const navigate = vi.fn();
    const repository = createMemoryLocalRecordingRepository([
      {
        id: "local-recording",
        authUserId: activeDoctor.firebase_uid,
        doctorId: activeDoctor.id,
        clinicId: activeDoctor.clinic_id,
        patientId: "P-20001",
        label: null,
        durationSeconds: 180,
        recordedAt: "2026-04-23T06:12:00.000Z",
        updatedAt: "2026-04-23T06:13:00.000Z",
        audioBlob: new Blob(["audio"], { type: "audio/webm" }),
        audioChunks: [],
        audioMimeType: "audio/webm",
        captureState: "stopped",
        syncState: "synced",
        serverRecordingId: apiRecording.id,
        transcript: null,
        error: null
      }
    ]);
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const url = _input.toString();

      if (url === `/api/recordings/${apiRecording.id}` && init?.method === "DELETE") {
        return Response.json({ recording_id: apiRecording.id, deletion: {
          id: "receipt-1", state: "completed", error_code: null
        } });
      }

      if (url === `/api/recordings/${apiRecording.id}`) {
        return Response.json({ doctor: activeDoctor, recording: apiRecording });
      }

      return Response.json({ error: { message: "Unexpected request" } }, { status: 500 });
    }) as unknown as typeof fetch;

    render(
      <RecordingDetailPageClient
        recordingId={apiRecording.id}
        authClient={authClient}
        fetcher={fetcher}
        localRepository={repository}
        onNavigate={navigate}
      />
    );

    await screen.findByRole("heading", { name: "P-20001" });
    fireEvent.click(screen.getByRole("button", { name: "Delete consultation" }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(`/api/recordings/${apiRecording.id}`, {
        method: "DELETE",
        headers: { Authorization: "Bearer id-token" }
      })
    );
    await expect(repository.list()).resolves.toHaveLength(0);
    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });

  it("does not delete foreign scoped local artifacts when deleting a server recording", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const navigate = vi.fn();
    const repository = createMemoryLocalRecordingRepository([
      {
        id: "foreign-local-recording",
        authUserId: "other-auth-user",
        doctorId: "33333333-3333-4333-8333-333333333333",
        clinicId: activeDoctor.clinic_id,
        patientId: "P-FOREIGN",
        label: null,
        durationSeconds: 180,
        recordedAt: "2026-04-23T06:12:00.000Z",
        updatedAt: "2026-04-23T06:13:00.000Z",
        audioBlob: new Blob(["audio"], { type: "audio/webm" }),
        audioChunks: [],
        audioMimeType: "audio/webm",
        captureState: "stopped",
        syncState: "synced",
        serverRecordingId: apiRecording.id,
        transcript: null,
        error: null
      }
    ]);
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const url = _input.toString();

      if (url === `/api/recordings/${apiRecording.id}` && init?.method === "DELETE") {
        return Response.json({ recording_id: apiRecording.id, deletion: {
          id: "receipt-1", state: "completed", error_code: null
        } });
      }

      if (url === `/api/recordings/${apiRecording.id}`) {
        return Response.json({ doctor: activeDoctor, recording: apiRecording });
      }

      return Response.json({ error: { message: "Unexpected request" } }, { status: 500 });
    }) as unknown as typeof fetch;

    render(
      <RecordingDetailPageClient
        recordingId={apiRecording.id}
        authClient={authClient}
        fetcher={fetcher}
        localRepository={repository}
        onNavigate={navigate}
      />
    );

    await screen.findByRole("heading", { name: "P-20001" });
    fireEvent.click(screen.getByRole("button", { name: "Delete consultation" }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"));
    await expect(repository.list()).resolves.toHaveLength(1);
  });
});
