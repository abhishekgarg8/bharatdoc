import { describe, expect, it, vi } from "vitest";
import { proxySummaryRequest } from "@/lib/server/worker-summary-proxy";

describe("worker summary proxy", () => {
  it("forwards summary requests to the Railway worker", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        recording_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        summary: "Chief Complaint: Fever",
        status: "summary_ready"
      })
    ) as unknown as typeof fetch;

    await expect(
      proxySummaryRequest({
        recordingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        bearerToken: "id-token",
        workerBaseUrl: "https://worker.example.com/",
        fetcher
      })
    ).resolves.toEqual({
      recording_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      summary: "Chief Complaint: Fever",
      status: "summary_ready"
    });

    expect(fetcher).toHaveBeenCalledWith("https://worker.example.com/api/summarize", {
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
      proxySummaryRequest({
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
      Response.json({ error: { code: "TRANSCRIPT_REQUIRED" } }, { status: 400 })
    ) as unknown as typeof fetch;

    await expect(
      proxySummaryRequest({
        recordingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        bearerToken: "id-token",
        workerBaseUrl: "https://worker.example.com",
        fetcher
      })
    ).rejects.toMatchObject({
      status: 400,
      code: "TRANSCRIPT_REQUIRED"
    });
  });
});
