import { AppError } from "@/lib/server/errors";

export interface WorkerTranscriptionResponse {
  recording_id: string;
  transcript: string;
  audio_storage_path: string;
  status: "transcribed";
}

export interface ProxyTranscriptionRequestInput {
  recordingId: string;
  bearerToken: string;
  workerBaseUrl: string;
  audio: Blob;
  filename?: string;
  fetcher?: typeof fetch;
}

function requireRecordingId(recordingId: string): string {
  const trimmed = recordingId.trim();

  if (!trimmed) {
    throw new AppError(400, "Recording ID is required.", "RECORDING_ID_REQUIRED");
  }

  return trimmed;
}

function requireAudio(audio: Blob): Blob {
  if (!audio.size) {
    throw new AppError(400, "Audio file is required.", "AUDIO_REQUIRED");
  }

  if (!audio.type.startsWith("audio/")) {
    throw new AppError(400, "Audio file must be an audio media type.", "AUDIO_TYPE_INVALID");
  }

  return audio;
}

async function workerErrorCode(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { code?: string } };
    return payload.error?.code ?? "WORKER_TRANSCRIPTION_FAILED";
  } catch {
    return "WORKER_TRANSCRIPTION_FAILED";
  }
}

export async function proxyTranscriptionRequest({
  recordingId,
  bearerToken,
  workerBaseUrl,
  audio,
  filename = "recording.webm",
  fetcher = fetch
}: ProxyTranscriptionRequestInput): Promise<WorkerTranscriptionResponse> {
  const body = new FormData();
  body.set("recording_id", requireRecordingId(recordingId));
  body.set("audio", requireAudio(audio), filename);

  const response = await fetcher(`${workerBaseUrl.replace(/\/$/, "")}/api/transcribe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerToken}`
    },
    body
  });

  if (!response.ok) {
    throw new AppError(response.status, "Unable to transcribe recording.", await workerErrorCode(response));
  }

  return (await response.json()) as WorkerTranscriptionResponse;
}
