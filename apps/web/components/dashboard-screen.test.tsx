import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardScreen } from "@/components/dashboard-screen";
import { demoDashboardRecords, type DashboardRecord } from "@/lib/client/dashboard-data";
import { createMemoryLocalRecordingRepository, type LocalRecording } from "@/lib/client/local-recordings";

describe("DashboardScreen", () => {
  it("renders clinic context and primary recording action", () => {
    render(<DashboardScreen doctorName="Dr. Aparna Iyer" clinicName="Sunrise Hospital, Pune" />);

    expect(screen.getByText("Dr. Aparna Iyer")).toBeInTheDocument();
    expect(screen.getByText("Sunrise Hospital, Pune")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Consultations" })).toBeInTheDocument();
    expect(screen.queryByText("Today's consultations")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start recording/i })).toHaveAttribute("href", "/recordings/new");
    expect(screen.getByRole("link", { name: /search by patient id/i })).toHaveAttribute("href", "/search");
    expect(screen.getByText("all records")).toBeInTheDocument();
    expect(screen.queryByText("hospital")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open settings/i })).toHaveAttribute("href", "/settings");
  });

  it("renders a clear empty state when there are no visible records", () => {
    render(<DashboardScreen records={[]} pendingApprovalsCount={0} />);

    expect(screen.getByText("No consultations yet")).toBeInTheDocument();
    expect(screen.getByText("Start a recording to add the first consultation for this hospital.")).toBeInTheDocument();
    expect(screen.getByText("0 records · 0 pending transcriptions")).toBeInTheDocument();
  });

  it("does not show a settings badge when there are zero pending approvals", () => {
    render(<DashboardScreen pendingApprovalsCount={0} />);

    expect(screen.getByRole("link", { name: /open settings/i })).toHaveTextContent("");
  });

  it("shows the owner pending approval count on the settings link", () => {
    render(<DashboardScreen pendingApprovalsCount={3} />);

    expect(screen.getByRole("link", { name: /open settings/i })).toHaveTextContent("3");
  });

  it("renders recent consultation records with status lifecycle", () => {
    render(<DashboardScreen records={demoDashboardRecords} />);

    expect(screen.getByText("P-10482")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open recording P-10482" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Local recording P-10482: Awaiting transcription")).toBeInTheDocument();
    expect(screen.getByText("Awaiting transcription")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Transcribe recording P-10482" })).toHaveAttribute(
      "href",
      "/recordings/new?local_recording_id=local-p-10482"
    );
    expect(screen.getByText("Transcribed")).toBeInTheDocument();
    expect(screen.getByText("Summary ready")).toBeInTheDocument();
    expect(screen.getByText("PDF saved")).toBeInTheDocument();
  });

  it("renders supplied clinic context and dashboard records", () => {
    const records: DashboardRecord[] = [
      {
        id: "p-20001",
        patientId: "P-20001",
        time: "Today, 12:05",
        duration: "4:18",
        doctorName: "Dr. Nisha",
        status: "recorded",
        recordedAt: "2026-04-23T06:35:00.000Z"
      }
    ];

    render(
      <DashboardScreen
        doctorName="Dr. Nisha Shah"
        clinicName="Care Clinic, Surat"
        records={records}
        pendingApprovalsCount={0}
      />
    );

    expect(screen.getByText("Dr. Nisha Shah")).toBeInTheDocument();
    expect(screen.getByText("Care Clinic, Surat")).toBeInTheDocument();
    expect(screen.getByText("P-20001")).toBeInTheDocument();
    expect(screen.getByText("1 record · 1 pending transcription")).toBeInTheDocument();
  });

  it("constrains long record metadata for narrow mobile cards", () => {
    const records: DashboardRecord[] = [
      {
        id: "local-long-record",
        patientId: "P-12345678901234567890",
        time: "Today, 12:05",
        duration: "1:04:18",
        doctorName: "Dr. Nisha Shah With A Very Long Clinic Display Name",
        status: "recorded",
        offline: true
      }
    ];

    render(<DashboardScreen records={records} pendingApprovalsCount={0} />);

    const patientId = screen.getByText("P-12345678901234567890");
    expect(patientId).toHaveClass("truncate");
    expect(patientId.parentElement).toHaveClass("w-[72px]", "overflow-hidden");
    expect(screen.getByText("Dr. Nisha Shah With A Very Long Clinic Display Name")).toHaveClass("truncate");
  });

  it("confirms before deleting a server-backed consultation", async () => {
    const record: DashboardRecord = {
      id: "p-20001",
      patientId: "P-20001",
      time: "Today, 12:05",
      duration: "4:18",
      doctorName: "Dr. Nisha",
      status: "transcribed",
      recordedAt: "2026-04-23T06:35:00.000Z",
      canEdit: true
    };
    const deleteRecording = vi.fn(async () => undefined);

    render(<DashboardScreen records={[record]} onDeleteRecording={deleteRecording} pendingApprovalsCount={0} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete consultation P-20001" }));
    expect(screen.getByText("Delete this consultation and recording?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(deleteRecording).toHaveBeenCalledWith(record));
  });

  it("hides delete controls for read-only same-clinic consultations", () => {
    render(
      <DashboardScreen
        records={[
          {
            id: "p-20001",
            patientId: "P-20001",
            time: "Today, 12:05",
            duration: "4:18",
            doctorName: "Dr. Nisha",
            status: "transcribed",
            recordedAt: "2026-04-23T06:35:00.000Z",
            canEdit: false
          }
        ]}
        onDeleteRecording={vi.fn()}
        pendingApprovalsCount={0}
      />
    );

    expect(screen.queryByRole("button", { name: "Delete consultation P-20001" })).not.toBeInTheDocument();
  });

  it("merges local device recordings into the dashboard", async () => {
    const localRecording: LocalRecording = {
      id: "local-recording",
      authUserId: "auth-user-1",
      doctorId: "doctor-1",
      clinicId: "clinic-1",
      patientId: "P-LOCAL",
      label: null,
      durationSeconds: 30,
      recordedAt: "2026-04-23T08:00:00.000Z",
      updatedAt: "2026-04-23T08:00:00.000Z",
      audioBlob: new Blob(["audio"], { type: "audio/webm" }),
      audioChunks: [new Blob(["audio"], { type: "audio/webm" })],
      audioMimeType: "audio/webm",
      captureState: "stopped",
      syncState: "local",
      serverRecordingId: null,
      transcript: null,
      error: null
    };
    const localRepository = createMemoryLocalRecordingRepository([localRecording]);

    render(
      <DashboardScreen
        records={[]}
        localRepository={localRepository}
        localRecordingScope={{ authUserId: "auth-user-1", doctorId: "doctor-1", clinicId: "clinic-1" }}
        pendingApprovalsCount={0}
      />
    );

    await expect(screen.findByText("P-LOCAL")).resolves.toBeInTheDocument();
    expect(screen.getByLabelText("Stored offline")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open recording P-LOCAL" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Transcribe recording P-LOCAL" })).toHaveAttribute(
      "href",
      "/recordings/new?local_recording_id=local-recording"
    );
  });

  it("uses state-specific local recording actions with exact local IDs", () => {
    const record = (id: string, patientId: string, localCaptureState: LocalRecording["captureState"]): DashboardRecord => ({
      id,
      patientId,
      time: "Today, 12:05",
      duration: "0:30",
      doctorName: "You",
      status: "recorded",
      offline: true,
      localRecordingId: id,
      localCaptureState
    });

    render(
      <DashboardScreen
        records={[
          record("local-stopped", "P-STOPPED", "stopped"),
          record("local-failed", "P-FAILED", "failed"),
          record("local-paused", "P-PAUSED", "paused"),
          record("local-transcribing", "P-TRANSCRIBING", "transcribing")
        ]}
      />
    );

    expect(screen.getByRole("link", { name: "Transcribe recording P-STOPPED" })).toHaveAttribute(
      "href",
      "/recordings/new?local_recording_id=local-stopped"
    );
    expect(screen.getByRole("link", { name: "Retry recording P-FAILED" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resume recording P-PAUSED" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue recording P-TRANSCRIBING" })).toBeInTheDocument();
  });

  it("deletes local device recordings from IndexedDB after confirmation", async () => {
    const localRecording: LocalRecording = {
      id: "local-recording",
      authUserId: "auth-user-1",
      doctorId: "doctor-1",
      clinicId: "clinic-1",
      patientId: "P-LOCAL",
      label: null,
      durationSeconds: 30,
      recordedAt: "2026-04-23T08:00:00.000Z",
      updatedAt: "2026-04-23T08:00:00.000Z",
      audioBlob: new Blob(["audio"], { type: "audio/webm" }),
      audioChunks: [new Blob(["audio"], { type: "audio/webm" })],
      audioMimeType: "audio/webm",
      captureState: "stopped",
      syncState: "local",
      serverRecordingId: null,
      transcript: null,
      error: null
    };
    const localRepository = createMemoryLocalRecordingRepository([localRecording]);

    render(
      <DashboardScreen
        records={[]}
        localRepository={localRepository}
        localRecordingScope={{ authUserId: "auth-user-1", doctorId: "doctor-1", clinicId: "clinic-1" }}
        pendingApprovalsCount={0}
      />
    );

    await screen.findByText("P-LOCAL");
    fireEvent.click(screen.getByRole("button", { name: "Delete consultation P-LOCAL" }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(screen.queryByText("P-LOCAL")).not.toBeInTheDocument());
    await expect(localRepository.list()).resolves.toHaveLength(0);
  });

  it("does not render unscoped or foreign local recordings when an authenticated scope is provided", async () => {
    const matchingRecording: LocalRecording = {
      id: "matching-local-recording",
      authUserId: "auth-user-1",
      doctorId: "doctor-1",
      clinicId: "clinic-1",
      patientId: "P-MATCH",
      label: null,
      durationSeconds: 30,
      recordedAt: "2026-04-23T08:00:00.000Z",
      updatedAt: "2026-04-23T08:00:00.000Z",
      audioBlob: new Blob(["audio"], { type: "audio/webm" }),
      audioChunks: [new Blob(["audio"], { type: "audio/webm" })],
      audioMimeType: "audio/webm",
      captureState: "stopped",
      syncState: "local",
      serverRecordingId: null,
      transcript: null,
      error: null
    };
    const localRepository = createMemoryLocalRecordingRepository([
      matchingRecording,
      {
        ...matchingRecording,
        id: "foreign-local-recording",
        doctorId: "doctor-2",
        patientId: "P-FOREIGN"
      },
      {
        ...matchingRecording,
        id: "legacy-local-recording",
        authUserId: null,
        doctorId: null,
        clinicId: null,
        patientId: "P-LEGACY"
      }
    ]);

    render(
      <DashboardScreen
        records={[]}
        localRepository={localRepository}
        localRecordingScope={{
          authUserId: "auth-user-1",
          doctorId: "doctor-1",
          clinicId: "clinic-1"
        }}
        pendingApprovalsCount={0}
      />
    );

    await expect(screen.findByText("P-MATCH")).resolves.toBeInTheDocument();
    expect(screen.queryByText("P-FOREIGN")).not.toBeInTheDocument();
    expect(screen.queryByText("P-LEGACY")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Local recording recovery" })).toBeInTheDocument();
  });

  it("masks quarantined local recordings until the user confirms ownership", async () => {
    const localRecording: LocalRecording = {
      id: "legacy-local-recording",
      authUserId: null,
      doctorId: null,
      clinicId: null,
      patientId: "P-LEGACY",
      label: "Legacy patient label",
      durationSeconds: 30,
      recordedAt: "2026-04-23T08:00:00.000Z",
      updatedAt: "2026-04-23T08:00:00.000Z",
      audioBlob: new Blob(["audio"], { type: "audio/webm" }),
      audioChunks: [new Blob(["audio"], { type: "audio/webm" })],
      audioMimeType: "audio/webm",
      captureState: "stopped",
      syncState: "local",
      serverRecordingId: null,
      transcript: null,
      error: null
    };
    const localRepository = createMemoryLocalRecordingRepository([localRecording]);

    render(
      <DashboardScreen
        records={[]}
        localRepository={localRepository}
        localRecordingScope={{
          authUserId: "auth-user-1",
          doctorId: "doctor-1",
          clinicId: "clinic-1"
        }}
        pendingApprovalsCount={0}
      />
    );

    await expect(screen.findByLabelText("Local recording recovery")).resolves.toBeInTheDocument();
    expect(screen.getByText("1 hidden local recording")).toBeInTheDocument();
    expect(screen.getByText("Kept separate until you confirm ownership or delete safely.")).toBeInTheDocument();
    expect(screen.queryByText("P-LEGACY")).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy patient label")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Review recovery" }));
    expect(screen.getByText("Patient IDs stay hidden until you recover a recording to this account.")).toBeInTheDocument();
    expect(screen.getByText("Older local recording")).toBeInTheDocument();
    expect(screen.queryByText("P-LEGACY")).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy patient label")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm ownership of hidden local recording" }));
    await expect(screen.findByText("P-LEGACY")).resolves.toBeInTheDocument();
    expect(screen.queryByLabelText("Local recording recovery")).not.toBeInTheDocument();
    await expect(localRepository.get("legacy-local-recording")).resolves.toMatchObject({
      authUserId: "auth-user-1",
      doctorId: "doctor-1",
      clinicId: "clinic-1"
    });
  });
});
