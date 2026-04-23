import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromptEditorPageClient } from "@/components/settings/prompt-editor-page-client";
import type { PhoneAuthClient } from "@/lib/client/phone-auth";

describe("PromptEditorPageClient", () => {
  it("loads the saved prompt for authenticated users", async () => {
    const authClient: PhoneAuthClient = {
      sendOtp: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async () =>
      Response.json({
        preferences: {
          custom_prompt: "Summarize {{transcript}} into SOAP.",
          transcription_lang: "auto"
        }
      })) as unknown as typeof fetch;

    render(<PromptEditorPageClient authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findByRole("textbox", { name: "Prompt" })).resolves.toHaveValue("Summarize {{transcript}} into SOAP.");
  });
});
