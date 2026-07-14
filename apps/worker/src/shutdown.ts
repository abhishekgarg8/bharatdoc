export async function gracefullyStopServer(
  worker: { stop(): Promise<void> } | null,
  closeHttp: () => Promise<void>,
  timeoutMs: number
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
    timer.unref?.();
  });
  try {
    return await Promise.race([
      Promise.all([closeHttp(), worker?.stop() ?? Promise.resolve()]).then(() => true as const),
      timeout
    ]);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function idempotentShutdown(action: () => Promise<void>): () => Promise<void> {
  let shutdown: Promise<void> | undefined;
  return () => shutdown ??= action();
}
