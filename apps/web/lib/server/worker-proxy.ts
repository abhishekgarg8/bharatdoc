import { AppError } from "@/lib/server/errors";

export interface WorkerProxyDependencies {
  workerBaseUrl: string;
  fetcher?: typeof fetch;
  readFormData?: (request: Request) => Promise<FormData>;
}

export interface WorkerTranscriptionResponse {
  recording_id: string;
  transcript: string;
}

function workerUrl(baseUrl: string, pathname: string): string {
  return new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function requireAuthorization(request: Request): string {
  const authorization = request.headers.get("authorization");

  if (!authorization?.match(/^Bearer\s+.+$/i)) {
    throw new AppError(401, "Authorization bearer token is required.", "AUTH_REQUIRED");
  }

  return authorization;
}

function requireString(value: FormDataEntryValue | null, message: string, code: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(400, message, code);
  }

  return value.trim();
}

function requireAudio(value: FormDataEntryValue | null): Blob {
  if (!(value instanceof Blob) || value.size === 0) {
    throw new AppError(400, "Audio file is required.", "AUDIO_REQUIRED");
  }

  return value;
}

export async function proxyTranscriptionRequest(
  request: Request,
  dependencies: WorkerProxyDependencies
): Promise<WorkerTranscriptionResponse> {
  const authorization = requireAuthorization(request);
  const formData = await (dependencies.readFormData ?? ((input: Request) => input.formData()))(request);
  const recordingId = requireString(
    formData.get("recording_id"),
    "Recording ID is required.",
    "RECORDING_ID_REQUIRED"
  );
  const audio = requireAudio(formData.get("audio"));
  const proxiedBody = new FormData();
  proxiedBody.set("recording_id", recordingId);
  proxiedBody.set("audio", audio, `recording-${recordingId}.webm`);

  const response = await (dependencies.fetcher ?? fetch)(workerUrl(dependencies.workerBaseUrl, "/api/transcribe"), {
    method: "POST",
    headers: {
      Authorization: authorization
    },
    body: proxiedBody
  });

  if (!response.ok) {
    throw new AppError(response.status, "Unable to transcribe recording.", "WORKER_TRANSCRIPTION_FAILED");
  }

  return (await response.json()) as WorkerTranscriptionResponse;
}
