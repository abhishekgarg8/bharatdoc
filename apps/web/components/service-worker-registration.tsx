"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (enabled && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/service-worker.js", { scope: "/", updateViaCache: "none" });
    }
  }, [enabled]);

  return null;
}
