import type { RecordingStatus } from "@bharatdoc/shared";
import { formatRecordedAt, formatRecordingDuration } from "@/lib/client/dashboard-data";

export interface RecordingDetailRecord {
  id: string;
  patientId: string;
  label: string | null;
  time: string;
  duration: string;
  doctorName: string;
  status: RecordingStatus;
  recordedAt: string;
  transcript: string | null;
  summary: string | null;
  pdfStoragePath: string | null;
  pdfSignedUrl: string | null;
}

export interface RecordingDetailApiRecord {
  id: string;
  patient_id: string | null;
  label: string | null;
  duration_seconds: number | null;
  doctor_name: string;
  status: RecordingStatus;
  recorded_at: string;
  transcript: string | null;
  summary: string | null;
  pdf_storage_path: string | null;
  pdf_signed_url: string | null;
}

export const demoGeneratedSummary = `Chief Complaint
Fever with mild cough.

History of Present Illness
Patient reports fever for two days with mild cough. No breathlessness was mentioned.

Treatment / Prescription
Fluids and paracetamol were advised.

Follow-up Instructions
Return if fever persists beyond 48 hours or symptoms worsen.`;

export const demoPdfSignedUrl =
  "data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFtdIC9Db3VudCAwID4+CmVuZG9iagp0cmFpbGVyCjw8IC9TaXplIDMgL1Jvb3QgMSAwIFIgPj4KJSVFT0YK";

export const demoRecordingDetails: RecordingDetailRecord[] = [
  {
    id: "p-10481",
    patientId: "P-10481",
    label: "Fever follow-up",
    time: "Today, 10:55",
    duration: "12:03",
    doctorName: "You",
    status: "transcribed",
    recordedAt: "2026-04-23T05:25:00.000Z",
    transcript:
      "Doctor: What brings you in today?\nPatient: I have had fever for two days and a mild cough.\nDoctor: Any breathlessness or chest pain?\nPatient: No, only weakness.\nDoctor: Please take fluids and paracetamol. Come back if fever continues beyond two days.",
    summary: null,
    pdfStoragePath: null,
    pdfSignedUrl: null
  },
  {
    id: "p-10478",
    patientId: "P-10478",
    label: "Clinic consultation",
    time: "Today, 09:30",
    duration: "6:47",
    doctorName: "You",
    status: "summary_ready",
    recordedAt: "2026-04-23T04:00:00.000Z",
    transcript:
      "Patient reports acidity after meals and irregular sleep. Doctor advised meal timing changes and antacid trial.",
    summary: "Chief Complaint\nAcidity after meals.\n\nPlan\nMeal timing changes and antacid trial.",
    pdfStoragePath: null,
    pdfSignedUrl: null
  },
  {
    id: "p-10470",
    patientId: "P-10470",
    label: "Evening consult",
    time: "Yest, 18:20",
    duration: "14:22",
    doctorName: "Dr. Rao",
    status: "pdf_saved",
    recordedAt: "2026-04-22T12:50:00.000Z",
    transcript: "Patient reports recurring headache and eye strain after screen use.",
    summary: "Chief Complaint\nRecurring headache and eye strain.\n\nPlan\nHydration, reduced screen exposure, and eye check-up.",
    pdfStoragePath: "demo/p-10470.pdf",
    pdfSignedUrl: demoPdfSignedUrl
  }
];

export function mapApiRecordingToDetail(recording: RecordingDetailApiRecord, now = new Date()): RecordingDetailRecord {
  return {
    id: recording.id,
    patientId: recording.patient_id ?? recording.label ?? "Unassigned",
    label: recording.label,
    time: formatRecordedAt(recording.recorded_at, now),
    duration: formatRecordingDuration(recording.duration_seconds),
    doctorName: recording.doctor_name,
    status: recording.status,
    recordedAt: recording.recorded_at,
    transcript: recording.transcript,
    summary: recording.summary,
    pdfStoragePath: recording.pdf_storage_path,
    pdfSignedUrl: recording.pdf_signed_url
  };
}

export function findDemoRecordingDetail(id: string): RecordingDetailRecord {
  const fallback = demoRecordingDetails[0]!;

  return (
    demoRecordingDetails.find((recording) => recording.id === id) ?? {
      ...fallback,
      id,
      patientId: id.toUpperCase()
    }
  );
}
