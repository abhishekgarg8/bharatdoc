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

export async function transcribeRecordingAudio(
  idToken: string,
  recordingId: string,
  audio: Blob,
  mimeType: string,
  fetcher: typeof fetch = fetch
): Promise<WorkerTranscriptionResponse> {
  const body = new FormData();
  body.set("audio", audio, `recording.${mimeType.includes("mp4") ? "m4a" : "webm"}`);

  const response = await fetcher(`/api/recordings/${encodeURIComponent(recordingId)}/transcription`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`
    },
    body
  });

  return parseJson<WorkerTranscriptionResponse>(response, "Unable to transcribe recording.");
}
