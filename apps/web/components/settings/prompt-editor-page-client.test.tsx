import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromptEditorPageClient } from "@/components/settings/prompt-editor-page-client";
import type { AuthClient } from "@/lib/client/auth-client";

describe("PromptEditorPageClient", () => {
  it("loads the saved prompt for authenticated users", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
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

  it("shows an error instead of demo prompt when authenticated loading fails", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async () => Response.json({ error: { message: "failed" } }, { status: 500 })) as unknown as typeof fetch;

    render(<PromptEditorPageClient authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findByText("Unable to load summary prompt. Please sign in again.")).resolves.toBeInTheDocument();
  });
});
