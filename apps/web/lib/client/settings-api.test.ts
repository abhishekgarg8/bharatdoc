import { describe, expect, it, vi } from "vitest";
import { fetchDoctorPreferences, updateDoctorPreferences } from "@/lib/client/settings-api";

describe("settings preferences API client", () => {
  it("loads doctor preferences with a bearer token", async () => {
    const preferences = {
      custom_prompt: null,
      transcription_lang: "auto" as const
    };
    const fetcher = vi.fn(async () => Response.json({ preferences })) as unknown as typeof fetch;

    await expect(fetchDoctorPreferences("id-token", fetcher)).resolves.toEqual(preferences);
    expect(fetcher).toHaveBeenCalledWith("/api/settings/preferences", {
      headers: {
        Authorization: "Bearer id-token"
      }
    });
  });

  it("updates doctor preferences through PATCH", async () => {
    const preferences = {
      custom_prompt: "Summarize {{transcript}}",
      transcription_lang: "hien" as const
    };
    const fetcher = vi.fn(async () => Response.json({ preferences })) as unknown as typeof fetch;

    await expect(
      updateDoctorPreferences("id-token", { custom_prompt: "Summarize {{transcript}}", transcription_lang: "hien" }, fetcher)
    ).resolves.toEqual(preferences);
    expect(fetcher).toHaveBeenCalledWith("/api/settings/preferences", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ custom_prompt: "Summarize {{transcript}}", transcription_lang: "hien" })
    });
  });
});
