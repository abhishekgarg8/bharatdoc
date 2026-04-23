import { describe, expect, it } from "vitest";
import { findDemoRecordingDetail, mapApiRecordingToDetail } from "@/lib/client/recording-detail-data";

describe("recording detail data", () => {
  it("maps API recording detail into display data", () => {
    expect(
      mapApiRecordingToDetail(
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          patient_id: "P-10483",
          label: "Follow-up",
          duration_seconds: 723,
          doctor_name: "Dr. Aparna Iyer",
          status: "summary_ready",
          recorded_at: "2026-04-23T05:25:00.000Z",
          transcript: "Patient reports fever.",
          summary: "Chief Complaint: Fever",
          pdf_storage_path: null
        },
        new Date("2026-04-23T10:00:00.000Z")
      )
    ).toMatchObject({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      patientId: "P-10483",
      duration: "12:03",
      doctorName: "Dr. Aparna Iyer",
      status: "summary_ready",
      transcript: "Patient reports fever.",
      summary: "Chief Complaint: Fever"
    });
  });

  it("finds demo recordings and creates a stable fallback for unknown ids", () => {
    expect(findDemoRecordingDetail("p-10481")).toMatchObject({ patientId: "P-10481" });
    expect(findDemoRecordingDetail("p-99999")).toMatchObject({
      id: "p-99999",
      patientId: "P-99999"
    });
  });
});
