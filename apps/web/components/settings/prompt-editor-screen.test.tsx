import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromptEditorScreen } from "@/components/settings/prompt-editor-screen";

describe("PromptEditorScreen", () => {
  it("validates that prompts contain the transcript placeholder", () => {
    render(<PromptEditorScreen initialPrompt="Summarize {{transcript}}" />);

    fireEvent.change(screen.getByRole("textbox", { name: /prompt/i }), {
      target: { value: "Summarize this consultation" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save prompt/i }));

    expect(screen.getByText("Add {{transcript}} where the transcript should be inserted.")).toBeInTheDocument();
  });

  it("saves valid custom prompts through the preferences API", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ preferences: { custom_prompt: "Summarize {{transcript}}", transcription_lang: "auto" } })
    ) as unknown as typeof fetch;

    render(<PromptEditorScreen initialPrompt="Summarize {{transcript}}" idToken="id-token" fetcher={fetcher} />);
    fireEvent.click(screen.getByRole("button", { name: /save prompt/i }));

    await screen.findByText("Summary prompt saved.");
    expect(fetcher).toHaveBeenCalledWith("/api/settings/preferences", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ custom_prompt: "Summarize {{transcript}}" })
    });
  });

  it("renders a sample prompt preview", async () => {
    render(<PromptEditorScreen initialPrompt="Summarize {{transcript}}" />);

    fireEvent.click(screen.getByRole("button", { name: /test sample/i }));

    await waitFor(() => expect(screen.getByText(/Patient reports fever/)).toBeInTheDocument());
  });
});
