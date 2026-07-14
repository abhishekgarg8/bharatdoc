import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ chat: vi.fn(), transcribe: vi.fn(), toFile: vi.fn() }));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: mocks.chat } };
    audio = { transcriptions: { create: mocks.transcribe } };
  }
}));
vi.mock("openai/uploads", () => ({ toFile: mocks.toFile }));

import { createOpenAISummaryClient, createOpenAITranscriptionClient } from "../openai.js";

describe("OpenAI clients", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends summary requests with idempotency and trims the response", async () => {
    mocks.chat.mockResolvedValue({ choices: [{ message: { content: "  summary  " } }] });
    await expect(createOpenAISummaryClient("key", "summary-model").summarize({
      prompt: "Summarize", recording: {} as never, doctor: {} as never, idempotencyKey: "summary-1"
    })).resolves.toBe("summary");
    expect(mocks.chat).toHaveBeenCalledWith(expect.objectContaining({ model: "summary-model" }), { idempotencyKey: "summary-1" });
  });

  it("converts audio and sends transcription options", async () => {
    const audio = Buffer.from("audio");
    mocks.toFile.mockResolvedValue({ name: "visit.webm" });
    mocks.transcribe.mockResolvedValue({ text: "  transcript  " });
    await expect(createOpenAITranscriptionClient("key", "transcribe-model").transcribe({
      audio, filename: "visit.webm", mimeType: "audio/webm", language: "hi", idempotencyKey: "transcribe-1"
    })).resolves.toBe("transcript");
    expect(mocks.toFile).toHaveBeenCalledWith(audio, "visit.webm", { type: "audio/webm" });
    expect(mocks.transcribe).toHaveBeenCalledWith(expect.objectContaining({ model: "transcribe-model", language: "hi" }), { idempotencyKey: "transcribe-1" });
  });
});
