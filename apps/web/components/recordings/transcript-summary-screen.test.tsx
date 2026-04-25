import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranscriptSummaryScreen } from "@/components/recordings/transcript-summary-screen";
import type { RecordingDetailRecord } from "@/lib/client/recording-detail-data";

const recording: RecordingDetailRecord = {
  id: "p-10481",
  patientId: "P-10481",
  label: "Fever follow-up",
  time: "Today, 10:55",
  duration: "12:03",
  doctorName: "You",
  status: "transcribed",
  recordedAt: "2026-04-23T05:25:00.000Z",
  transcript: "Patient reports fever for two days.\n\nDoctor advised fluids and paracetamol.",
  summary: null,
  pdfStoragePath: null,
  pdfSignedUrl: null
};

describe("TranscriptSummaryScreen", () => {
  it("renders transcript detail and status context", () => {
    render(<TranscriptSummaryScreen recording={recording} />);

    expect(screen.getByRole("heading", { name: "P-10481" })).toBeInTheDocument();
    expect(screen.getByText("Patient reports fever for two days.")).toBeInTheDocument();
    expect(screen.getByText("Doctor advised fluids and paracetamol.")).toBeInTheDocument();
    expect(screen.getByLabelText("Transcribed")).toBeInTheDocument();
  });

  it("generates summaries and switches to the editable summary view", async () => {
    const generate = vi.fn(async () => ({
      recording_id: recording.id,
      summary: "Chief Complaint\nFever for two days.",
      status: "summary_ready" as const
    }));

    render(<TranscriptSummaryScreen recording={recording} onGenerateSummary={generate} />);

    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Summary" })).toHaveValue("Chief Complaint\nFever for two days.");
    });
    expect(generate).toHaveBeenCalledWith(recording.id);
    expect(screen.getByLabelText("Summary ready")).toBeInTheDocument();
    expect(screen.getByText("Summary generated.")).toBeInTheDocument();
  });

  it("generates a missing transcript before summary generation", async () => {
    const generateTranscript = vi.fn(async () => ({
      recording_id: recording.id,
      transcript: "Generated transcript.",
      audio_storage_path: "hospital/doctor/recording.webm",
      status: "transcribed" as const
    }));

    render(
      <TranscriptSummaryScreen
        recording={{
          ...recording,
          status: "recorded",
          transcript: null
        }}
        onGenerateTranscript={generateTranscript}
      />
    );

    const generateButton = screen.getByRole("button", { name: /generate/i });
    expect(generateButton).toBeEnabled();
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText("Generated transcript.")).toBeInTheDocument();
    });
    expect(generateTranscript).toHaveBeenCalledWith(recording.id);
    expect(screen.getByLabelText("Transcribed")).toBeInTheDocument();
  });

  it("saves edited summaries", async () => {
    const save = vi.fn(async (_recordingId: string, summary: string) => ({
      ...recording,
      summary,
      status: "summary_ready" as const
    }));

    render(
      <TranscriptSummaryScreen
        recording={{
          ...recording,
          summary: "Initial summary",
          status: "summary_ready"
        }}
        onSaveSummary={save}
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), {
      target: { value: "Edited summary" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText("Summary saved.")).toBeInTheDocument();
    });
    expect(save).toHaveBeenCalledWith(recording.id, "Edited summary");
  });

  it("hides stale PDF links after summary edits", async () => {
    const save = vi.fn(async (_recordingId: string, summary: string) => ({
      ...recording,
      summary,
      status: "summary_ready" as const,
      pdfStoragePath: null
    }));

    render(
      <TranscriptSummaryScreen
        recording={{
          ...recording,
          summary: "Initial summary",
          status: "pdf_saved",
          pdfStoragePath: "clinic/doctor/old.pdf",
          pdfSignedUrl: "https://signed.example.com/old.pdf"
        }}
        onSaveSummary={save}
      />
    );

    expect(screen.getByLabelText("PDF saved")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), {
      target: { value: "Edited summary" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText("Summary saved.")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("PDF saved")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open PDF" })).not.toBeInTheDocument();
  });

  it("opens the real signed PDF URL for reloaded saved PDFs", () => {
    render(
      <TranscriptSummaryScreen
        recording={{
          ...recording,
          summary: "Initial summary",
          status: "pdf_saved",
          pdfStoragePath: "clinic/doctor/recording.pdf",
          pdfSignedUrl: "https://signed.example.com/recording.pdf"
        }}
      />
    );

    expect(screen.getByRole("link", { name: "Open PDF" })).toHaveAttribute(
      "href",
      "https://signed.example.com/recording.pdf"
    );
  });

  it("generates PDFs after a summary is saved", async () => {
    const generatePdf = vi.fn(async () => ({
      recording_id: recording.id,
      pdf_storage_path: "clinic/doctor/recording.pdf",
      signed_url: "https://signed.example.com/recording.pdf",
      status: "pdf_saved" as const
    }));

    render(
      <TranscriptSummaryScreen
        recording={{
          ...recording,
          summary: "Chief Complaint\nFever for two days.",
          status: "summary_ready"
        }}
        onGeneratePdf={generatePdf}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "PDF" }));

    await waitFor(() => {
      expect(screen.getByText("PDF generated.")).toBeInTheDocument();
    });
    expect(generatePdf).toHaveBeenCalledWith(recording.id);
    expect(screen.getByLabelText("PDF saved")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open PDF" })).toHaveAttribute(
      "href",
      "https://signed.example.com/recording.pdf"
    );
  });

  it("requires saving edited summaries before PDF generation", () => {
    render(
      <TranscriptSummaryScreen
        recording={{
          ...recording,
          summary: "Initial summary",
          status: "summary_ready"
        }}
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), {
      target: { value: "Edited summary" }
    });
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));

    expect(screen.getByText("Save summary before PDF generation.")).toBeInTheDocument();
  });

  it("shows validation when saving an empty summary", () => {
    render(
      <TranscriptSummaryScreen
        recording={{
          ...recording,
          summary: "Initial summary",
          status: "summary_ready"
        }}
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Summary" }), {
      target: { value: " " }
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(screen.getByText("Summary cannot be empty.")).toBeInTheDocument();
  });
});
