export interface WorkerTranscriptionResponse {
  recording_id: string;
  transcript: string;
  audio_storage_path: string;
  status: "transcribed";
}

async function parseJson<T>(response: Response, errorMessage: string): Promise<T> {
  if (!response.ok) {
    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
}

function workerTranscriptionUrl(): string {
  const workerBaseUrl = process.env.NEXT_PUBLIC_RAILWAY_WORKER_URL?.trim();

  if (!workerBaseUrl) {
    throw new Error("Railway worker URL is not configured.");
  }

  return `${workerBaseUrl.replace(/\/$/, "")}/api/transcribe`;
}

export function audioFilenameExtension(mimeType: string): "m4a" | "ogg" | "wav" | "webm" {
  const normalizedMimeType = mimeType.toLowerCase();

  if (normalizedMimeType.includes("mp4") || normalizedMimeType.includes("m4a")) {
    return "m4a";
  }

  if (normalizedMimeType.includes("ogg")) {
    return "ogg";
  }

  if (normalizedMimeType.includes("wav") || normalizedMimeType.includes("wave")) {
    return "wav";
  }

  return "webm";
}

export async function transcribeRecordingAudio(
  idToken: string,
  recordingId: string,
  audio: Blob,
  mimeType: string,
  fetcher: typeof fetch = fetch
): Promise<WorkerTranscriptionResponse> {
  const body = new FormData();
  body.set("recording_id", recordingId);
  body.set("audio", audio, `recording.${audioFilenameExtension(mimeType)}`);

  const response = await fetcher(workerTranscriptionUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`
    },
    body
  });

  return parseJson<WorkerTranscriptionResponse>(response, "Unable to transcribe recording.");
}
