import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

describe("ServiceWorkerRegistration", () => {
  it("registers the owned root-scoped worker", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register }
    });

    render(<ServiceWorkerRegistration enabled />);

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith("/service-worker.js", { scope: "/", updateViaCache: "none" })
    );
  });
});
