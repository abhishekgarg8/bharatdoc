import type { RecordingStatus } from "@bharatdoc/shared";

export interface DashboardRecord {
  id: string;
  patientId: string;
  time: string;
  duration: string;
  doctorName: string;
  status: RecordingStatus;
  offline?: boolean;
}

export const dashboardRecords: DashboardRecord[] = [
  {
    id: "local-p-10482",
    patientId: "P-10482",
    time: "Today, 11:42",
    duration: "8:14",
    doctorName: "You",
    status: "recorded",
    offline: true
  },
  {
    id: "p-10481",
    patientId: "P-10481",
    time: "Today, 10:55",
    duration: "12:03",
    doctorName: "You",
    status: "transcribed"
  },
  {
    id: "p-10478",
    patientId: "P-10478",
    time: "Today, 09:30",
    duration: "6:47",
    doctorName: "You",
    status: "summary_ready"
  },
  {
    id: "p-10470",
    patientId: "P-10470",
    time: "Yest, 18:20",
    duration: "14:22",
    doctorName: "Dr. Rao",
    status: "pdf_saved"
  }
];
