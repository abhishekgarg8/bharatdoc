export const APP_SHELL_ROUTES = [
  "/",
  "/dashboard",
  "/search",
  "/settings",
  "/settings/language",
  "/settings/prompt",
  "/recordings/new",
  "/onboarding",
  "/pending-approval"
] as const;

export function isAppShellRoute(pathname: string): boolean {
  const normalized = pathname.split("?")[0]?.replace(/\/$/, "") || "/";
  return APP_SHELL_ROUTES.includes(normalized as (typeof APP_SHELL_ROUTES)[number]);
}

export function isRecordAudioAsset(pathname: string, contentType = ""): boolean {
  const normalizedContentType = contentType.toLowerCase();

  return (
    normalizedContentType.startsWith("audio/") ||
    pathname.endsWith("/api/transcribe") ||
    /\.(webm|wav|m4a|mp3|ogg)$/i.test(pathname)
  );
}

export function shouldKeepAudioLocalUntilTranscription({
  hasExplicitTranscriptionIntent,
  pathname,
  contentType
}: {
  hasExplicitTranscriptionIntent: boolean;
  pathname: string;
  contentType?: string;
}): boolean {
  if (!isRecordAudioAsset(pathname, contentType)) {
    return false;
  }

  return !hasExplicitTranscriptionIntent;
}
