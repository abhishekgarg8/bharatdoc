import { describe, expect, it, vi } from "vitest";
import { proxyPdfRequest } from "@/lib/server/worker-pdf-proxy";

describe("worker PDF proxy", () => {
  it("forwards PDF requests to the Railway worker", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        recording_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        pdf_storage_path: "clinic/doctor/recording.pdf",
        signed_url: "https://signed.example.com/recording.pdf",
        status: "pdf_saved"
      })
    ) as unknown as typeof fetch;

    await expect(
      proxyPdfRequest({
        recordingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        bearerToken: "id-token",
        workerBaseUrl: "https://worker.example.com/",
        fetcher
      })
    ).resolves.toEqual({
      recording_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      pdf_storage_path: "clinic/doctor/recording.pdf",
      signed_url: "https://signed.example.com/recording.pdf",
      status: "pdf_saved"
    });

    expect(fetcher).toHaveBeenCalledWith("https://worker.example.com/api/generate-pdf", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        recording_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      })
    });
  });

  it("requires recording ids before forwarding", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;

    await expect(
      proxyPdfRequest({
        recordingId: "  ",
        bearerToken: "id-token",
        workerBaseUrl: "https://worker.example.com",
        fetcher
      })
    ).rejects.toMatchObject({ code: "RECORDING_ID_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps worker errors into app errors", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ error: { code: "SUMMARY_REQUIRED" } }, { status: 400 })
    ) as unknown as typeof fetch;

    await expect(
      proxyPdfRequest({
        recordingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        bearerToken: "id-token",
        workerBaseUrl: "https://worker.example.com",
        fetcher
      })
    ).rejects.toMatchObject({
      status: 400,
      code: "SUMMARY_REQUIRED"
    });
  });
});
