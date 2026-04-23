import { describe, expect, it, vi } from "vitest";
import {
  fetchRecordingDetail,
  generateRecordingPdf,
  saveRecordingSummary,
  summarizeRecording
} from "@/lib/client/summary-api";

const apiRecording = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  patient_id: "P-10483",
  label: "Follow-up",
  duration_seconds: 723,
  doctor_name: "Dr. Aparna Iyer",
  status: "summary_ready" as const,
  recorded_at: "2026-04-23T05:25:00.000Z",
  transcript: "Patient reports fever.",
  summary: "Chief Complaint: Fever",
  pdf_storage_path: null
};

describe("summary client API", () => {
  it("loads recording details", async () => {
    const fetcher = vi.fn(async () => Response.json({ recording: apiRecording })) as unknown as typeof fetch;

    await expect(fetchRecordingDetail("id-token", apiRecording.id, fetcher)).resolves.toMatchObject({
      id: apiRecording.id,
      patientId: "P-10483",
      duration: "12:03",
      transcript: "Patient reports fever.",
      summary: "Chief Complaint: Fever"
    });
    expect(fetcher).toHaveBeenCalledWith(`/api/recordings/${apiRecording.id}`, {
      headers: {
        Authorization: "Bearer id-token"
      }
    });
  });

  it("generates summaries through the recording summary endpoint", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        recording_id: apiRecording.id,
        summary: "Chief Complaint: Fever",
        status: "summary_ready"
      })
    ) as unknown as typeof fetch;

    await expect(summarizeRecording("id-token", apiRecording.id, fetcher)).resolves.toEqual({
      recording_id: apiRecording.id,
      summary: "Chief Complaint: Fever",
      status: "summary_ready"
    });
    expect(fetcher).toHaveBeenCalledWith(`/api/recordings/${apiRecording.id}/summary`, {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token"
      }
    });
  });

  it("saves edited summaries", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        recording: {
          ...apiRecording,
          summary: "Edited summary"
        }
      })
    ) as unknown as typeof fetch;

    await expect(saveRecordingSummary("id-token", apiRecording.id, "Edited summary", fetcher)).resolves.toMatchObject({
      summary: "Edited summary"
    });
    expect(fetcher).toHaveBeenCalledWith(`/api/recordings/${apiRecording.id}/summary`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ summary: "Edited summary" })
    });
  });

  it("generates PDFs through the recording PDF endpoint", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        recording_id: apiRecording.id,
        pdf_storage_path: "clinic/doctor/recording.pdf",
        signed_url: "https://signed.example.com/recording.pdf",
        status: "pdf_saved"
      })
    ) as unknown as typeof fetch;

    await expect(generateRecordingPdf("id-token", apiRecording.id, fetcher)).resolves.toEqual({
      recording_id: apiRecording.id,
      pdf_storage_path: "clinic/doctor/recording.pdf",
      signed_url: "https://signed.example.com/recording.pdf",
      status: "pdf_saved"
    });
    expect(fetcher).toHaveBeenCalledWith(`/api/recordings/${apiRecording.id}/pdf`, {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token"
      }
    });
  });

  it("throws helpful errors for failed requests", async () => {
    const fetcher = vi.fn(async () => Response.json({ error: { code: "TRANSCRIPT_REQUIRED" } }, { status: 400 })) as unknown as typeof fetch;

    await expect(summarizeRecording("id-token", apiRecording.id, fetcher)).rejects.toThrow(
      "Unable to generate summary."
    );
  });
});
