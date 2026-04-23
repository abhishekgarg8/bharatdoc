import type { LocalRecordingMetadata } from "@/lib/client/local-recordings";

export interface TranscriptionResponse {
  recording_id: string;
  transcript: string;
}

export interface RecordingTranscriptionInput {
  idToken: string;
  recording: LocalRecordingMetadata;
}

export type RecordingTranscriber = (input: RecordingTranscriptionInput) => Promise<TranscriptionResponse>;

export async function createRemoteRecordingMetadata(
  idToken: string,
  recording: LocalRecordingMetadata,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const response = await fetcher("/api/recordings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id: recording.id,
      patient_id: recording.patientId,
      label: recording.label,
      duration_seconds: recording.durationSeconds,
      recorded_at: recording.recordedAt
    })
  });

  if (!response.ok) {
    throw new Error("Unable to prepare recording for transcription.");
  }
}

export async function requestRecordingTranscription(
  idToken: string,
  recording: LocalRecordingMetadata,
  fetcher: typeof fetch = fetch
): Promise<TranscriptionResponse> {
  if (!recording.audioBlob) {
    throw new Error("Recording audio is required for transcription.");
  }

  const body = new FormData();
  body.set("recording_id", recording.id);
  body.set("audio", recording.audioBlob, `recording-${recording.id}.webm`);

  const response = await fetcher("/api/transcribe", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`
    },
    body
  });

  if (!response.ok) {
    throw new Error("Unable to transcribe recording.");
  }

  return (await response.json()) as TranscriptionResponse;
}

export async function transcribeLocalRecording(
  input: RecordingTranscriptionInput,
  fetcher: typeof fetch = fetch
): Promise<TranscriptionResponse> {
  await createRemoteRecordingMetadata(input.idToken, input.recording, fetcher);
  return requestRecordingTranscription(input.idToken, input.recording, fetcher);
}
