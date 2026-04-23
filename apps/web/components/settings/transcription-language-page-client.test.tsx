import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TranscriptionLanguagePageClient } from "@/components/settings/transcription-language-page-client";
import type { PhoneAuthClient } from "@/lib/client/phone-auth";

describe("TranscriptionLanguagePageClient", () => {
  it("loads the saved transcription language for authenticated users", async () => {
    const authClient: PhoneAuthClient = {
      sendOtp: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async () =>
      Response.json({
        preferences: {
          custom_prompt: null,
          transcription_lang: "hien"
        }
      })) as unknown as typeof fetch;

    render(<TranscriptionLanguagePageClient authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findByRole("button", { name: /hinglish/i })).resolves.toHaveAttribute("aria-pressed", "true");
  });
});
