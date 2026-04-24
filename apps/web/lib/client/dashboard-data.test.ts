import { describe, expect, it, vi } from "vitest";
import {
  createRecordingMetadata,
  fetchDashboardRecords,
  fetchDashboardSnapshot,
  formatRecordingDuration,
  mapApiRecordingToDashboardRecord,
  mergeDashboardRecords,
  searchPatientRecords,
  type DashboardApiRecord,
  type DashboardRecord,
  type LocalDashboardRecord
} from "@/lib/client/dashboard-data";
import type { Doctor } from "@bharatdoc/shared";

const apiRecord: DashboardApiRecord = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  patient_id: "P-10482",
  label: null,
  duration_seconds: 494,
  doctor_name: "Dr. Aparna",
  status: "recorded",
  recorded_at: "2026-04-23T06:12:00.000Z"
};

const doctor: Doctor = {
  id: "11111111-1111-4111-8111-111111111111",
  firebase_uid: "firebase-doctor",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  role: "doctor",
  account_status: "active",
  name: "Dr. Aparna",
  specialization: "General Physician",
  medical_reg_no: null,
  phone: "+919876543210",
  profile_photo_path: null,
  custom_prompt: null,
  transcription_lang: "auto",
  created_at: "2026-04-23T09:00:00.000Z"
};

describe("dashboard data helpers", () => {
  it("formats recording durations for dashboard cards", () => {
    expect(formatRecordingDuration(494)).toBe("8:14");
    expect(formatRecordingDuration(3671)).toBe("1:01:11");
    expect(formatRecordingDuration(null)).toBe("--");
  });

  it("maps API recordings into display records", () => {
    const record = mapApiRecordingToDashboardRecord(apiRecord, new Date("2026-04-23T09:00:00.000Z"));

    expect(record).toMatchObject({
      id: apiRecord.id,
      patientId: "P-10482",
      duration: "8:14",
      doctorName: "Dr. Aparna",
      status: "recorded",
      recordedAt: apiRecord.recorded_at
    });
    expect(record.time).toContain("Today");
  });

  it("merges local offline records before synced duplicates", () => {
    const synced: DashboardRecord[] = [
      {
        id: "same-record",
        patientId: "P-10001",
        time: "Today, 10:00",
        duration: "2:00",
        doctorName: "You",
        status: "transcribed",
        recordedAt: "2026-04-23T04:30:00.000Z"
      },
      {
        id: "server-only",
        patientId: "P-10002",
        time: "Today, 09:00",
        duration: "3:00",
        doctorName: "You",
        status: "summary_ready",
        recordedAt: "2026-04-23T03:30:00.000Z"
      }
    ];
    const local: LocalDashboardRecord[] = [
      {
        id: "same-record",
        patientId: "P-10001",
        time: "Today, 10:01",
        duration: "2:03",
        doctorName: "You",
        status: "recorded",
        recordedAt: "2026-04-23T04:31:00.000Z",
        offline: true
      }
    ];

    const merged = mergeDashboardRecords(synced, local);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ id: "same-record", offline: true, status: "recorded" });
    expect(merged[1]).toMatchObject({ id: "server-only" });
  });

  it("fetches dashboard records with a bearer token", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ records: [apiRecord] }), { status: 200 })) as unknown as typeof fetch;

    await expect(fetchDashboardRecords("id-token", fetcher)).resolves.toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith("/api/recordings", {
      headers: {
        Authorization: "Bearer id-token"
      }
    });
  });

  it("fetches dashboard snapshot with doctor context and records in one request", async () => {
    const fetcher = vi.fn(async () => Response.json({ doctor, records: [apiRecord] })) as unknown as typeof fetch;

    await expect(fetchDashboardSnapshot("id-token", fetcher)).resolves.toMatchObject({
      doctor,
      records: [
        {
          id: apiRecord.id,
          patientId: "P-10482",
          doctorName: "Dr. Aparna"
        }
      ]
    });
    expect(fetcher).toHaveBeenCalledWith("/api/dashboard", {
      headers: {
        Authorization: "Bearer id-token"
      }
    });
  });

  it("creates recording metadata through the authenticated API", async () => {
    const fetcher = vi.fn(async () => Response.json({ record: apiRecord }, { status: 201 })) as unknown as typeof fetch;
    const input = {
      id: apiRecord.id,
      patient_id: "P-10482",
      duration_seconds: 494,
      recorded_at: apiRecord.recorded_at
    };

    await expect(createRecordingMetadata("id-token", input, fetcher)).resolves.toMatchObject({
      id: apiRecord.id,
      patientId: "P-10482"
    });
    expect(fetcher).toHaveBeenCalledWith("/api/recordings", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });
  });

  it("searches patient records through the clinic-scoped API", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ records: [apiRecord] }), { status: 200 })) as unknown as typeof fetch;

    await expect(searchPatientRecords("id-token", "P-10482", fetcher)).resolves.toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith("/api/patients/search?patient_id=P-10482", {
      headers: {
        Authorization: "Bearer id-token"
      }
    });
  });
});
