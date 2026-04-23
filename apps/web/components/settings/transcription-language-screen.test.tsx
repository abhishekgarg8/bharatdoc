import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranscriptionLanguageScreen } from "@/components/settings/transcription-language-screen";

describe("TranscriptionLanguageScreen", () => {
  it("renders supported language options", () => {
    render(<TranscriptionLanguageScreen />);

    expect(screen.getByRole("heading", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /auto-detect/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /hinglish/i })).toBeInTheDocument();
  });

  it("saves the selected language through the preferences API", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ preferences: { custom_prompt: null, transcription_lang: "en" } })
    ) as unknown as typeof fetch;

    render(<TranscriptionLanguageScreen idToken="id-token" fetcher={fetcher} />);
    fireEvent.click(screen.getByText("English"));
    fireEvent.click(screen.getByRole("button", { name: /save language/i }));

    await screen.findByText("Transcription language saved.");
    expect(fetcher).toHaveBeenCalledWith("/api/settings/preferences", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ transcription_lang: "en" })
    });
  });
});
